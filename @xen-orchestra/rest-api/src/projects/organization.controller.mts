import type { XoBillingMode, XoOrganization, XoOrganizationRole, XoUser } from '@vates/types'
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
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import { forbiddenOperation } from 'xo-common/api-errors.js'

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
import type { OrganizationMember } from './project.type.mjs'

/**
 * Organizations of the tenant model: a customer, owning projects and having members.
 *
 * Organization admins manage the members of the organization and of all its projects, but cannot create
 * projects nor change their quota.
 */
@Route('organizations')
@Security('*')
@Response(badRequestResp.status, badRequestResp.description)
@Response(unauthorizedResp.status, unauthorizedResp.description)
@Tags('projects')
@provide(OrganizationController)
export class OrganizationController extends Controller {
  #restApi: RestApi

  constructor(@inject(RestApi) restApi: RestApi) {
    super()
    this.#restApi = restApi
  }

  get #user() {
    return this.#restApi.getCurrentUser()
  }

  /**
   * Organizations the current user is a member of. All organizations for administrators.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('')
  @Security('*', ['acl'])
  async getOrganizations(): Promise<Unbrand<XoOrganization>[]> {
    const user = this.#user
    const organizations = await this.#restApi.xoApp.getOrganizations()
    return user.permission === 'admin'
      ? organizations
      : organizations.filter(organization => organization.members[user.id] !== undefined)
  }

  /**
   * Administrators only.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('')
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  async createOrganization(
    @Body() body: { name: string; billing?: XoBillingMode; costCenter?: string }
  ): Promise<{ id: Unbrand<XoOrganization>['id'] }> {
    const { id } = await this.#restApi.xoApp.createOrganization(body)
    this.setStatus(createdResp.status)
    return { id }
  }

  /**
   * Requires being a member of the organization.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async getOrganization(@Path() id: string): Promise<Unbrand<XoOrganization>> {
    await this.#restApi.xoApp.assertOrganizationRole(this.#user, id as XoOrganization['id'], 'member')
    return this.#restApi.xoApp.getOrganization(id as XoOrganization['id'])
  }

  /**
   * Administrators only. `null` removes the billing mode (the default of the configuration applies) or the cost
   * center.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Patch('{id}')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async updateOrganization(
    @Path() id: string,
    @Body() body: { name?: string; billing?: XoBillingMode | null; costCenter?: string | null }
  ): Promise<void> {
    await this.#restApi.xoApp.updateOrganization(id as XoOrganization['id'], body)
  }

  /**
   * Administrators only. The organization must not have projects anymore.
   */
  @Extension('x-mcp-exposure', 'deny')
  @Delete('{id}')
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async deleteOrganization(@Path() id: string): Promise<void> {
    await this.#restApi.xoApp.deleteOrganization(id as XoOrganization['id'])
  }

  /**
   * Requires being a member of the organization.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}/members')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async getOrganizationMembers(@Path() id: string): Promise<OrganizationMember[]> {
    const xoApp = this.#restApi.xoApp
    await xoApp.assertOrganizationRole(this.#user, id as XoOrganization['id'], 'member')
    const { members } = await xoApp.getOrganization(id as XoOrganization['id'])
    const result: OrganizationMember[] = []
    for (const [userId, role] of Object.entries(members)) {
      // members whose user has been deleted are ignored
      const user = await xoApp.getUser(userId as XoUser['id']).catch(() => undefined)
      if (user !== undefined) {
        result.push({ userId: user.id, name: user.email, role })
      }
    }
    return result
  }

  /**
   * Creates a user who only has access to this organization.
   *
   * Requires the admin role in the organization.
   *
   * @example body { "name": "jane@acme.example", "password": "…", "role": "member" }
   */
  @Extension('x-mcp-exposure', 'deny')
  @Post('{id}/users')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async createOrganizationUser(
    @Path() id: string,
    @Body() body: { name: string; password: string; role?: XoOrganizationRole }
  ): Promise<{ id: Unbrand<XoUser>['id'] }> {
    const xoApp = this.#restApi.xoApp
    await xoApp.assertOrganizationRole(this.#user, id as XoOrganization['id'], 'admin')
    const user = await xoApp.createOrganizationUser(id as XoOrganization['id'], body)
    this.setStatus(createdResp.status)
    return { id: user.id }
  }

  /**
   * Adds a user to the organization or changes their role.
   *
   * Administrators can add any user. Organization admins can only change the role of existing members, new
   * users are added with `POST /organizations/{id}/users`.
   *
   * @example body { "role": "admin" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Put('{id}/members/{userId}')
  @Security('*', ['acl'])
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async setOrganizationMember(
    @Path() id: string,
    @Path() userId: string,
    @Body() body: { role: XoOrganizationRole }
  ): Promise<void> {
    const xoApp = this.#restApi.xoApp
    const user = this.#user
    const organizationId = id as XoOrganization['id']
    await xoApp.assertOrganizationRole(user, organizationId, 'admin')
    if (user.permission !== 'admin' && (await xoApp.getOrganization(organizationId)).members[userId] === undefined) {
      throw forbiddenOperation('add organization member', 'only administrators can add existing users')
    }
    await xoApp.setOrganizationMember(organizationId, userId as XoUser['id'], body.role)
  }

  /**
   * Removes a user from the organization and from all its projects.
   *
   * Requires the admin role in the organization.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Delete('{id}/members/{userId}')
  @Security('*', ['acl'])
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async removeOrganizationMember(@Path() id: string, @Path() userId: string): Promise<void> {
    await this.#restApi.xoApp.assertOrganizationRole(this.#user, id as XoOrganization['id'], 'admin')
    await this.#restApi.xoApp.setOrganizationMember(id as XoOrganization['id'], userId as XoUser['id'], null)
  }

  /**
   * Suspends the organization, e.g. for non-payment: its instances are stopped and its members lose every right
   * on its projects until it is resumed. Administrators only.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('{id}/actions/suspend')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async suspendOrganization(@Path() id: string, @Body() body: { reason?: string }): Promise<void> {
    await this.#restApi.xoApp.suspendOrganization(id as XoOrganization['id'], body)
  }

  /**
   * Gives back the rights of the members. Instances are not restarted. Administrators only.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('{id}/actions/resume')
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async resumeOrganization(@Path() id: string): Promise<void> {
    await this.#restApi.xoApp.resumeOrganization(id as XoOrganization['id'])
  }

  /**
   * Sets a new random password for a member who belongs to this organization only, and returns it.
   *
   * Requires the admin role in the organization.
   */
  @Extension('x-mcp-exposure', 'deny')
  @Post('{id}/members/{userId}/actions/reset_password')
  @Security('*', ['acl'])
  @Response(forbiddenOperationResp.status, forbiddenOperationResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async resetMemberPassword(@Path() id: string, @Path() userId: string): Promise<{ password: string }> {
    const xoApp = this.#restApi.xoApp
    await xoApp.assertOrganizationRole(this.#user, id as XoOrganization['id'], 'admin')
    return { password: await xoApp.resetMemberPassword(id as XoOrganization['id'], userId as XoUser['id']) }
  }
}
