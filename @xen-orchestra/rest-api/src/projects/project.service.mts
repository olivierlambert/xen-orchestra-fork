import type { XoNetwork, XoPool, XoProject, XoProjectRole, XoSr, XoUser, XoVif, XoVm, XoVmTemplate } from '@vates/types'
import { forbiddenOperation } from 'xo-common/api-errors.js'

import type { RestApi } from '../rest-api/rest-api.mjs'
import { VmService } from '../vms/vm.service.mjs'
import type { ProjectCreateVmBody, ProjectDetails, ProjectMember, ProjectWithRole } from './project.type.mjs'

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
    return { ...project, role, usage }
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

    for (const vdi of body.vdis ?? []) {
      if ('destroy' in vdi) {
        continue
      }
      if (!('userdevice' in vdi) && vdi.sr === undefined) {
        throw forbiddenOperation('create VM', 'new disks must specify an SR')
      }
      if (vdi.sr !== undefined && !scope.srs.includes(vdi.sr as XoSr['id'])) {
        throw forbiddenOperation('create VM', `the SR ${vdi.sr} is not available to the project`)
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
