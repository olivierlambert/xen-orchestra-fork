// @ts-check

import { createLogger } from '@xen-orchestra/log'
import { randomBytes } from 'node:crypto'
import { forbiddenOperation, invalidParameters, noSuchObject } from 'xo-common/api-errors.js'

import { formatProjectStamp, PROJECT_OTHER_CONFIG_KEY } from './_projects.mjs'
import { unboxIdsFromPattern } from '../utils.mjs'

const log = createLogger('xo:project-services')

const DEFAULT_SAMPLING_INTERVAL = 3600e3
const DEFAULT_RETENTION = 400 * 864e5
const DEFAULT_RECORDS_RANGE = 31 * 864e5
const MAX_RECORDS_RANGE = 93 * 864e5

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// keys are sorted: project id, then the timestamp padded to a fixed width
const usageKey = (/** @type {string} */ projectId, /** @type {number} */ at) =>
  `${projectId}:${String(at).padStart(15, '0')}`

/**
 * Services of the tenant model built on the projects: ownership of the created objects, usage records, public IP
 * allocation, backup policies and restore, account helpers.
 *
 * See `projects.mjs` for the model itself.
 */
export default class ProjectServices {
  /** @type {any} */
  #usageStore
  /** @type {any} */
  #vmRegistry
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #samplingInterval

  /** addresses picked for creations in progress, not yet locked on their VIF */
  #reservedAddresses = new Set()

