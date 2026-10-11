import type { XoOrganizationRole, XoProject, XoProjectQuota, XoProjectRole, XoProjectUsage, XoUser } from '@vates/types'
import type { Unbrand } from '../open-api/common/response.common.mjs'
import type { CreateVmAfterCreateParams } from '../pools/pool.type.mjs'

export type ProjectScope = {
  pools?: string[]
  templates?: string[]
  networks?: string[]
  srs?: string[]
  /** when not empty, instances can only be created with one of these sizes */
  offerings?: string[]
  /** public IPs are allocated from these pools at creation */
  ipPools?: string[]
  /** backup jobs (smart mode, by tag) the instances can be subscribed to */
  backupJobs?: string[]
}

export type Offering = {
  id: string
  name: string
  family: string
  cpus: number
  /** in bytes */
  memory: number
  /** system disk, in bytes */
  disk: number
  pricePerHour: number
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

export type ProjectResource = {
  id: string
  name: string
  poolId: string
}

export type ProjectNetwork = ProjectResource & {
  description: string
  /** instances on this network get an address from an IP pool of the project */
  publicIpv4: boolean
}

export type ProjectTemplate = ProjectResource & {
  /** to pass to `create_vm` */
  uuid: string
  cpus: number
  /** in bytes */
  memory: number
  /** existing or provisioned disks, sizes in bytes */
  disks: { userdevice: string; size: number }[]
}

export type ProjectDetails = ProjectWithRole & {
  usage: XoProjectUsage
  /**
   * Names and properties of the resources in the project scope, that tenants cannot read directly.
   *
   * Resources which do not exist anymore are omitted.
   */
  resources: {
    pools: { id: string; name: string }[]
    templates: ProjectTemplate[]
    networks: ProjectNetwork[]
    srs: (ProjectResource & { size: number; usage: number })[]
    offerings: Offering[]
  }
}

export type ProjectBackupPolicy = {
  id: string
  name: string
  /** instances carrying this tag are backed up by the policy */
  tag: string
  /** enabled schedules only */
  schedules: {
    cron: string
    timezone?: string
    /** restore points kept */
    retention: number
  }[]
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
  /** required when the project has offerings, the size then comes from the offering */
  offering?: string
  /** template UUID */
  template: string
  name_label: string
  name_description?: string
  /**
   * @isInt
   * @minimum 1
   */
  cpus?: number
  /**
   * in bytes
   * @isInt
   * @minimum 1
   */
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
        /**
         * in bytes
         * @isInt
         * @minimum 1
         */
        size?: number
        sr?: string
        name_description?: string
      }
    | {
        destroy: true
        userdevice: string
      }
  )[]
  /** the VIFs of the template are not kept, MAC addresses are generated */
  vifs: {
    network: string
  }[]
} & CreateVmAfterCreateParams
