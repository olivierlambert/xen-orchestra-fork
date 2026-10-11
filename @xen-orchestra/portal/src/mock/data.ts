import type {
  ActivityEvent,
  ApiKey,
  BackupPolicy,
  FirewallRule,
  FloatingIp,
  Instance,
  Network,
  Offering,
  Organization,
  PortForward,
  Project,
  Quota,
  RestorePoint,
  Snapshot,
  SshKey,
  Template,
} from './types.ts'

const HOUR = 3600e3
const DAY = 24 * HOUR
const now = Date.now()

export const CURRENCY = 'EUR'

export const PROVIDER = {
  name: 'Nimbus Hosting',
  supportUrl: 'https://example.org/support',
}

export const currentUser = {
  name: 'Camille Martin',
  email: 'camille@acme.example',
}

export const organization: Organization = { id: 'org-acme', name: 'ACME Corp' }

export const projects: Project[] = [
  { id: 'prj-web', organizationId: 'org-acme', name: 'Web platform', description: 'Production websites and APIs' },
  { id: 'prj-data', organizationId: 'org-acme', name: 'Data lab', description: 'Analytics and batch jobs' },
]

export const quotas: Record<string, Quota> = {
  'prj-web': { instances: 20, vcpus: 48, memoryGiB: 128, storageGiB: 2000, floatingIps: 5, snapshots: 40 },
  'prj-data': { instances: 10, vcpus: 64, memoryGiB: 256, storageGiB: 4000, floatingIps: 2, snapshots: 20 },
}

export const offerings: Offering[] = [
  { id: 'g1.small', name: 'g1.small', family: 'general', vcpus: 1, memoryGiB: 2, diskGiB: 20, pricePerHour: 0.012 },
  { id: 'g1.medium', name: 'g1.medium', family: 'general', vcpus: 2, memoryGiB: 4, diskGiB: 40, pricePerHour: 0.024 },
  { id: 'g1.large', name: 'g1.large', family: 'general', vcpus: 4, memoryGiB: 8, diskGiB: 80, pricePerHour: 0.048 },
  { id: 'c1.large', name: 'c1.large', family: 'compute', vcpus: 8, memoryGiB: 8, diskGiB: 80, pricePerHour: 0.08 },
  { id: 'c1.xlarge', name: 'c1.xlarge', family: 'compute', vcpus: 16, memoryGiB: 16, diskGiB: 160, pricePerHour: 0.16 },
  { id: 'm1.large', name: 'm1.large', family: 'memory', vcpus: 4, memoryGiB: 32, diskGiB: 80, pricePerHour: 0.09 },
  { id: 'm1.xlarge', name: 'm1.xlarge', family: 'memory', vcpus: 8, memoryGiB: 64, diskGiB: 160, pricePerHour: 0.18 },
]

export const templates: Template[] = [
  { id: 'tpl-debian-13', name: 'Debian', os: 'debian', version: '13 (Trixie)', minDiskGiB: 10, cloudInit: true },
  { id: 'tpl-ubuntu-2604', name: 'Ubuntu', os: 'ubuntu', version: '26.04 LTS', minDiskGiB: 10, cloudInit: true },
  { id: 'tpl-rocky-10', name: 'Rocky Linux', os: 'rocky', version: '10', minDiskGiB: 20, cloudInit: true },
  { id: 'tpl-alma-10', name: 'AlmaLinux', os: 'alma', version: '10', minDiskGiB: 20, cloudInit: true },
  { id: 'tpl-win-2025', name: 'Windows Server', os: 'windows', version: '2025', minDiskGiB: 40, cloudInit: false },
]

export const backupPolicies: BackupPolicy[] = [
  {
    id: 'bp-daily',
    name: 'Daily',
    description: 'Every night at 02:00, offsite copy',
    schedule: 'Daily 02:00',
    retention: 7,
    pricePerGiBMonth: 0.02,
  },
  {
    id: 'bp-hourly',
    name: 'Business critical',
    description: 'Every 4 hours, offsite copy, immutable',
    schedule: 'Every 4 hours',
    retention: 42,
    pricePerGiBMonth: 0.05,
  },
]

