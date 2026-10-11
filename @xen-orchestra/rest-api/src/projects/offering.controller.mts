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
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'

import {
  badRequestResp,
  createdResp,
  noContentResp,
  notFoundResp,
  unauthorizedResp,
} from '../open-api/common/response.common.mjs'
import { RestApi } from '../rest-api/rest-api.mjs'
import type { Offering } from './project.type.mjs'

/**
 * Instance sizes sold by the provider. Projects propose the offerings of their scope.
 *
 * Administrators only: tenants see the offerings of their projects in the project details.
 */
@Route('offerings')
@Security('*')
@Response(badRequestResp.status, badRequestResp.description)
@Response(unauthorizedResp.status, unauthorizedResp.description)
@Tags('projects')
@provide(OfferingController)
export class OfferingController extends Controller {
  #restApi: RestApi

  constructor(@inject(RestApi) restApi: RestApi) {
    super()
    this.#restApi = restApi
  }

  @Extension('x-mcp-exposure', 'allow')
  @Get('')
  getOfferings(): Promise<Offering[]> {
    return this.#restApi.xoApp.getOfferings()
  }

  /**
   * @example body {
   *   "name": "g1.medium",
   *   "family": "general",
   *   "cpus": 2,
   *   "memory": 4294967296,
   *   "disk": 42949672960,
   *   "pricePerHour": 0.024
   * }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('')
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  async createOffering(@Body() body: Omit<Offering, 'id'>): Promise<{ id: string }> {
    const { id } = await this.#restApi.xoApp.createOffering(body)
    this.setStatus(createdResp.status)
    return { id }
  }

  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}')
  @Response(notFoundResp.status, notFoundResp.description)
  getOffering(@Path() id: string): Promise<Offering> {
    return this.#restApi.xoApp.getOffering(id)
  }

  /**
   * Existing instances keep their size.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Patch('{id}')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async updateOffering(@Path() id: string, @Body() body: Partial<Omit<Offering, 'id'>>): Promise<void> {
    await this.#restApi.xoApp.updateOffering(id, body)
  }

  /**
   * Also removes the offering from the projects proposing it. Existing instances keep their size.
   */
  @Extension('x-mcp-exposure', 'deny')
  @Delete('{id}')
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async deleteOffering(@Path() id: string): Promise<void> {
    await this.#restApi.xoApp.deleteOffering(id)
  }
}
