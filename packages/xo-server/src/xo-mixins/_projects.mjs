// @ts-check

// Pure helpers of the tenant model (organizations and projects), kept free of any XO dependency so they
// can be unit tested.

/** Key of the `other_config` entry holding the owning project, set by XO at creation only */
export const PROJECT_OTHER_CONFIG_KEY = 'xo:project'

// set by backup jobs on their snapshots and VDIs: never owned by a project, tenants must not delete them
const BACKUP_JOB_KEY = 'xo:backup:job'

/**
 * The stamp binds the project to the VM it was written for. XAPI copies `other_config` (clones, copies,
 * replicas, imports, templates): such a copy carries the stamp of another VM and is therefore not owned.
 *
 * @param {string} projectId
 * @param {string} vmUuid
 */
export const formatProjectStamp = (projectId, vmUuid) => `${projectId}/${vmUuid}`

/**
 * @param {string | undefined} stamp
 * @returns {{ projectId: string, vmUuid: string } | undefined}
 */
export function parseProjectStamp(stamp) {
  const index = stamp?.lastIndexOf('/') ?? -1
  if (index <= 0) {
    return
  }
  return {
    projectId: /** @type {string} */ (stamp).slice(0, index),
    vmUuid: /** @type {string} */ (stamp).slice(index + 1),
  }
}

/**
 * Project owning a XAPI VM record: a VM whose stamp names it, or a snapshot of such a VM. Templates, control
 * domains and backup snapshots are never owned.
 *
 * @param {any} vm XAPI VM record
 * @returns {string | undefined}
 */
export function getVmRecordProject(vm) {
  if (vm == null || vm.is_a_template || vm.is_control_domain || vm.other_config[BACKUP_JOB_KEY] !== undefined) {
    return
  }
  const stamp = parseProjectStamp(vm.other_config[PROJECT_OTHER_CONFIG_KEY])
  if (stamp === undefined) {
    return
  }
  const identity = vm.is_a_snapshot ? vm.$snapshot_of?.uuid : vm.uuid
  return identity === stamp.vmUuid ? stamp.projectId : undefined
}

/**
 * Project owning a XAPI VDI record: its stamp names a project owning one of the (non CD) VMs it is attached to.
 *
 * @param {any} vdi XAPI VDI record
 * @returns {string | undefined}
 */
export function getVdiRecordProject(vdi) {
  if (vdi.other_config[BACKUP_JOB_KEY] !== undefined) {
    return
  }
  const stamp = parseProjectStamp(vdi.other_config[PROJECT_OTHER_CONFIG_KEY])
  if (stamp === undefined) {
    return
  }
  for (const vbd of vdi.$VBDs ?? []) {
    if (vbd != null && vbd.type !== 'CD' && getVmRecordProject(vbd.$VM) === stamp.projectId) {
      return stamp.projectId
    }
  }
  // a snapshot VDI is created before the VBDs of its snapshot VM: owned through the VDI it is a snapshot of
  if (vdi.is_a_snapshot && vdi.$snapshot_of != null && getVdiRecordProject(vdi.$snapshot_of) === stamp.projectId) {
    return stamp.projectId
  }
}

/** Ordered from the least to the most privileged */
export const PROJECT_ROLES = /** @type {const} */ (['viewer', 'member', 'admin'])

export const ORGANIZATION_ROLES = /** @type {const} */ (['member', 'admin'])

export const PROJECT_ROLE_LABELS = {
  viewer: 'Project viewer',
  member: 'Project member',
  admin: 'Project admin',
}

export const QUOTA_KEYS = /** @type {const} */ (['instances', 'vcpus', 'memory', 'storage', 'snapshots', 'ips'])

/**
 * @param {string | undefined} role
 * @param {string} minRole
 */
export function hasProjectRole(role, minRole) {
  // @ts-expect-error indexOf on a readonly tuple
  return role !== undefined && PROJECT_ROLES.indexOf(role) >= PROJECT_ROLES.indexOf(minRole)
}

/**
 * Complex-matcher selector matching objects owned by a project.
 *
 * String patterns in complex-matcher match substrings, so the id is anchored in a regular expression to avoid
 * a project matching objects of another project whose id contains its own.
 *
 * @param {string} projectId
 */
export function projectSelector(projectId) {
  return `$project:/^${projectId.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$/`
}

const VIEWER_PRIVILEGES = [
  { resource: 'vm', action: 'read' },
  { resource: 'vm-snapshot', action: 'read' },
  { resource: 'vdi', action: 'read' },
  { resource: 'vdi-snapshot', action: 'read' },
  { resource: 'vbd', action: 'read' },
  { resource: 'vif', action: 'read' },
]

const MEMBER_PRIVILEGES = [
  ...VIEWER_PRIVILEGES,
  { resource: 'vm', action: 'start' },
  { resource: 'vm', action: 'shutdown' },
  { resource: 'vm', action: 'reboot' },
  { resource: 'vm', action: 'pause' },
  { resource: 'vm', action: 'unpause' },
  { resource: 'vm', action: 'suspend' },
  { resource: 'vm', action: 'resume' },
  { resource: 'vm', action: 'revert-snapshot' },
  { resource: 'vm', action: 'update:nameLabel' },
  { resource: 'vm', action: 'update:nameDescription' },
  { resource: 'vm', action: 'update:notes' },
]

