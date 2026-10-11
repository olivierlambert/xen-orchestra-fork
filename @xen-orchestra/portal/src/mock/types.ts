// Shapes of the resources the portal expects from the future tenant-scoped REST API.
// Everything here is mocked for the prototype: none of these concepts exist in xo-server yet,
// except instances (VMs), templates, snapshots and tokens which map to existing objects.

export type Organization = {
  id: string
  name: string
}

export type Project = {
  id: string
  organizationId: string
  name: string
  description: string
}

export type Quota = {
  instances: number
  vcpus: number
  memoryGiB: number
  storageGiB: number
  floatingIps: number
  snapshots: number
}

export type Offering = {
  id: string
  name: string
  family: 'general' | 'compute' | 'memory'
  vcpus: number
  memoryGiB: number
  diskGiB: number
  pricePerHour: number
}

export type TemplateOs = 'debian' | 'ubuntu' | 'rocky' | 'alma' | 'windows'

export type Template = {
  id: string
  name: string
  os: TemplateOs
  version: string
  minDiskGiB: number
  cloudInit: boolean
}

export type InstanceState = 'creating' | 'running' | 'halted' | 'paused' | 'restoring'

export type Instance = {
  id: string
  projectId: string
  name: string
  state: InstanceState
  offeringId: string
  templateId: string
  networkId: string
  privateIp: string
  extraDiskGiB: number
  backupPolicyId: string | undefined
  sshKeyIds: string[]
  createdAt: number
}

export type Snapshot = {
  id: string
  instanceId: string
  name: string
  createdAt: number
  sizeGiB: number
}

export type BackupPolicy = {
  id: string
  name: string
  description: string
  schedule: string
  retention: number
  pricePerGiBMonth: number
}

export type RestorePoint = {
  id: string
  instanceId: string
  policyId: string
  createdAt: number
  sizeGiB: number
}

export type Network = {
  id: string
  projectId: string
  name: string
  cidr: string
  gateway: string
  dhcp: boolean
  routerState: 'running' | 'starting'
}

export type FloatingIp = {
  id: string
  projectId: string
  address: string
  instanceId: string | undefined
}

export type Protocol = 'tcp' | 'udp'

export type PortForward = {
  id: string
  floatingIpId: string
  protocol: Protocol
  publicPort: number
  instanceId: string
  privatePort: number
}

export type FirewallRule = {
  id: string
  networkId: string
  protocol: Protocol | 'icmp' | 'any'
  ports: string
  source: string
  action: 'allow' | 'deny'
}

export type ApiKey = {
  id: string
  name: string
  prefix: string
  role: 'project-admin' | 'project-member' | 'read-only'
  createdAt: number
  lastUsedAt: number | undefined
}

export type SshKey = {
  id: string
  name: string
  fingerprint: string
  createdAt: number
}

export type ActivityEvent = {
  id: string
  projectId: string
  at: number
  user: string
  message: string
}

export type UsageCategory = 'compute' | 'storage' | 'snapshots' | 'backups' | 'floating-ips'

export type UsageLine = {
  category: UsageCategory
  resourceId: string
  resourceName: string
  quantity: number
  unit: string
  cost: number
}
