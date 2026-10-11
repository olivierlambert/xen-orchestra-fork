import type { XoOrganization, XoOrganizationRole } from '@vates/types'
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
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import { invalidParameters } from 'xo-common/api-errors.js'

import { badRequestResp, createdResp, noContentResp, unauthorizedResp } from '../open-api/common/response.common.mjs'
import { RestApi } from '../rest-api/rest-api.mjs'

type AccountToken = {
  /** first characters of the token, the full token is only returned at creation */
  prefix: string
  description?: string
  createdAt?: number
  expiresAt: number
  lastUsedAt?: number
}

/**
 * The current user: profile, password, SSH keys and API tokens.
 *
 * Available to every authenticated user, used by the tenant portal. Tokens have the rights of the user.
 */
@Route('account')
@Security('*', ['acl'])
@Response(badRequestResp.status, badRequestResp.description)
@Response(unauthorizedResp.status, unauthorizedResp.description)
@Tags('projects')
@provide(AccountController)
export class AccountController extends Controller {
  #restApi: RestApi

  constructor(@inject(RestApi) restApi: RestApi) {
    super()
    this.#restApi = restApi
  }

  get #user() {
    return this.#restApi.getCurrentUser()
  }

  @Extension('x-mcp-exposure', 'allow')
  @Get('')
  async getAccount(): Promise<{
    id: string
    name: string
    isAdmin: boolean
    organizations: { id: string; name: string; role: XoOrganizationRole; suspended: boolean }[]
  }> {
    const user = this.#user
    const organizations = (await this.#restApi.xoApp.getOrganizations()) as (XoOrganization & {
      suspended?: unknown
    })[]
    return {
      id: user.id,
      name: user.name ?? user.email,
      isAdmin: user.permission === 'admin',
      organizations: organizations
        .filter(organization => organization.members[user.id] !== undefined)
        .map(organization => ({
          id: organization.id,
          name: organization.name,
          role: organization.members[user.id],
          suspended: organization.suspended !== undefined,
        })),
    }
  }

  /**
   * @example body { "oldPassword": "…", "newPassword": "…" }
   */
  @Extension('x-mcp-exposure', 'deny')
  @Post('actions/change_password')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  async changePassword(@Body() body: { oldPassword: string; newPassword: string }): Promise<void> {
    if (body.newPassword.length < 8) {
      throw invalidParameters('the new password must have at least 8 characters')
    }
    await this.#restApi.xoApp.changeUserPassword(this.#user.id, body.oldPassword, body.newPassword)
  }

  /**
   * Injected into new instances with cloud-init. Same storage as XO 5.
   */
  @Extension('x-mcp-exposure', 'allow')
  @Get('ssh-keys')
  getSshKeys(): Promise<{ title: string; key: string }[]> {
    return this.#restApi.xoApp.getUserSshKeys(this.#user.id)
  }

  /**
   * @example body { "title": "laptop", "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA… me@laptop" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('ssh-keys')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  async addSshKey(@Body() body: { title: string; key: string }): Promise<void> {
    await this.#restApi.xoApp.addUserSshKey(this.#user.id, body)
  }

  /**
   * @example body { "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA… me@laptop" }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('ssh-keys/actions/remove')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  async removeSshKey(@Body() body: { key: string }): Promise<void> {
    await this.#restApi.xoApp.removeUserSshKey(this.#user.id, body.key)
  }

  @Extension('x-mcp-exposure', 'allow')
  @Get('tokens')
  async getTokens(): Promise<AccountToken[]> {
    const tokens = await this.#restApi.xoApp.getAuthenticationTokensForUser(this.#user.id)
    return tokens.map(token => ({
      prefix: token.id.slice(0, 8),
      description: token.description,
      createdAt: token.created_at,
      expiresAt: token.expiration,
      lastUsedAt: (token as { last_uses?: Record<string, { timestamp: number }> }).last_uses
        ? Math.max(
            ...Object.values((token as { last_uses: Record<string, { timestamp: number }> }).last_uses).map(
              _ => _.timestamp
            )
          )
        : undefined,
    }))
  }

  /**
   * The token is returned once, it has the rights of the current user.
   *
   * @example body { "description": "terraform", "expiresIn": "30 days" }
   */
  @Extension('x-mcp-exposure', 'deny')
  @Post('tokens')
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  async createToken(
    @Body() body: { description: string; expiresIn?: string }
  ): Promise<{ token: string; prefix: string; expiresAt: number }> {
    const token = await this.#restApi.xoApp.createAuthenticationToken({
      userId: this.#user.id,
      description: body.description,
      expiresIn: body.expiresIn,
      client: { id: `portal-api-key-${Date.now()}` },
    })
    this.setStatus(createdResp.status)
    return { token: token.id, prefix: token.id.slice(0, 8), expiresAt: token.expiration }
  }

  /**
   * Revokes the token starting with this prefix.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Delete('tokens/{prefix}')
  @SuccessResponse(noContentResp.status, noContentResp.description)
  async revokeToken(@Path() prefix: string): Promise<void> {
    const tokens = await this.#restApi.xoApp.getAuthenticationTokensForUser(this.#user.id)
    const matching = tokens.filter(token => token.id.startsWith(prefix))
    if (prefix.length < 8 || matching.length !== 1) {
      throw invalidParameters('unknown token')
    }
    await this.#restApi.xoApp.deleteAuthenticationToken(matching[0].id)
  }
}
