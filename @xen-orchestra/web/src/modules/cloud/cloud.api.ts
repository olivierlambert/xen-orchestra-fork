// Provider side of the tenant model: organizations, projects, offerings and IP pools.
// These are not XAPI objects, they are plain REST resources read and changed on demand.
import { ApiError } from '@/shared/error/api.error.ts'
import { fetchDelete, fetchPatch, fetchPost, fetchRequest } from '@/shared/utils/fetch.util.ts'

export const GiB = 1024 ** 3

export type CloudOrganizationRole = 'member' | 'admin'
export type CloudProjectRole = 'viewer' | 'member' | 'admin'

export type CloudOrganization = {
  id: string
  name: string
  members: Record<string, CloudOrganizationRole>
  adminGroupId: string
  suspended?: { at: number; reason: string }
  billing?: CloudBillingMode
  costCenter?: string
}

export type CloudBillingMode = 'billing' | 'showback' | 'none'

export type CloudQuota = Partial<Record<'instances' | 'vcpus' | 'memory' | 'storage' | 'snapshots' | 'ips', number>>

export type CloudScope = {
  pools: string[]
  templates: string[]
  networks: string[]
  srs: string[]
  offerings: string[]
  ipPools: string[]
  backupJobs: string[]
}

export type CloudProject = {
  id: string
  organizationId: string
  name: string
  description: string
  quota: CloudQuota
  scope: CloudScope
}

export type CloudProjectDetails = CloudProject & {
  usage: Required<CloudQuota>
}

export type CloudMember = { userId: string; name: string; role: CloudOrganizationRole }

export type CloudOffering = {
  id: string
  name: string
  family: string
  cpus: number
  memory: number
  disk: number
  pricePerHour: number
}

export type CloudIpPool = {
  id: string
  name: string
  networks: string[]
  gateway?: string
  prefixLength?: number
  dns?: string[]
  addresses: { address: string; vifs: string[] }[]
}

export const QUOTA_KEYS = ['instances', 'vcpus', 'memory', 'storage', 'snapshots', 'ips'] as const

/** quota keys expressed in bytes, edited in GiB */
export const BYTES_QUOTA_KEYS = new Set<keyof CloudQuota>(['memory', 'storage'])

export const EMPTY_SCOPE: CloudScope = {
  pools: [],
  templates: [],
  networks: [],
  srs: [],
  offerings: [],
  ipPools: [],
  backupJobs: [],
}

export const cloudApi = {
  getOrganizations: () => fetchRequest<CloudOrganization[]>('organizations'),
  createOrganization: (name: string) => fetchPost<{ id: string }>('organizations', { name }),
  deleteOrganization: (id: string) => fetchDelete(`organizations/${id}`),
  updateOrganization: (
    id: string,
    body: { name?: string; billing?: CloudBillingMode | null; costCenter?: string | null }
  ) => fetchPatch(`organizations/${id}`, body),
  getMembers: (id: string) => fetchRequest<CloudMember[]>(`organizations/${id}/members`),
  createUser: (id: string, body: { name: string; password: string; role: CloudOrganizationRole }) =>
    fetchPost<{ id: string }>(`organizations/${id}/users`, body),
  suspend: (id: string, reason: string) => fetchPost<void>(`organizations/${id}/actions/suspend`, { reason }),
  resume: (id: string) => fetchPost<void>(`organizations/${id}/actions/resume`),

  getProjects: () => fetchRequest<CloudProject[]>('projects'),
  getProject: (id: string) => fetchRequest<CloudProjectDetails>(`projects/${id}`),
  createProject: (body: Omit<CloudProject, 'id'>) => fetchPost<{ id: string }>('projects', body),
  updateProject: (id: string, body: Omit<CloudProject, 'id' | 'organizationId'>) => fetchPatch(`projects/${id}`, body),
  deleteProject: (id: string) => fetchDelete(`projects/${id}`),

  getOfferings: () => fetchRequest<CloudOffering[]>('offerings'),
  createOffering: (body: Omit<CloudOffering, 'id'>) => fetchPost<{ id: string }>('offerings', body),
  deleteOffering: (id: string) => fetchDelete(`offerings/${id}`),

  getIpPools: () => fetchRequest<CloudIpPool[]>('ip-pools'),
  createIpPool: (body: {
    name: string
    networks: string[]
    addresses: string[]
    gateway?: string
    prefixLength?: number
    dns?: string[]
  }) => fetchPost<{ id: string }>('ip-pools', body),
  deleteIpPool: (id: string) => fetchDelete(`ip-pools/${id}`),
}

/** Readable message of a failed call, XO puts the reason of forbidden operations in `data` */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const cause = error.cause as { error?: string; data?: { reason?: string } } | undefined
    return cause?.data?.reason ?? cause?.error ?? error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export type CloudInfrastructure = {
  pools: { id: string; name_label: string }[]
  templates: { id: string; name_label: string; $pool: string; isDefaultTemplate: boolean }[]
  networks: { id: string; name_label: string; $pool: string }[]
  srs: { id: string; name_label: string; $pool: string; content_type: string }[]
  backupJobs: { id: string; name?: string; type: string }[]
}

/** What a project scope can list, for the project form */
export async function getCloudInfrastructure(): Promise<CloudInfrastructure> {
  const [pools, templates, networks, srs, backupJobs] = await Promise.all([
    fetchRequest<CloudInfrastructure['pools']>('pools?fields=id,name_label'),
    fetchRequest<CloudInfrastructure['templates']>('vm-templates?fields=id,name_label,$pool,isDefaultTemplate'),
    fetchRequest<CloudInfrastructure['networks']>('networks?fields=id,name_label,$pool'),
    fetchRequest<CloudInfrastructure['srs']>('srs?fields=id,name_label,$pool,content_type'),
    fetchRequest<CloudInfrastructure['backupJobs']>('backup-jobs?fields=id,name,type'),
  ])
  const byName = (a: { name_label: string }, b: { name_label: string }) => a.name_label.localeCompare(b.name_label)
  return {
    pools: pools.sort(byName),
    templates: templates.sort(byName),
    networks: networks.sort(byName),
    srs: srs.filter(sr => sr.content_type !== 'iso').sort(byName),
    backupJobs: backupJobs.filter(job => job.type === 'backup'),
  }
}
