import type {
  XapiXoRecord,
  XoIpPool,
  XoNetwork,
  XoOffering,
  XoPool,
  XoProject,
  XoProjectRole,
  XoSr,
  XoUser,
  XoVbd,
  XoVdi,
  XoVdiSnapshot,
  XoVif,
  XoVm,
  XoVmTemplate,
} from '@vates/types'
import { forbiddenOperation, invalidParameters } from 'xo-common/api-errors.js'

import type { RestApi } from '../rest-api/rest-api.mjs'
import { VmService } from '../vms/vm.service.mjs'
import type {
  ProjectCreateVmBody,
  ProjectDetails,
  ProjectMember,
  ProjectTemplate,
  ProjectWithRole,
  ProjectNetwork,
} from './project.type.mjs'

export class ProjectService {
  #restApi: RestApi
  #vmService: VmService

  constructor(restApi: RestApi) {
    this.#restApi = restApi
    this.#vmService = restApi.ioc.get(VmService)
  }

  get #xoApp() {
    return this.#restApi.xoApp
  }

  async getProjectsForUser(user: XoUser): Promise<ProjectWithRole[]> {
    const xoApp = this.#xoApp
    if (user.permission === 'admin') {
      return (await xoApp.getProjects()).map(project => ({ ...project, role: 'admin' as const }))
    }
    return (await xoApp.getUserProjects(user.id)).map(({ project, role }) => ({ ...project, role }))
  }

  async getProjectDetails(user: XoUser, id: XoProject['id']): Promise<ProjectDetails> {
    const xoApp = this.#xoApp
    const role = await xoApp.getUserProjectRole(user.id, id)
    if (role === undefined) {
      throw forbiddenOperation('project', 'not a member of the project')
    }
    const project = await xoApp.getProject(id)
    const { usage } = await xoApp.getProjectUsage(id)
    return { ...project, role, usage, resources: await this.#getResources(project) }
  }

  async #getResources({ scope }: XoProject): Promise<ProjectDetails['resources']> {
    const restApi = this.#restApi
    const resolve = <T extends XapiXoRecord, U>(ids: string[], type: T['type'], map: (object: T) => U): U[] =>
      ids.flatMap(id => {
        try {
          return [map(restApi.getObject<T>(id as T['id'], type))]
        } catch {
          return []
        }
      })

    // networks covered by an IP pool of the project: instances get a public address there
    const publicNetworks = new Set<string>()
    for (const poolId of scope.ipPools) {
      try {
        for (const networkId of (await this.#xoApp.getIpPool(poolId)).networks ?? []) {
          publicNetworks.add(networkId)
        }
      } catch {
        // deleted IP pool
      }
    }

    return {
      pools: resolve<XoPool, { id: string; name: string }>(scope.pools, 'pool', pool => ({
        id: pool.id,
        name: pool.name_label,
      })),
      templates: resolve<XoVmTemplate, ProjectTemplate>(scope.templates, 'VM-template', template => {
        const disks = this.#getTemplateDisks(template.id)
        return {
          id: template.id,
          uuid: template.uuid,
          name: template.name_label,
          poolId: template.$pool,
          cpus: template.CPUs.number,
          memory: template.memory.size,
          disks: Array.from(disks, ([userdevice, { size }]) => ({ userdevice, size })),
        }
      }),
      networks: resolve<XoNetwork, ProjectNetwork>(scope.networks, 'network', network => ({
        id: network.id,
        name: network.name_label,
        description: network.name_description,
        poolId: network.$pool,
        publicIpv4: publicNetworks.has(network.id),
      })),
      srs: resolve<XoSr, ProjectDetails['resources']['srs'][number]>(scope.srs, 'SR', sr => ({
        id: sr.id,
        name: sr.name_label,
        poolId: sr.$pool,
        size: sr.size,
        usage: sr.usage,
      })),
      offerings: (await this.#xoApp.getOfferings()).filter(offering => scope.offerings.includes(offering.id)),
    }
  }

  async getMembers(id: XoProject['id']): Promise<ProjectMember[]> {
    const xoApp = this.#xoApp
    const members = await xoApp.getProjectMembers(id)
    return Promise.all(
      members.map(async ({ userId, role }) => ({ userId, role, name: (await xoApp.getUser(userId)).email }))
    )
  }

  async setMember(id: XoProject['id'], userId: XoUser['id'], role: XoProjectRole | null) {
    await this.#xoApp.setProjectMember(id, userId, role)
  }

  /**
   * Existing disks of a template, by user device.
   *
   * The disks described by default templates in `other_config` are not included: XO does not create them, only
   * the ones passed in `vdis`.
   */
  #getTemplateDisks(templateId: XoVmTemplate['id']) {
    const restApi = this.#restApi
    const disks = new Map<string, { size: number; sr: XoSr['id'] }>()
    for (const vbdId of restApi.getObject<XoVmTemplate>(templateId, 'VM-template').$VBDs) {
      const vbd = restApi.getObject<XoVbd>(vbdId, 'VBD')
      if (!vbd.is_cd_drive && vbd.VDI !== undefined) {
        // a template made from a snapshot keeps snapshot VDIs: they are cloned like regular ones
        const vdi = restApi.getObject<XoVdi | XoVdiSnapshot>(vbd.VDI as XoVdi['id'], ['VDI', 'VDI-snapshot'])
        disks.set(vbd.position, { size: vdi.size, sr: vdi.$SR })
      }
    }
    return disks
  }

  /**
   * Creates an instance owned by the project, after checking its scope and quota.
   *
   * The ACL middleware is not involved: tenants are never granted pool `create:vm`, the project is.
   */
  async createVm(id: XoProject['id'], body: ProjectCreateVmBody): Promise<XoVm['id']> {
    const xoApp = this.#xoApp
    const project = await xoApp.getProject(id)
    const { scope } = project

    // the provider sells sizes: with offerings, the size comes from the offering only
    const { offering: offeringId, ...vmParams } = body
    if (scope.offerings.length !== 0) {
      if (offeringId === undefined || !scope.offerings.includes(offeringId as XoOffering['id'])) {
        throw forbiddenOperation('create VM', 'an offering of the project is required')
      }
      if (body.cpus !== undefined || body.memory !== undefined) {
        throw forbiddenOperation('create VM', 'the size comes from the offering, cpus and memory cannot be set')
      }
      const offering = await xoApp.getOffering(offeringId)
      vmParams.cpus = offering.cpus
      vmParams.memory = offering.memory
    } else if (offeringId !== undefined) {
      throw forbiddenOperation('create VM', 'the project has no offerings')
    }

    const poolId = body.pool as XoPool['id']
    if (!scope.pools.includes(poolId)) {
      throw forbiddenOperation('create VM', 'the pool is not available to the project')
    }
    const pool = this.#restApi.getXapiObject<XoPool>(poolId, 'pool')

    const template = pool.$xapi.getObject<XoVm>(body.template)
    // default templates have the same UUID in every pool, their XO id is scoped by pool
    const templateId = (
      template.is_default_template ? `${pool.uuid}-${template.uuid}` : template.uuid
    ) as XoVmTemplate['id']
    if (!scope.templates.includes(templateId)) {
      throw forbiddenOperation('create VM', 'the template is not available to the project')
    }

    // the VIFs are always given: the ones of the template are removed, they would be on unchecked networks and
    // unlocked
    if (body.vifs === undefined || body.vifs.length === 0) {
      throw forbiddenOperation('create VM', 'the networks of the instance must be given')
    }
    const networkIds = body.vifs.map(vif => vif.network as XoNetwork['id'])
    for (const networkId of networkIds) {
      if (!scope.networks.includes(networkId)) {
        throw forbiddenOperation('create VM', `the network ${networkId} is not available to the project`)
      }
    }

    // user devices are positions: unique, digits only (`autodetect` would create a disk per entry), and never a
    // CD drive of the template (shared ISOs)
    const templateVbds = this.#restApi
      .getObject<XoVmTemplate>(templateId, 'VM-template')
      .$VBDs.map(vbdId => this.#restApi.getObject<XoVbd>(vbdId, 'VBD'))
    const userdevices = new Set<string>()
    for (const vdi of body.vdis ?? []) {
      if ('userdevice' in vdi) {
        const userdevice = vdi.userdevice
        if (!/^\d+$/.test(userdevice) || userdevices.has(userdevice)) {
          throw invalidParameters('vdis: user devices must be distinct numbers')
        }
        if (templateVbds.some(vbd => vbd.is_cd_drive && vbd.position === userdevice)) {
          throw forbiddenOperation('create VM', 'a CD drive of the template cannot be changed')
        }
        userdevices.add(userdevice)
      }
    }

    // every disk of the new VM must end up on an SR of the scope: the kept disks of the template stay on their
    // SR, and a disk whose user device matches no disk of the template is created, on the default SR if none
    // is given
    const srsByUserdevice = new Map(
      Array.from(this.#getTemplateDisks(templateId), ([userdevice, { sr }]) => [userdevice, sr])
    )
    const newDiskSrs: (string | undefined)[] = []
    for (const vdi of body.vdis ?? []) {
      if ('destroy' in vdi) {
        srsByUserdevice.delete(vdi.userdevice)
      } else if ('userdevice' in vdi && srsByUserdevice.has(vdi.userdevice)) {
        if (vdi.sr !== undefined) {
          srsByUserdevice.set(vdi.userdevice, vdi.sr as XoSr['id'])
        }
      } else {
        newDiskSrs.push(vdi.sr)
      }
    }
    for (const sr of [...srsByUserdevice.values(), ...newDiskSrs]) {
      if (sr === undefined) {
        throw forbiddenOperation('create VM', 'new disks must specify an SR')
      }
      if (!scope.srs.includes(sr as XoSr['id'])) {
        throw forbiddenOperation('create VM', `the SR ${sr} is not available to the project`)
      }
    }

    return xoApp.withProjectLock(id, async () => {
      await xoApp.assertProjectActive(id)

      // reserved, not locked: IP pools are shared, other projects keep creating instances meanwhile
      const { allocations, release } = await xoApp.reserveProjectAddresses(id, networkIds)
      try {
        // MAC addresses are always generated: a tenant could otherwise reuse the MAC of another tenant
        const vifs = body.vifs!.map(({ network }) => {
          const index = allocations.findIndex(allocation => allocation.networkId === network)
          const allocation = index === -1 ? undefined : allocations.splice(index, 1)[0]
          return { network, mac: xoApp.generateMacAddress(), allocation }
        })
        const allocated = vifs.filter(vif => vif.allocation !== undefined)

        await xoApp.assertProjectQuotaForVm(id, templateId, { ...vmParams, ips: allocated.length })

        const networkConfig = getNetworkConfig(vifs)
        const vmId = await this.#vmService.create({
          ...vmParams,
          vifs: vifs.map(({ allocation, ...vif }) => ({
            ...vif,
            ...(allocation !== undefined && { ipv4_allowed: [allocation.address] }),
          })),
          ...(networkConfig !== undefined && {
            network_config: networkConfig,
            cloud_config: vmParams.cloud_config ?? '#cloud-config\n',
          }),
          pool: poolId,
          template: body.template as XoVmTemplate['uuid'],
          vdis: body.vdis as Parameters<VmService['create']>[0]['vdis'],
          project: id,
          destroyTemplateVifs: true,
        })

        const vm = this.#restApi.getObject<XoVm>(vmId, 'VM')
        for (const vif of allocated) {
          const xoVif = vm.VIFs.map(vifId => this.#restApi.getObject<XoVif>(vifId, 'VIF')).find(
            _ => _.MAC.toLowerCase() === vif.mac.toLowerCase()
          )
          if (xoVif !== undefined) {
            await xoApp.registerVifAddress(xoVif.id, vif.allocation!.address, vif.allocation!.pool.id)
          }
        }
        return vmId
      } finally {
        release()
      }
    })
  }
}

