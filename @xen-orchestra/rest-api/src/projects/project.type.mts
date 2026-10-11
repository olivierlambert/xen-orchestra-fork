import type { XoOrganizationRole, XoProject, XoProjectQuota, XoProjectRole, XoProjectUsage, XoUser } from '@vates/types'
import type { Unbrand } from '../open-api/common/response.common.mjs'
import type { CreateVmAfterCreateParams } from '../pools/pool.type.mjs'

export type ProjectScope = {
  pools?: string[]
  templates?: string[]
  networks?: string[]
  srs?: string[]
}

export type CreateProjectBody = {
  organizationId: string
  name: string
  description?: string
  quota?: XoProjectQuota
  scope?: ProjectScope
}

export type UpdateProjectBody = {
  name?: string
  description?: string
  quota?: XoProjectQuota
  scope?: ProjectScope
}

export type ProjectWithRole = Unbrand<XoProject> & {
  /** effective role of the current user in the project */
  role: XoProjectRole
}

export type ProjectDetails = ProjectWithRole & {
  usage: XoProjectUsage
}

export type ProjectMember = {
  userId: Unbrand<XoUser>['id']
  name: string
  role: XoProjectRole
}

export type OrganizationMember = {
  userId: Unbrand<XoUser>['id']
  name: string
  role: XoOrganizationRole
}

/**
 * Same as the pool `create_vm` action, restricted to what a tenant may choose.
 *
 * The pool, template, networks and SRs must be in the project scope, and the instance must fit in the quota.
 */
export type ProjectCreateVmBody = {
  pool: string
  /** template UUID */
  template: string
  name_label: string
  name_description?: string
  cpus?: number
  /** in bytes */
  memory?: number
  vdis?: (
    | {
        name_label: string
        size: number
        sr: string
        name_description?: string
      }
    | {
        userdevice: string
        name_label?: string
        size?: number
        sr?: string
        name_description?: string
      }
    | {
        destroy: true
        userdevice: string
      }
  )[]
  vifs?: {
    network: string
    device?: string
    mac?: string
  }[]
} & CreateVmAfterCreateParams
