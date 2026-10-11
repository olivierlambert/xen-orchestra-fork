import type {
  XapiXoRecord,
  XoNetwork,
  XoPool,
  XoProject,
  XoProjectRole,
  XoSr,
  XoUser,
  XoVbd,
  XoVdi,
  XoVif,
  XoVm,
  XoVmTemplate,
} from '@vates/types'
import { forbiddenOperation } from 'xo-common/api-errors.js'

import type { RestApi } from '../rest-api/rest-api.mjs'
import { VmService } from '../vms/vm.service.mjs'
import type {
  ProjectCreateVmBody,
  ProjectDetails,
  ProjectMember,
  ProjectTemplate,
  ProjectWithRole,
  ProjectResource,
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
    return { ...project, role, usage, resources: this.#getResources(project) }
  }

  #getResources({ scope }: XoProject): ProjectDetails['resources'] {
    const restApi = this.#restApi
    const resolve = <T extends XapiXoRecord, U>(ids: string[], type: T['type'], map: (object: T) => U): U[] =>
      ids.flatMap(id => {
        try {
          return [map(restApi.getObject<T>(id as T['id'], type))]
        } catch {
          return []
        }
      })

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
      networks: resolve<XoNetwork, ProjectResource>(scope.networks, 'network', network => ({
        id: network.id,
        name: network.name_label,
        poolId: network.$pool,
      })),
      srs: resolve<XoSr, ProjectDetails['resources']['srs'][number]>(scope.srs, 'SR', sr => ({
        id: sr.id,
        name: sr.name_label,
        poolId: sr.$pool,
        size: sr.size,
        usage: sr.usage,
      })),
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
        const vdi = restApi.getObject<XoVdi>(vbd.VDI as XoVdi['id'], 'VDI')
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

    // without explicit VIFs, the VIFs of the template are kept
    const networkIds =
      body.vifs !== undefined
        ? body.vifs.map(vif => vif.network as XoNetwork['id'])
        : this.#restApi
            .getObject<XoVmTemplate>(templateId, 'VM-template')
            .VIFs.map(vifId => this.#restApi.getObject<XoVif>(vifId, 'VIF').$network)
    for (const networkId of networkIds) {
      if (!scope.networks.includes(networkId)) {
        throw forbiddenOperation('create VM', `the network ${networkId} is not available to the project`)
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
      await xoApp.assertProjectQuotaForVm(id, templateId, body)

      return this.#vmService.create({
        ...body,
        pool: poolId,
        template: body.template as XoVmTemplate['uuid'],
        vdis: body.vdis as Parameters<VmService['create']>[0]['vdis'],
        project: id,
      })
    })
  }
}