const ADMIN_PRIVILEGES = [
  ...MEMBER_PRIVILEGES,
  { resource: 'vm', action: 'delete' },
  { resource: 'vm-snapshot', action: 'delete' },
]

// Deliberately not granted to any project role:
// - pool `create:vm`: instances are created through the project, which checks its scope and quota
// - `clone`, `update:cpus`, `update:memory`, VDI `create`/`update:size`: would bypass the quota
// - `migrate-send`, `export`, `update:resourceSet`, `update:share`: infrastructure-level operations
// - `update:tags`: tags select the VMs of backup policies, they are changed through the project
// - `snapshot`: snapshots count in the quota, they are taken through the project
const PRIVILEGES_BY_ROLE = {
  viewer: VIEWER_PRIVILEGES,
  member: MEMBER_PRIVILEGES,
  admin: ADMIN_PRIVILEGES,
}

/**
 * ACL v2 privileges of a project role, all scoped to the objects owned by the project.
 *
 * @param {string} projectId
 * @param {typeof PROJECT_ROLES[number]} role
 */
export function getProjectRolePrivileges(projectId, role) {
  const selector = projectSelector(projectId)
  return PRIVILEGES_BY_ROLE[role].map(privilege => ({ ...privilege, effect: 'allow', selector }))
}

/**
 * Memory counts what is allocated (dynamic max), not `memory.size` which is the actual usage of running VMs.
 *
 * Storage counts the virtual size of the disks of the instances only. Snapshots are limited by their number,
 * like in most clouds: their actual footprint, the data their chain keeps alive, is for usage records.
 *
 * @param {{ type: string, CPUs: { number: number }, memory: { size: number, dynamic?: number[] } }[]} vms objects of type VM or VM-snapshot
 * @param {{ type: string, size: number }[]} vdis objects of type VDI or VDI-snapshot
 * @param {{ $VM: string, allowedIpv4Addresses?: string[] }[]} [vifs] public IPs are the addresses the VIFs of the
 *   instances are locked to (snapshots VIFs keep a copy of them)
 */
export function computeProjectUsage(vms, vdis, vifs = []) {
  const usage = { instances: 0, vcpus: 0, memory: 0, storage: 0, snapshots: 0, ips: 0 }
  for (const vm of vms) {
    if (vm.type === 'VM') {
      usage.instances++
      usage.vcpus += vm.CPUs.number
      usage.memory += vm.memory.dynamic?.[1] ?? vm.memory.size
    } else if (vm.type === 'VM-snapshot') {
      usage.snapshots++
    }
  }
  for (const vdi of vdis) {
    if (vdi.type === 'VDI') {
      usage.storage += vdi.size
    }
  }
  const instanceIds = new Set(vms.filter(vm => vm.type === 'VM').map(vm => /** @type {any} */ (vm).id))
  for (const vif of vifs) {
    if (instanceIds.has(vif.$VM)) {
      usage.ips += vif.allowedIpv4Addresses?.length ?? 0
    }
  }
  return usage
}

/**
 * Returns the quota keys that would be exceeded by adding `request` to `usage`.
 *
 * A quota key which is not defined is unlimited.
 *
 * @param {Partial<Record<typeof QUOTA_KEYS[number], number>>} quota
 * @param {Record<typeof QUOTA_KEYS[number], number>} usage
 * @param {Partial<Record<typeof QUOTA_KEYS[number], number>>} request
 */
export function getExceededQuotas(quota, usage, request) {
  return QUOTA_KEYS.filter(key => {
    const limit = quota[key]
    return limit !== undefined && usage[key] + (request[key] ?? 0) > limit
  })
}

/**
 * Estimates the resources a VM created from a template will use.
 *
 * `templateDisks` are the existing disks of the template, by user device. The disks described by default
 * templates in `other_config` are not created by XO, only the ones passed in `vdis` are.
 *
 * @param {{ cpus: number, memory: number, templateDisks: Record<string, number> }} template
 * @param {{ cpus?: number, memory?: number, vdis?: ({ size?: number, userdevice?: string, destroy?: boolean })[] }} params
 */
export function estimateVmResources(template, params) {
  const disks = { ...template.templateDisks }
  let newDisks = 0
  for (const vdi of params.vdis ?? []) {
    // a user device matching no disk of the template creates a disk
    if (vdi.userdevice === undefined || !(vdi.userdevice in template.templateDisks)) {
      if (!vdi.destroy) {
        newDisks += vdi.size ?? 0
      }
    } else if (vdi.destroy) {
      delete disks[vdi.userdevice]
    } else if (vdi.size !== undefined) {
      disks[vdi.userdevice] = Math.max(disks[vdi.userdevice] ?? 0, vdi.size)
    }
  }

  return {
    instances: 1,
    vcpus: params.cpus ?? template.cpus,
    memory: params.memory ?? template.memory,
    storage: Object.values(disks).reduce((sum, size) => sum + size, newDisks),
  }
}

/**
 * Serializes calls per key, so that quota checks and creations of a same project cannot interleave.
 */
export function makeKeyedLock() {
  /** @type {Map<string, Promise<unknown>>} */
  const queues = new Map()

  /**
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  return function withLock(key, fn) {
    const previous = queues.get(key) ?? Promise.resolve()
    const current = previous.then(fn, fn)
    const settled = current.then(
      () => {},
      () => {}
    )
    queues.set(key, settled)
    settled.then(() => {
      if (queues.get(key) === settled) {
        queues.delete(key)
      }
    })
    return current
  }
}
