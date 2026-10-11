// @ts-check

import { createLogger } from '@xen-orchestra/log'
import { randomBytes } from 'node:crypto'
import { forbiddenOperation, invalidParameters, noSuchObject } from 'xo-common/api-errors.js'

import { PROJECT_OTHER_CONFIG_KEY } from './_projects.mjs'
import { unboxIdsFromPattern } from '../utils.mjs'

const log = createLogger('xo:project-services')

const DEFAULT_SAMPLING_INTERVAL = 3600e3

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

  #ipLock = Promise.resolve()

  /**
   * @param {any} app
   */
  constructor(app) {
    this._app = app

    app.hooks.on('start', async () => {
      this.#usageStore = await app.getStore('projectUsage')
      // VM uuid → project, kept after the VM is deleted: usage history and backups of deleted VMs
      this.#vmRegistry = await app.getStore('projectVms')

      const interval = app.config.getOptionalDuration('projects.usageSamplingInterval') ?? DEFAULT_SAMPLING_INTERVAL
      this.#samplingInterval = setInterval(() => {
        this.sampleProjectUsage().catch(error => log.warn('sampleProjectUsage', { error }))
      }, interval)
      this.#samplingInterval.unref()
    })
    app.hooks.on('stop', () => clearInterval(this.#samplingInterval))
  }

  // === Ownership

  /**
   * Records the project owning a VM and its VIFs, VBDs and VDIs, readable as `$project` on the XO objects.
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
    const setOtherConfig = async (type, ref) => {
      await xapi.call(`${type}.remove_from_other_config`, ref, PROJECT_OTHER_CONFIG_KEY)
      if (projectId !== undefined) {
        await xapi.call(`${type}.add_to_other_config`, ref, PROJECT_OTHER_CONFIG_KEY, projectId)
      }
    }

    await setOtherConfig('VM', vmRef)
    for (const vifRef of await xapi.call('VM.get_VIFs', vmRef)) {
      await setOtherConfig('VIF', vifRef)
    }
    for (const vbdRef of await xapi.call('VM.get_VBDs', vmRef)) {
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
    for (const project of await app.getProjects()) {
      const { usage } = await app.getProjectUsage(project.id)
      const owned = (/** @type {string} */ type) =>
        Object.values(app.getObjectsByType(type, { filter: (/** @type {any} */ obj) => obj.$project === project.id }))

      const vms = owned('VM').map(vm => {
        const description = this.#describeVm(vm)
        this.#vmRegistry
          .put(vm.id, { projectId: project.id, ...description })
          .catch((/** @type {unknown} */ error) => log.warn('vm registry', { error }))
        return {
          id: vm.id,
          ...description,
          powerState: vm.power_state,
          ips: owned('VIF')
            .filter(vif => vif.$VM === vm.id)
            .flatMap(vif => vif.allowedIpv4Addresses ?? []),
        }
      })
      // what the snapshot chains actually use, a hint for billing (thin storage)
      const snapshotsPhysicalSize = owned('VDI-snapshot').reduce((sum, vdi) => sum + (vdi.usage ?? 0), 0)

      await this.#usageStore.put(usageKey(project.id, at), {
        at,
        projectId: project.id,
        organizationId: project.organizationId,
        usage,
        vms,
        snapshotsPhysicalSize,
      })
    }
  }

  /**
   * @param {string} projectId
   * @param {{ from?: number, to?: number }} [opts]
   */
  async getProjectUsageRecords(projectId, { from = 0, to = Date.now() } = {}) {
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
   * Picks a free address for each network covered by an IP pool of the project.
   *
   * Must be called through `withIpAllocationLock` together with the VM creation and `registerVifAddress`.
   *
   * @param {string} projectId
   * @param {string[]} networkIds
   * @returns {Promise<{ networkId: string, address: string, pool: any }[]>}
   */
  async pickProjectAddresses(projectId, networkIds) {
    const app = this._app
    const { scope } = await app.getProject(projectId)
    const pools = await Promise.all(scope.ipPools.map((/** @type {string} */ id) => app.getIpPool(id)))

    const taken = new Set()
    const result = []
    for (const networkId of networkIds) {
      const pool = pools.find(pool => pool.networks?.includes(networkId))
      if (pool === undefined) {
        continue
      }
      const address = Object.entries(pool.addresses ?? {}).find(
        ([address, { vifs = [] } = {}]) =>
          !taken.has(address) && vifs.every((/** @type {string} */ vifId) => !app.hasObject(vifId))
      )?.[0]
      if (address === undefined) {
        throw forbiddenOperation('create VM', `no address left in the IP pool ${pool.name}`)
      }
      taken.add(address)
      result.push({ networkId, address, pool })
    }
    return result
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

  /**
   * IP pools are shared between projects: allocations are serialized.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  withIpAllocationLock(fn) {
    const result = this.#ipLock.then(fn, fn)
    this.#ipLock = result.then(
      () => {},
      () => {}
    )
    return result
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
        policies.push({ id: job.id, name: job.name, tag, remotes: unboxIdsFromPattern(job.remotes) })
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
    const policies = await this.getProjectBackupPolicies(projectId)
    const remotes = [...new Set(policies.flatMap(policy => policy.remotes))]
    if (remotes.length === 0) {
      return []
    }

    const backupsByRemote = await app.listVmBackupsNg(remotes, { vmId })
    const restorePoints = []
    for (const backupsByVm of Object.values(backupsByRemote)) {
      for (const backups of Object.values(backupsByVm ?? {})) {
        for (const backup of /** @type {any[]} */ (backups)) {
          const policy = policies.find(policy => policy.id === backup.jobId)
          if (policy === undefined) {
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
      await this.#reassignPublicAddresses(projectId, vmId)
      return vmId
    })
  }

  /**
   * A restored VM comes with the VIFs of the original, locked to its addresses: they are released and new
   * addresses are allocated from the pools of the project, within the quota. VIFs which cannot get one are left
   * without public IP.
   *
   * @param {string} projectId
   * @param {string} vmId
   */
  async #reassignPublicAddresses(projectId, vmId) {
    const app = this._app
    const xapi = app.getXapi(vmId)
    await this.withIpAllocationLock(async () => {
      for (const vifId of app.getObject(vmId, 'VM').VIFs) {
        const vif = app.getObject(vifId, 'VIF')
        const vifRef = vif._xapiRef
        await xapi.call('VIF.set_ipv4_allowed', vifRef, [])
        await xapi.call('VIF.set_locking_mode', vifRef, 'network_default')
        // the quota check reads the XO objects
        await xapi.barrier(vifRef)

        const [allocation] = await this.pickProjectAddresses(projectId, [vif.$network])
        if (allocation === undefined) {
          continue
        }
        try {
          await app.assertProjectQuota(projectId, { ips: 1 })
        } catch {
          continue
        }
        await xapi.call('VIF.set_ipv4_allowed', vifRef, [allocation.address])
        await xapi.call('VIF.set_locking_mode', vifRef, 'locked')
        await xapi.barrier(vifRef)
        await this.registerVifAddress(vifId, allocation.address, allocation.pool.id)
      }
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