/**
 * cloud-init network configuration (version 1) matching the VIFs by MAC address: static for the allocated public
 * IPs whose pool describes the network, DHCP for the others. Undefined when no address can be configured.
 */
function getNetworkConfig(
  vifs: { mac: string; allocation?: { address: string; pool: XoIpPool } }[]
): string | undefined {
  if (
    !vifs.some(({ allocation }) => allocation?.pool.gateway !== undefined && allocation.pool.prefixLength !== undefined)
  ) {
    return undefined
  }
  const lines = ['version: 1', 'config:']
  vifs.forEach(({ mac, allocation }, index) => {
    lines.push('  - type: physical', `    name: eth${index}`, `    mac_address: '${mac}'`, '    subnets:')
    const pool = allocation?.pool
    if (allocation === undefined || pool?.gateway === undefined || pool.prefixLength === undefined) {
      lines.push('      - type: dhcp')
      return
    }
    lines.push(
      '      - type: static',
      `        address: ${allocation.address}/${pool.prefixLength}`,
      `        gateway: ${pool.gateway}`
    )
    if (pool.dns !== undefined && pool.dns.length !== 0) {
      lines.push(`        dns_nameservers: [${pool.dns.join(', ')}]`)
    }
  })
  return lines.join('\n') + '\n'
}