export const networks: Network[] = [
  {
    id: 'net-front',
    projectId: 'prj-web',
    name: 'frontend',
    cidr: '10.10.0.0/24',
    gateway: '10.10.0.1',
    dhcp: true,
    routerState: 'running',
  },
  {
    id: 'net-back',
    projectId: 'prj-web',
    name: 'backend',
    cidr: '10.20.0.0/24',
    gateway: '10.20.0.1',
    dhcp: true,
    routerState: 'running',
  },
  {
    id: 'net-lab',
    projectId: 'prj-data',
    name: 'lab',
    cidr: '10.50.0.0/24',
    gateway: '10.50.0.1',
    dhcp: true,
    routerState: 'running',
  },
]

export const sshKeys: SshKey[] = [
  { id: 'key-laptop', name: 'camille-laptop', fingerprint: 'SHA256:q8Zx…7hPw', createdAt: now - 120 * DAY },
  { id: 'key-ci', name: 'ci-deploy', fingerprint: 'SHA256:Lk3a…02Fe', createdAt: now - 60 * DAY },
]

export const instances: Instance[] = [
  {
    id: 'i-7f3a21',
    projectId: 'prj-web',
    name: 'web-01',
    state: 'running',
    offeringId: 'g1.medium',
    templateId: 'tpl-debian-13',
    networkId: 'net-front',
    privateIp: '10.10.0.11',
    extraDiskGiB: 0,
    backupPolicyId: 'bp-daily',
    sshKeyIds: ['key-laptop', 'key-ci'],
    createdAt: now - 45 * DAY,
  },
  {
    id: 'i-7f3a22',
    projectId: 'prj-web',
    name: 'web-02',
    state: 'running',
    offeringId: 'g1.medium',
    templateId: 'tpl-debian-13',
    networkId: 'net-front',
    privateIp: '10.10.0.12',
    extraDiskGiB: 0,
    backupPolicyId: 'bp-daily',
    sshKeyIds: ['key-laptop', 'key-ci'],
    createdAt: now - 45 * DAY,
  },
  {
    id: 'i-91bc04',
    projectId: 'prj-web',
    name: 'api-01',
    state: 'running',
    offeringId: 'c1.large',
    templateId: 'tpl-ubuntu-2604',
    networkId: 'net-back',
    privateIp: '10.20.0.21',
    extraDiskGiB: 0,
    backupPolicyId: 'bp-hourly',
    sshKeyIds: ['key-ci'],
    createdAt: now - 30 * DAY,
  },
  {
    id: 'i-2d8e5f',
    projectId: 'prj-web',
    name: 'db-01',
    state: 'running',
    offeringId: 'm1.large',
    templateId: 'tpl-rocky-10',
    networkId: 'net-back',
    privateIp: '10.20.0.31',
    extraDiskGiB: 200,
    backupPolicyId: 'bp-hourly',
    sshKeyIds: ['key-laptop'],
    createdAt: now - 90 * DAY,
  },
  {
    id: 'i-55aa10',
    projectId: 'prj-web',
    name: 'staging',
    state: 'halted',
    offeringId: 'g1.small',
    templateId: 'tpl-debian-13',
    networkId: 'net-front',
    privateIp: '10.10.0.50',
    extraDiskGiB: 0,
    backupPolicyId: undefined,
    sshKeyIds: ['key-laptop'],
    createdAt: now - 12 * DAY,
  },
  {
    id: 'i-c0ffee',
    projectId: 'prj-data',
    name: 'spark-master',
    state: 'running',
    offeringId: 'm1.xlarge',
    templateId: 'tpl-ubuntu-2604',
    networkId: 'net-lab',
    privateIp: '10.50.0.10',
    extraDiskGiB: 500,
    backupPolicyId: undefined,
    sshKeyIds: ['key-laptop'],
    createdAt: now - 20 * DAY,
  },
]