  /**
   * @param {any} app
   */
  constructor(app) {
    this._app = app

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let firstSample
    app.hooks.on('start', async () => {
      this.#usageStore = await app.getStore('projectUsage')
      // VM uuid → project, kept after the VM is deleted: usage history and backups of deleted VMs
      this.#vmRegistry = await app.getStore('projectVms')

      const interval = app.config.getOptionalDuration('projects.usageSamplingInterval') ?? DEFAULT_SAMPLING_INTERVAL
      const sample = () => this.sampleProjectUsage().catch(error => log.warn('sampleProjectUsage', { error }))
      // aligned on the interval (on the hour by default), so that restarts do not skip samples
      firstSample = setTimeout(
        () => {
          sample()
          this.#samplingInterval = setInterval(sample, interval)
          this.#samplingInterval.unref()
        },
        interval - (Date.now() % interval)
      )
      firstSample.unref()
    })
    app.hooks.on('stop', () => {
      clearTimeout(firstSample)
      clearInterval(this.#samplingInterval)
    })
  }

  // === Ownership

  /**
   * Records the project owning a VM and its disks, readable as `$project` on the XO objects of the VM, its
   * snapshots, VIFs, VBDs and VDIs.
   *
   * Always written (`undefined` removes it), so that a VM cloned from a template made from a project VM does not
   * inherit its project. Returns once the XO objects reflect it.
   *
   * @param {string} vmId
   * @param {string | undefined} projectId
   */
  async setVmProject(vmId, projectId) {
    const app = this._app
    const xapi = app.getXapi(vmId)
    const vmRef = app.getXapiObject(vmId, 'VM').$ref

    /**
     * @param {string} type
     * @param {string} ref
     */
    const stamp = projectId === undefined ? undefined : formatProjectStamp(projectId, vmId)
    const setOtherConfig = async (/** @type {string} */ type, /** @type {string} */ ref) => {
      await xapi.call(`${type}.remove_from_other_config`, ref, PROJECT_OTHER_CONFIG_KEY)
      if (stamp !== undefined) {
        await xapi.call(`${type}.add_to_other_config`, ref, PROJECT_OTHER_CONFIG_KEY, stamp)
      }
    }

    // VIFs and VBDs are owned through their VM; they are stamped too, so that XO recomputes them (they were
    // converted before the VM had its stamp). CD drives are skipped: their ISO VDIs are shared
    await setOtherConfig('VM', vmRef)
    for (const vifRef of await xapi.call('VM.get_VIFs', vmRef)) {
      await setOtherConfig('VIF', vifRef)
    }
    for (const vbdRef of await xapi.call('VM.get_VBDs', vmRef)) {
      if ((await xapi.call('VBD.get_type', vbdRef)) === 'CD') {
        continue
      }
      await setOtherConfig('VBD', vbdRef)
      const vdiRef = await xapi.call('VBD.get_VDI', vbdRef)
      if (vdiRef !== 'OpaqueRef:NULL') {
        await setOtherConfig('VDI', vdiRef)
      }
    }

    // the creation must be listed right away, and the next quota check of the project must count it
    await xapi.barrier(vmRef)
  }

  /**
   * Project owning a VM, even deleted, as known by the usage sampling.
   *
   * @param {string} vmId
   * @returns {Promise<{ projectId: string, name: string, cpus: number, memory: number, disk: number } | undefined>}
   */
  async getVmRegistration(vmId) {
    const app = this._app
    if (app.hasObject(vmId, 'VM')) {
      const vm = app.getObject(vmId, 'VM')
      if (vm.$project !== undefined) {
        return { projectId: vm.$project, ...this.#describeVm(vm) }
      }
    }
    return this.#vmRegistry.get(vmId).catch(() => undefined)
  }

  /**
   * @param {any} vm
   */
  #describeVm(vm) {
    const app = this._app
    let disk = 0
    for (const vbdId of vm.$VBDs) {
      const vbd = app.getObject(vbdId, 'VBD')
      if (!vbd.is_cd_drive && vbd.VDI !== undefined) {
        disk += app.getObject(vbd.VDI).size
      }
    }
    return {
      name: vm.name_label,
      cpus: vm.CPUs.number,
      memory: vm.memory.dynamic?.[1] ?? vm.memory.size,
      disk,
    }
  }

  // === Usage records

  /**
   * Records the resources of every project at this time.
   *
   * Billing tools turn these samples into invoices: allocation per instance, snapshot footprint, public IPs.
   */
  async sampleProjectUsage() {
    const app = this._app
    const at = Date.now()
    const retention = app.config.getOptionalDuration('projects.usageRetention') ?? DEFAULT_RETENTION

    // one pass over the objects for all projects
    /** @type {Map<string, Record<string, any[]>>} */
    const byProject = new Map()
    for (const type of ['VM', 'VIF', 'VDI-snapshot']) {
      for (const object of Object.values(app.getObjectsByType(type))) {
        const projectId = /** @type {any} */ (object).$project
        if (projectId !== undefined) {
          let owned = byProject.get(projectId)
          if (owned === undefined) {
            byProject.set(projectId, (owned = { VM: [], VIF: [], 'VDI-snapshot': [] }))
          }
          owned[type].push(object)
        }
      }
    }

    for (const project of await app.getProjects()) {
      // a failure for a project does not leave a gap in the records of the others
      try {
        const owned = byProject.get(project.id) ?? { VM: [], VIF: [], 'VDI-snapshot': [] }
        const { usage } = await app.getProjectUsage(project.id)

        /** @type {Map<string, string[]>} */
        const ipsByVm = new Map()
        for (const vif of owned.VIF) {
          ipsByVm.set(vif.$VM, [...(ipsByVm.get(vif.$VM) ?? []), ...(vif.allowedIpv4Addresses ?? [])])
        }

        const vms = owned.VM.map(vm => {
          const description = this.#describeVm(vm)
          this.#vmRegistry
            .put(vm.id, { projectId: project.id, ...description })
            .catch((/** @type {unknown} */ error) => log.warn('vm registry', { error }))
          return { id: vm.id, ...description, powerState: vm.power_state, ips: ipsByVm.get(vm.id) ?? [] }
        })
        // what the snapshot chains actually use, a hint for billing (thin storage)
        const snapshotsPhysicalSize = owned['VDI-snapshot'].reduce((sum, vdi) => sum + (vdi.usage ?? 0), 0)

        await this.#usageStore.put(usageKey(project.id, at), {
          at,
          projectId: project.id,
          organizationId: project.organizationId,
          usage,
          vms,
          snapshotsPhysicalSize,
        })

        for await (const key of this.#usageStore.createKeyStream({
          gte: usageKey(project.id, 0),
          lt: usageKey(project.id, at - retention),
        })) {
          await this.#usageStore.del(key)
        }
      } catch (error) {
        log.warn('sampleProjectUsage: project', { projectId: project.id, error })
      }
    }
  }

  /**
   * Records of a project, at most `MAX_RECORDS_RANGE` at once.
   *
   * @param {string} projectId
   * @param {{ from?: number, to?: number }} [opts]
   */
  async getProjectUsageRecords(projectId, { to = Date.now(), from = to - DEFAULT_RECORDS_RANGE } = {}) {
    if (to - from > MAX_RECORDS_RANGE) {
      throw invalidParameters(`the range of usage records is limited to ${MAX_RECORDS_RANGE / 864e5} days`)
    }
    const records = []
    for await (const value of this.#usageStore.createValueStream({
      gte: usageKey(projectId, from),
      lte: usageKey(projectId, to),
    })) {
      records.push(value)
    }
    return records
  }

  // === Public IPs

  /**
   * Reserves a free address for each network covered by an IP pool of the project, until `release()`.
   *
   * An address is free when no VIF is locked to it (snapshot VIFs included: a revert brings them back), no VIF
   * it is registered to exists, and no creation in progress reserved it. Pools spanning a network whose pool is
   * not connected are refused: their VIFs are unknown.
   *
   * @param {string} projectId
   * @param {string[]} networkIds
   * @returns {Promise<{ allocations: { networkId: string, address: string, pool: any }[], release: () => void }>}
   */
  async reserveProjectAddresses(projectId, networkIds) {
    const app = this._app
    const { scope } = await app.getProject(projectId)
    const pools = await Promise.all(scope.ipPools.map((/** @type {string} */ id) => app.getIpPool(id)))

    // from here, no await: the check and the reservation are atomic
    const reserved = this.#reservedAddresses
    const used = new Set()
    for (const vif of /** @type {any[]} */ (Object.values(app.getObjectsByType('VIF')))) {
      for (const address of vif.allowedIpv4Addresses ?? []) {
        used.add(address)
      }
    }

    const allocations = []
    for (const networkId of networkIds) {
      const pool = pools.find(pool => pool.networks?.includes(networkId))
      if (pool === undefined) {
        continue
      }
      if (!pool.networks.every((/** @type {string} */ id) => app.hasObject(id))) {
        throw forbiddenOperation('allocate IP', `a network of the IP pool ${pool.name} is not connected`)
      }
      const address = Object.entries(pool.addresses ?? {}).find(
        ([address, { vifs = [] } = {}]) =>
          !used.has(address) &&
          !reserved.has(address) &&
          vifs.every((/** @type {string} */ vifId) => !app.hasObject(vifId))
      )?.[0]
      if (address === undefined) {
        allocations.forEach(_ => reserved.delete(_.address))
        throw forbiddenOperation('allocate IP', `no address left in the IP pool ${pool.name}`)
      }
      reserved.add(address)
      allocations.push({ networkId, address, pool })
    }
    return { allocations, release: () => allocations.forEach(_ => reserved.delete(_.address)) }
  }

  /**
   * @param {string} vifId
   * @param {string} address
   * @param {string} poolId
   */
  async registerVifAddress(vifId, address, poolId) {
    const app = this._app
    // forget VIFs which no longer exist, otherwise the address would look taken forever
    await app.updateIpPool(poolId, { addresses: { [address]: { vifs: [] } } })
    await app.allocIpAddresses(vifId, [address])
  }

  // === Backup policies

  /**
   * Backup policies of a project are smart backup jobs selecting VMs by a tag, listed in the project scope.
   *
   * @param {string} projectId
   * @returns {Promise<{ id: string, name: string, tag: string, remotes: string[] }[]>}
   */
  async getProjectBackupPolicies(projectId) {
    const app = this._app
    const { scope } = await app.getProject(projectId)
    const schedules = await app.getAllSchedules()
    const policies = []
    for (const jobId of scope.backupJobs) {
      try {
        const job = await app.getJob(jobId, 'backup')
        const first = job.vms?.tags?.__or?.[0]
        const tag = Array.isArray(first) ? first[0] : first
        if (typeof tag !== 'string') {
          log.warn('backup job of a project does not select VMs by tag', { jobId, projectId })
          continue
        }
        policies.push({
          id: job.id,
          name: job.name,
          tag,
          remotes: unboxIdsFromPattern(job.remotes),
          // what the tenant needs to choose: when it runs and how many restore points it keeps
          schedules: schedules
            .filter(schedule => schedule.jobId === job.id)
            .map(schedule => {
              const settings = job.settings?.[schedule.id] ?? {}
              return {
                cron: schedule.cron,
                timezone: schedule.timezone,
                enabled: schedule.enabled,
                retention: settings.exportRetention ?? settings.copyRetention ?? settings.snapshotRetention ?? 0,
              }
            }),
        })
      } catch (error) {
        log.warn('backup job of a project not found', { jobId, projectId, error })
      }
    }
    return policies
  }

  /**
   * @param {string} projectId
   * @param {string} vmId
   */
  #getProjectVm(projectId, vmId) {
    const vm = this._app.getObject(vmId, 'VM')
    if (vm.$project !== projectId) {
      throw noSuchObject(vmId, 'VM')
    }
    return vm
  }

  /**
   * @param {string} projectId
   * @param {string} vmId
   * @returns {Promise<string | undefined>} id of the policy
   */
  async getInstanceBackupPolicy(projectId, vmId) {
    const vm = this.#getProjectVm(projectId, vmId)
    return (await this.getProjectBackupPolicies(projectId)).find(policy => vm.tags.includes(policy.tag))?.id
  }

  /**
   * Subscribes an instance to a backup policy of its project, or unsubscribes it with `null`.
   *
   * @param {string} projectId
   * @param {string} vmId
   * @param {string | null} policyId
   */
  async setInstanceBackupPolicy(projectId, vmId, policyId) {
    const app = this._app
    const vm = this.#getProjectVm(projectId, vmId)
    const policies = await this.getProjectBackupPolicies(projectId)
    if (policyId !== null && !policies.some(policy => policy.id === policyId)) {
      throw forbiddenOperation('set backup policy', 'the backup policy is not available to the project')
    }

    const xapi = app.getXapi(vm)
    for (const policy of policies) {
      const has = vm.tags.includes(policy.tag)
      if (policy.id === policyId && !has) {
        await xapi.call('VM.add_tags', vm._xapiRef, policy.tag)
      } else if (policy.id !== policyId && has) {
        await xapi.call('VM.remove_tags', vm._xapiRef, policy.tag)
      }
    }
    await xapi.barrier(vm._xapiRef)
  }

  /**
   * Restore points of the instances of a project, including deleted ones, made by its backup policies.
   *
   * @param {string} projectId
   * @param {{ vmId?: string }} [opts]
   */
  async listProjectRestorePoints(projectId, { vmId } = {}) {
    const app = this._app
    if (vmId !== undefined && !UUID_RE.test(vmId)) {
      throw invalidParameters('vmId must be a VM UUID')
    }
    const policies = await this.getProjectBackupPolicies(projectId)
    const remotes = [...new Set(policies.flatMap(policy => policy.remotes))]
    if (remotes.length === 0) {
      return []
    }

    // the listing is cached per remote, whatever the VM: it is always read whole and filtered here
    const backupsByRemote = await app.listVmBackupsNg(remotes)
    const restorePoints = []
    for (const backupsByVm of Object.values(backupsByRemote)) {
      for (const backups of Object.values(backupsByVm ?? {})) {
        for (const backup of /** @type {any[]} */ (backups)) {
          const policy = policies.find(policy => policy.id === backup.jobId)
          if (policy === undefined || (vmId !== undefined && backup.vm.uuid !== vmId)) {
            continue
          }
          const registration = await this.getVmRegistration(backup.vm.uuid)
          if (registration?.projectId !== projectId) {
            continue
          }
          restorePoints.push({
            id: backup.id,
            vmId: backup.vm.uuid,
            vmName: backup.vm.name_label,
            timestamp: backup.timestamp,
            size: backup.size,
            policyId: policy.id,
            policyName: policy.name,
          })
        }
      }
    }
    return restorePoints.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Restores a restore point of the project as a new instance, within the quota.
   *
   * The restored VM is deleted if anything fails after the import.
   *
   * @param {string} projectId
   * @param {string} backupId
   * @param {{ srId: string, name?: string }} opts
   * @returns {Promise<string>} id of the new VM
   */
  async restoreProjectBackup(projectId, backupId, { srId, name }) {
    const app = this._app
    const project = await app.getProject(projectId)
    if (!project.scope.srs.includes(srId)) {
      throw forbiddenOperation('restore', `the SR ${srId} is not available to the project`)
    }
    const restorePoint = (await this.listProjectRestorePoints(projectId)).find(_ => _.id === backupId)
    if (restorePoint === undefined) {
      throw noSuchObject(backupId, 'restore point')
    }

    return app.withProjectLock(projectId, async () => {
      await app.assertProjectActive(projectId)
      const registration = await this.getVmRegistration(restorePoint.vmId)
      await app.assertProjectQuota(projectId, {
        instances: 1,
        vcpus: registration?.cpus ?? 0,
        memory: registration?.memory ?? 0,
        storage: registration?.disk ?? 0,
      })

      const vmId = await app.importVmBackupNg(backupId, srId, {})
      const xapi = app.getXapi(vmId)
      const vmRef = app.getXapiObject(vmId, 'VM').$ref
      try {
        // first, no traffic from the VIFs of the copy, which are locked to the addresses of the original
        await this.#secureRestoredVifs(project, vmId)

        // a restored copy is not subscribed to the policies of the original
        for (const policy of await this.getProjectBackupPolicies(projectId)) {
          await xapi.call('VM.remove_tags', vmRef, policy.tag)
        }
        await xapi.call(
          'VM.set_name_label',
          vmRef,
          name ?? `${restorePoint.vmName} (restored ${new Date(restorePoint.timestamp).toISOString().slice(0, 16)})`
        )
        await this.setVmProject(vmId, projectId)
        await this.#assignRestoredAddresses(projectId, vmId)
        return vmId
      } catch (error) {
        await xapi
          .VM_destroy(vmRef)
          .catch((/** @type {unknown} */ destroyError) =>
            log.warn('restore: cannot delete the failed copy', { vmId, error: destroyError })
          )
        throw error
      }
    })
  }

  /**
   * VIFs on networks outside the scope of the project are destroyed (a restore on another pool maps VIFs to
   * whatever network matches). The others are locked without address: they get one from the pools of the project,
   * or are opened if their network is not covered by a pool (like at creation).
   *
   * @param {any} project
   * @param {string} vmId
   */
  async #secureRestoredVifs(project, vmId) {
    const app = this._app
    const xapi = app.getXapi(vmId)
    for (const vifRef of await xapi.call('VM.get_VIFs', app.getXapiObject(vmId, 'VM').$ref)) {
      const networkUuid = await xapi.call('network.get_uuid', await xapi.call('VIF.get_network', vifRef))
      if (!project.scope.networks.includes(networkUuid)) {
        await xapi.call('VIF.destroy', vifRef)
        continue
      }
      await xapi.call('VIF.set_ipv4_allowed', vifRef, [])
      await xapi.call('VIF.set_ipv6_allowed', vifRef, [])
      await xapi.call('VIF.set_locking_mode', vifRef, 'locked')
    }
  }

  /**
   * @param {string} projectId
   * @param {string} vmId
   */
  async #assignRestoredAddresses(projectId, vmId) {
    const app = this._app
    const xapi = app.getXapi(vmId)
    const { scope } = await app.getProject(projectId)
    const pools = await Promise.all(scope.ipPools.map((/** @type {string} */ id) => app.getIpPool(id)))

    for (const vifId of app.getObject(vmId, 'VM').VIFs) {
      const vif = app.getObject(vifId, 'VIF')
      if (!pools.some(pool => pool.networks?.includes(vif.$network))) {
        // no public IP on this network: same as at creation
        await xapi.call('VIF.set_locking_mode', vif._xapiRef, 'network_default')
        continue
      }

      let reservation
      try {
        await app.assertProjectQuota(projectId, { ips: 1 })
        reservation = await this.reserveProjectAddresses(projectId, [vif.$network])
      } catch (error) {
        // stays locked without address: no traffic, the instance is restored anyway
        log.info('restore: no public IP for a VIF', { vmId, vifId, error })
        continue
      }
      try {
        const [allocation] = reservation.allocations
        await xapi.call('VIF.set_ipv4_allowed', vif._xapiRef, [allocation.address])
        await xapi.barrier(vif._xapiRef)
        await this.registerVifAddress(vifId, allocation.address, allocation.pool.id)
      } finally {
        reservation.release()
      }
    }
  }

  // === Snapshots

  /**
   * Takes a snapshot of an instance of the project, within the snapshot quota.
   *
   * @param {string} projectId
   * @param {string} vmId
   * @param {{ name?: string }} [opts]
   * @returns {Promise<string>} id of the snapshot
   */
  async snapshotProjectVm(projectId, vmId, { name } = {}) {
    const app = this._app
    this.#getProjectVm(projectId, vmId)
    return app.withProjectLock(projectId, async () => {
      await app.assertProjectActive(projectId)
      await app.assertProjectQuota(projectId, { snapshots: 1 })
      const xapiVm = app.getXapiObject(vmId, 'VM')
      const ref = await xapiVm.$snapshot({ name_label: name })
      // the next quota check must count it
      await xapiVm.$xapi.barrier(ref)
      return xapiVm.$xapi.getField('VM', ref, 'uuid')
    })
  }

  // === Account

  /**
   * @param {string} userId
   * @returns {Promise<{ title: string, key: string }[]>}
   */
  async getUserSshKeys(userId) {
    const user = await this._app.getUser(userId)
    return user.preferences?.sshKeys ?? []
  }

  /**
   * Same storage as XO 5 (`preferences.sshKeys`).
   *
   * @param {string} userId
   * @param {{ title: string, key: string }} sshKey
   */
  async addUserSshKey(userId, { title, key }) {
    if (
      !/^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com) [A-Za-z0-9+/=]+( .*)?$/.test(key.trim())
    ) {
      throw invalidParameters('not an SSH public key')
    }
    const sshKeys = await this.getUserSshKeys(userId)
    if (sshKeys.some(_ => _.key === key.trim())) {
      return
    }
    await this._app.updateUser(userId, { preferences: { sshKeys: [...sshKeys, { title, key: key.trim() }] } })
  }

  /**
   * @param {string} userId
   * @param {string} key
   */
  async removeUserSshKey(userId, key) {
    const sshKeys = await this.getUserSshKeys(userId)
    await this._app.updateUser(userId, { preferences: { sshKeys: sshKeys.filter(_ => _.key !== key) } })
  }

  /**
   * MAC addresses are chosen before the creation, to match the network configuration of cloud-init.
   */
  generateMacAddress() {
    const bytes = randomBytes(6)
    // locally administered, unicast
    bytes[0] = (bytes[0] & 0xfc) | 0x02
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(':')
  }
}
