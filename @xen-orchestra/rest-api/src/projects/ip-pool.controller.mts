import type { XoIpPool } from '@vates/types'
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
import { invalidParameters } from 'xo-common/api-errors.js'

import {
  badRequestResp,
  createdResp,
  noContentResp,
  notFoundResp,
  unauthorizedResp,
} from '../open-api/common/response.common.mjs'
import { RestApi } from '../rest-api/rest-api.mjs'

type IpPool = {
  id: string
  name: string
  networks: string[]
  gateway?: string
  prefixLength?: number
  dns?: string[]
  addresses: { address: string; vifs: string[] }[]
}

type IpPoolBody = {
  name: string
  networks: string[]
  gateway?: string
  prefixLength?: number
  dns?: string[]
  /** addresses or ranges, e.g. `192.0.2.10` or `192.0.2.10-192.0.2.50` */
  addresses: string[]
}

const toInt = (address: string) => address.split('.').reduce((value, part) => value * 256 + Number(part), 0)
const toAddress = (value: number) => [24, 16, 8, 0].map(shift => Math.floor(value / 2 ** shift) % 256).join('.')
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function expandAddresses(entries: string[]): string[] {
  const addresses: string[] = []
  for (const entry of entries) {
    const [start, end = start] = entry.split('-').map(_ => _.trim())
    if (!IPV4_RE.test(start) || !IPV4_RE.test(end) || toInt(end) < toInt(start) || toInt(end) - toInt(start) > 65535) {
      throw invalidParameters(`invalid address or range: ${entry}`)
    }
    for (let value = toInt(start); value <= toInt(end); value++) {
      addresses.push(toAddress(value))
    }
  }
  return addresses
}

const format = ({ addresses = {}, networks = [], ...pool }: XoIpPool): IpPool => ({
  ...pool,
  networks,
  addresses: Object.entries(addresses).map(([address, { vifs = [] }]) => ({ address, vifs })),
})

/**
 * Pools of public IPv4 addresses, allocated to the instances of the projects listing them in their scope.
 *
 * Administrators only. `gateway`, `prefixLength` and `dns` let XO configure the addresses with cloud-init.
 */
@Route('ip-pools')
@Security('*')
@Response(badRequestResp.status, badRequestResp.description)
@Response(unauthorizedResp.status, unauthorizedResp.description)
@Tags('projects')
@provide(IpPoolController)
export class IpPoolController extends Controller {
  #restApi: RestApi

  constructor(@inject(RestApi) restApi: RestApi) {
    super()
    this.#restApi = restApi
  }

  @Extension('x-mcp-exposure', 'allow')
  @Get('')
  async getIpPools(): Promise<IpPool[]> {
    return (await this.#restApi.xoApp.getAllIpPools()).map(format)
  }

  @Extension('x-mcp-exposure', 'allow')
  @Get('{id}')
  @Response(notFoundResp.status, notFoundResp.description)
  async getIpPool(@Path() id: string): Promise<IpPool> {
    return format(await this.#restApi.xoApp.getIpPool(id))
  }

  /**
   * @example body {
   *   "name": "Public block A",
   *   "networks": ["2df56aaf-b691-3985-cf2e-09fe2e035a43"],
   *   "addresses": ["192.0.2.10-192.0.2.50"],
   *   "gateway": "192.0.2.1",
   *   "prefixLength": 24,
   *   "dns": ["9.9.9.9"]
   * }
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Post('')
  @Middlewares(json())
  @SuccessResponse(createdResp.status, createdResp.description)
  async createIpPool(@Body() body: IpPoolBody): Promise<{ id: string }> {
    const addresses = Object.fromEntries(expandAddresses(body.addresses).map(address => [address, {}]))
    const id = await this.#restApi.xoApp.createIpPool({
      ...body,
      networks: body.networks as XoIpPool['networks'],
      addresses,
    })
    this.setStatus(createdResp.status)
    return { id }
  }

  /**
   * `addresses`, when given, replaces the addresses of the pool: removed addresses are released.
   */
  @Extension('x-mcp-exposure', 'confirm')
  @Patch('{id}')
  @Middlewares(json())
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async updateIpPool(@Path() id: string, @Body() body: Partial<IpPoolBody>): Promise<void> {
    const xoApp = this.#restApi.xoApp
    let addresses: Record<string, { vifs?: string[] } | null> | undefined
    if (body.addresses !== undefined) {
      const wanted = new Set(expandAddresses(body.addresses))
      const current = (await xoApp.getIpPool(id)).addresses ?? {}
      addresses = {}
      for (const address of Object.keys(current)) {
        if (!wanted.has(address)) {
          addresses[address] = null
        }
      }
      for (const address of wanted) {
        if (!(address in current)) {
          addresses[address] = {}
        }
      }
    }
    await xoApp.updateIpPool(id, { ...body, networks: body.networks as XoIpPool['networks'], addresses })
  }

  @Extension('x-mcp-exposure', 'deny')
  @Delete('{id}')
  @SuccessResponse(noContentResp.status, noContentResp.description)
  @Response(notFoundResp.status, notFoundResp.description)
  async deleteIpPool(@Path() id: string): Promise<void> {
    await this.#restApi.xoApp.deleteIpPool(id)
  }
}