export const snapshots: Snapshot[] = [
  { id: 'snap-1', instanceId: 'i-2d8e5f', name: 'before-pg18-upgrade', createdAt: now - 3 * DAY, sizeGiB: 38 },
  { id: 'snap-2', instanceId: 'i-91bc04', name: 'release-2026.10', createdAt: now - 1 * DAY, sizeGiB: 6 },
]

export const restorePoints: RestorePoint[] = instances.flatMap(instance => {
  const policy = backupPolicies.find(policy => policy.id === instance.backupPolicyId)
  if (policy === undefined) {
    return []
  }

  const interval = policy.id === 'bp-hourly' ? 4 * HOUR : DAY
  return Array.from({ length: Math.min(policy.retention, 8) }, (_, index) => ({
    id: `rp-${instance.id}-${index}`,
    instanceId: instance.id,
    policyId: policy.id,
    createdAt: now - (index + 1) * interval,
    sizeGiB: 4 + ((index * 7) % 5),
  }))
})

export const floatingIps: FloatingIp[] = [
  { id: 'fip-1', projectId: 'prj-web', address: '185.42.17.10', instanceId: undefined },
  { id: 'fip-2', projectId: 'prj-web', address: '185.42.17.11', instanceId: 'i-91bc04' },
  { id: 'fip-3', projectId: 'prj-data', address: '185.42.17.40', instanceId: undefined },
]

export const portForwards: PortForward[] = [
  { id: 'pf-1', floatingIpId: 'fip-1', protocol: 'tcp', publicPort: 80, instanceId: 'i-7f3a21', privatePort: 80 },
  { id: 'pf-2', floatingIpId: 'fip-1', protocol: 'tcp', publicPort: 443, instanceId: 'i-7f3a21', privatePort: 443 },
  { id: 'pf-3', floatingIpId: 'fip-1', protocol: 'tcp', publicPort: 2222, instanceId: 'i-55aa10', privatePort: 22 },
]

export const firewallRules: FirewallRule[] = [
  { id: 'fw-1', networkId: 'net-front', protocol: 'tcp', ports: '80,443', source: '0.0.0.0/0', action: 'allow' },
  { id: 'fw-2', networkId: 'net-front', protocol: 'tcp', ports: '22', source: '203.0.113.0/24', action: 'allow' },
  { id: 'fw-3', networkId: 'net-back', protocol: 'tcp', ports: '5432', source: '10.10.0.0/24', action: 'allow' },
  { id: 'fw-4', networkId: 'net-back', protocol: 'any', ports: '*', source: '0.0.0.0/0', action: 'deny' },
]

export const apiKeys: ApiKey[] = [
  {
    id: 'ak-1',
    name: 'terraform',
    prefix: 'xop_4f2a',
    role: 'project-admin',
    createdAt: now - 40 * DAY,
    lastUsedAt: now - 2 * HOUR,
  },
  {
    id: 'ak-2',
    name: 'monitoring',
    prefix: 'xop_9c1e',
    role: 'read-only',
    createdAt: now - 10 * DAY,
    lastUsedAt: now - 5 * 60e3,
  },
]

export const activity: ActivityEvent[] = [
  { id: 'ev-1', projectId: 'prj-web', at: now - 25 * 60e3, user: 'terraform', message: 'Started instance api-01' },
  {
    id: 'ev-2',
    projectId: 'prj-web',
    at: now - 3 * HOUR,
    user: 'Camille Martin',
    message: 'Added port forward 185.42.17.10:2222 → staging:22',
  },
  {
    id: 'ev-3',
    projectId: 'prj-web',
    at: now - 1 * DAY,
    user: 'Camille Martin',
    message: 'Snapshot release-2026.10 of api-01',
  },
  {
    id: 'ev-4',
    projectId: 'prj-web',
    at: now - 3 * DAY,
    user: 'Camille Martin',
    message: 'Snapshot before-pg18-upgrade of db-01',
  },
  {
    id: 'ev-5',
    projectId: 'prj-data',
    at: now - 2 * DAY,
    user: 'Camille Martin',
    message: 'Created instance spark-master',
  },
]
