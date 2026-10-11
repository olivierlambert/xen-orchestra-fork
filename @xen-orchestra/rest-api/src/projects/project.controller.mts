import type {
  XoOrganization,
  XoProject,
  XoProjectRestorePoint,
  XoProjectRole,
  XoProjectUsageRecord,
  XoUser,
  XoVm,
} from '@vates/types'
import { json } from 'express'
import { inject } from 'inversify'
import { provide } from 'inversify-binding-decorators'
import {
  Body,
  Controller,
  Delete,
  Extension,
  Get,
  Middlewares,
  Patch,
  Path,
  Post,
  Put,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'

import {
  badRequestResp,
  createdResp,
  forbiddenOperationResp,
  noContentResp,
  notFoundResp,
  unauthorizedResp,
  type Unbrand,
} from '../open-api/common/response.common.mjs'
import { RestApi } from '../rest-api/rest-api.mjs'
import { ProjectService } from './project.service.mjs'
import type {
  CreateProjectBody,
  ProjectBackupPolicy,
  ProjectCreateVmBody,
  ProjectDetails,
  ProjectMember,
  ProjectWithRole,
  UpdateProjectBody,
} from './project.type.mjs'

/**
 * Projects of the tenant model: a project belongs to an organization, owns instances and has a quota.
 *
 * Tenants (users without the admin permission) only see the projects they are members of, and only manage
 * them according to their role in the project. Creating projects and changing their quota or scope is
 * reserved to administrators.
 */
@Route('projects')
@Security('*')
@Response(badRequestResp.status, badRequestResp.description)
@Response(unauthorizedResp.status, unauthorizedResp.description)
@Tags('projects')
@provide(ProjectController)
export class ProjectController extends Controller {
  #restApi: RestApi
  #projectService: ProjectService

  constructor(@inject(RestApi) restApi: RestApi, @inject(ProjectService) projectService: ProjectService) {
    super()
    this.#restApi = restApi
    this.#projectService = projectService
  }

  get #user() {
    return this.#restApi.getCurrentUser()
  }

  /**
   * Projects the current user is a member of, with their role. All projects for administrators.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('')
  @Security('*', ['acl'])
  getProjects(): Promise<ProjectWithRole[]> {
    return this.#projectService.getProjectsForUser(this.#user)
  }

  /**
   * Administrators only.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('')
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  async createProject(@Body() body: CreateProjectBody): Promise<{ id: Unbrand<XoProject>['id'] }> {
    const { id } = await this.#restApi.xoApp.createProject({
      ...body,
      organizationId: body.organizationId as XoOrganization['id'],
      scope: body.scope as Partial<XoProject['scope']>,
    })
    this.setStatus(createdResp.status)
    return { id }
  }

  /**
   * Requires a role in the project.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  getProject(@Path() id: string): Promise<ProjectDetails> {
    return this.#projectService.getProjectDetails(this.#user, id as XoProject['id'])
  }

  /**
   * Administrators only.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Patch('{id}')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async updateProject(@Path() id: string, @Body() body: UpdateProjectBody): Promise<void> {
    await this.#restApi.xoApp.updateProject(id as XoProject['id'], {
      ...body,
      scope: body.scope as Partial<XoProject['scope']>,
    })
  }

  /**
   * Administrators only. The project must not own any instance or disk anymore.
   */
  @Extension('x-mcp-exposure', 'deny')
  @Delete('{id}')
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async deleteProject(@Path() id: string): Promise<void> {
    await this.#restApi.xoApp.deleteProject(id as XoProject['id'])
  }

  /**
   * Requires a role in the project.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}/members')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async getProjectMembers(@Path() id: string): Promise<ProjectMember[]> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'viewer')
    return this.#projectService.getMembers(id as XoProject['id'])
  }

  /**
   * Gives a role in the project to a member of its organization.
   *
   * Requires the admin role in the project (organization admins are admins of all its projects).
   *
   * @example body { "role": "member" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Put('{id}/members/{userId}')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async setProjectMember(
    @Path() id: string,
    @Path() userId: string,
    @Body() body: { role: XoProjectRole }
  ): Promise<void> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'admin')
    await this.#projectService.setMember(id as XoProject['id'], userId as XoUser['id'], body.role)
  }

  /**
   * Requires the admin role in the project.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Delete('{id}/members/{userId}')
  @Security('*', ['acl'])
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async removeProjectMember(@Path() id: string, @Path() userId: string): Promise<void> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'admin')
    await this.#projectService.setMember(id as XoProject['id'], userId as XoUser['id'], null)
  }

  /**
   * Creates an instance owned by the project.
   *
   * Requires the member role in the project. The pool, template, networks and SRs must be in the project
   * scope, and the instance must fit in the project quota.
   *
   * @example body {
   *   "pool": "355ee47d-ff4c-4924-3db2-fd86ae629677",
   *   "template": "9bbcc5d1-ad4b-06f1-18f6-03125e809c38",
   *   "name_label": "web-01",
   *   "cpus": 2,
   *   "memory": 4294967296,
   *   "boot": true
   * }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('{id}/actions/create_vm')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async createVm(@Path() id: string, @Body() body: ProjectCreateVmBody): Promise<{ id: string }> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'member')
    const vmId = await this.#projectService.createVm(id as XoProject['id'], body)
    this.setStatus(createdResp.status)
    return { id: vmId }
  }

  /**
   * Hourly samples of the resources of the project, for billing tools. Requires a role in the project.
   *
   * @param from timestamp in milliseconds, defaults to the beginning
   * @param to timestamp in milliseconds, defaults to now
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}/usage-records')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  async getUsageRecords(
    @Path() id: string,
    @Query() from?: number,
    @Query() to?: number
  ): Promise<Unbrand<XoProjectUsageRecord>[]> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'viewer')
    return this.#restApi.xoApp.getProjectUsageRecords(id as XoProject['id'], { from, to })
  }

  /**
   * Backup policies the instances of the project can be subscribed to, with the tag marking subscribed instances.
   *
   * Requires a role in the project.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}/backup-policies')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  async getBackupPolicies(@Path() id: string): Promise<ProjectBackupPolicy[]> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'viewer')
    // the tag tells which instances are subscribed, from their tags; the remotes stay private to the provider
    return (await this.#restApi.xoApp.getProjectBackupPolicies(id as XoProject['id'])).map(
      ({ id, name, tag, schedules }) => ({
        id,
        name,
        tag,
        schedules: schedules
          .filter(_ => _.enabled)
          .map(({ cron, timezone, retention }) => ({ cron, timezone, retention })),
      })
    )
  }

  /**
   * Requires a role in the project.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}/vms/{vmId}/backup-policy')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async getInstanceBackupPolicy(@Path() id: string, @Path() vmId: string): Promise<{ policyId: string | null }> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'viewer')
    const policyId = await this.#restApi.xoApp.getInstanceBackupPolicy(id as XoProject['id'], vmId as XoVm['id'])
    return { policyId: policyId ?? null }
  }

  /**
   * Subscribes an instance to a backup policy of the project, or unsubscribes it with `null`.
   *
   * Requires the member role in the project.
   *
   * @example body { "policyId": "f3e1e2b0-7f43-4c38-8b5e-6a2b1b1c2d3e" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Put('{id}/vms/{vmId}/backup-policy')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async setInstanceBackupPolicy(
    @Path() id: string,
    @Path() vmId: string,
    @Body() body: { policyId: string | null }
  ): Promise<void> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'member')
    await this.#restApi.xoApp.setInstanceBackupPolicy(id as XoProject['id'], vmId as XoVm['id'], body.policyId)
  }

  /**
   * Restore points made by the backup policies of the project, including those of deleted instances.
   *
   * Requires a role in the project.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}/restore-points')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  async getRestorePoints(@Path() id: string, @Query() vmId?: string): Promise<XoProjectRestorePoint[]> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'viewer')
    return this.#restApi.xoApp.listProjectRestorePoints(id as XoProject['id'], { vmId })
  }

  /**
   * Restores a restore point of the project as a new instance, on an SR of the project, within the quota.
   *
   * Requires the member role in the project.
   *
   * @example body { "restorePoint": "<backup repository id>/xo-vm-backups/<vm uuid>/<timestamp>.json", "sr": "<sr id>" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('{id}/actions/restore')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async restore(
    @Path() id: string,
    @Body() body: { restorePoint: string; sr: string; name?: string }
  ): Promise<{ id: string }> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'member')
    const vmId = await this.#restApi.xoApp.restoreProjectBackup(id as XoProject['id'], body.restorePoint, {
      srId: body.sr,
      name: body.name,
    })
    this.setStatus(createdResp.status)
    return { id: vmId }
  }

  /**
   * Takes a snapshot of an instance of the project, within the snapshot quota.
   *
   * Requires the member role in the project.
   *
   * @example body { "name_label": "before-upgrade" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('{id}/vms/{vmId}/actions/snapshot')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async snapshotVm(
    @Path() id: string,
    @Path() vmId: string,
    @Body() body: { name_label?: string }
  ): Promise<{ id: string }> {
    await this.#restApi.xoApp.assertProjectRole(this.#user, id as XoProject['id'], 'member')
    const snapshotId = await this.#restApi.xoApp.snapshotProjectVm(id as XoProject['id'], vmId as XoVm['id'], {
      name: body.name_label,
    })
    this.setStatus(createdResp.status)
    return { id: snapshotId }
  }
}
