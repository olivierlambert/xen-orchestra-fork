import { inject } from 'inversify'
import { provide } from 'inversify-binding-decorators'
import { Controller, Extension, Get, Route, Security, Tags } from 'tsoa'

import { RestApi } from '../rest-api/rest-api.mjs'

type PortalConfig = {
  /** provider name shown in the portal */
  name: string
  logoUrl?: string
  supportUrl?: string
  /** brand color, CSS value */
  color?: string
  currency: string
  prices: {
    storagePerGiBMonth: number
    snapshotPerGiBMonth: number
    ipPerHour: number
  }
}

const DEFAULT_CONFIG: PortalConfig = {
  name: 'Cloud',
  currency: 'EUR',
  prices: { storagePerGiBMonth: 0, snapshotPerGiBMonth: 0, ipPerHour: 0 },
}

/**
 * Branding and public prices of the tenant portal, from the `[portal]` section of the xo-server configuration.
 *
 * Public: the portal shows the provider name on its sign-in page.
 */
@Route('portal-config')
@Tags('projects')
@provide(PortalConfigController)
export class PortalConfigController extends Controller {
  #restApi: RestApi

  constructor(@inject(RestApi) restApi: RestApi) {
    super()
    this.#restApi = restApi
  }

  @Extension('x-mcp-exposure', 'deny')
  @Get('')
  @Security('none')
  getPortalConfig(): PortalConfig {
    const config = (
      this.#restApi.xoApp as unknown as { config: { getOptional(path: string): unknown } }
    ).config.getOptional('portal') as Partial<PortalConfig> | undefined
    // public: only the known keys, other entries of the section must not leak
    return {
      name: config?.name ?? DEFAULT_CONFIG.name,
      logoUrl: config?.logoUrl,
      supportUrl: config?.supportUrl,
      color: config?.color,
      currency: config?.currency ?? DEFAULT_CONFIG.currency,
      prices: {
        storagePerGiBMonth: config?.prices?.storagePerGiBMonth ?? DEFAULT_CONFIG.prices.storagePerGiBMonth,
        snapshotPerGiBMonth: config?.prices?.snapshotPerGiBMonth ?? DEFAULT_CONFIG.prices.snapshotPerGiBMonth,
        ipPerHour: config?.prices?.ipPerHour ?? DEFAULT_CONFIG.prices.ipPerHour,
      },
    }
  }
}
