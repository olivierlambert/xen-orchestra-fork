import { ensureConsoleCookie, login as xoLogin, logout as xoLogout, projectFilter, xo, XoApiError } from '@/api/xo.ts'
import * as data from '@/mock/data.ts'
import type {
  ApiKey,
  BackupPolicy,
  FirewallRule,
  Instance,
  InstanceState,
  Network,
  Offering,
  Organization,
  OrganizationMember,
  OrganizationRole,
  PortForward,
  Project,
  ProjectMember,
  ProjectRole,
  Provider,
  Quota,
  RestorePoint,
  Snapshot,
  SshKey,
  Template,
  TemplateOs,
  UsageLine,
  User,
} from '@/mock/types.ts'
import { setCurrency } from '@/utils/format.ts'
import { useIntervalFn, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

const HOURS_PER_MONTH = 730
const GiB = 1024 ** 3

// Price of instances which match no offering (created outside the portal, or resized by the provider)
const CUSTOM_PRICE_PER_VCPU_HOUR = 0.008
const CUSTOM_PRICE_PER_GIB_HOUR = 0.002

let counter = 0
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`

const randomHex = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const toGiB = (bytes: number) => Math.round(bytes / GiB)

const monthStart = () => {
  const date = new Date()
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * - `mock`: no Xen Orchestra reachable, everything is simulated in the browser
 * - `xo`: the tenant model of the XO REST API. Private networks behind a virtual router, public IPs as floating
 *   IPs and the firewall stay local previews: XO does not have them yet
 */
export type Backend = 'mock' | 'xo'

type Status = 'loading' | 'login' | 'ready'

// --- XO REST API shapes (subset of the fields requested)

type XoQuotaKey = 'instances' | 'vcpus' | 'memory' | 'storage' | 'snapshots' | 'ips'

type XoProjectDetails = {
  id: string
  organizationId: string
  name: string
  description: string
  role: ProjectRole
  quota: Partial<Record<XoQuotaKey, number>>
  usage: Record<XoQuotaKey, number>
  scope: { ipPools: string[] }
  resources: {
    templates: {
      id: string
      uuid: string
      name: string
      poolId: string
      disks: { userdevice: string; size: number }[]
    }[]
    networks: { id: string; name: string; poolId: string }[]
    srs: { id: string; name: string; poolId: string; size: number; usage: number }[]
    offerings: {
      id: string
      name: string
      family: string
      cpus: number
      memory: number
      disk: number
      pricePerHour: number
    }[]
  }
}

type XoVm = {
  id: string
  name_label: string
  power_state: 'Running' | 'Halted' | 'Paused' | 'Suspended'
  CPUs: { number: number }
  memory: { size: number; dynamic: [number, number] }
  mainIpAddress?: string
  creation?: { date?: string }
  other?: Record<string, string>
  tags: string[]
}

type XoVif = {
  id: string
  $VM: string
  $network: string
  allowedIpv4Addresses?: string[]
}

type XoVmSnapshot = {
  id: string
  name_label: string
  snapshot_time: number
  $snapshot_of: string
}

type XoUsageRecord = {
  at: number
  vms: { id: string; name: string; cpus: number; memory: number; disk: number; powerState: string; ips: string[] }[]
  snapshotsPhysicalSize: number
}

type XoBackupPolicy = { id: string; name: string; tag: string }

type XoAccount = {
  id: string
  name: string
  isAdmin: boolean
  organizations: { id: string; name: string; role: OrganizationRole; suspended: boolean }[]
}

const VM_STATES: Record<XoVm['power_state'], InstanceState> = {
  Running: 'running',
  Halted: 'halted',
  Paused: 'paused',
  Suspended: 'halted',
}

function guessOs(name: string): TemplateOs {
  const match = /debian|ubuntu|rocky|alma|windows/i.exec(name)
  return (match?.[0].toLowerCase() as TemplateOs | undefined) ?? 'debian'
}

/** OpenSSH fingerprint (SHA256 of the key blob), undefined where WebCrypto is unavailable (insecure context) */
async function sshFingerprint(publicKey: string): Promise<string | undefined> {
  try {
    const blob = Uint8Array.from(atob(publicKey.trim().split(/\s+/)[1]), char => char.charCodeAt(0))
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', blob))
    return `SHA256:${btoa(String.fromCharCode(...digest)).replace(/=+$/, '')}`
  } catch {
    return undefined
  }
}

export const usePortalStore = defineStore('portal', () => {
  const backend = ref<Backend>('mock')
  const status = ref<Status>('loading')
  const lastError = ref<string>()

  const provider = ref<Provider>(data.PROVIDER)
  const currentUser = ref<User>(data.currentUser)
  const account = ref<XoAccount>()
  const organization = ref<Organization>(data.organization)
  const projects = ref<Project[]>(structuredClone(data.projects))
  const currentProjectId = useLocalStorage('portal-project', data.projects[0].id)

  const organizationMembers = ref<OrganizationMember[]>(structuredClone(data.organizationMembers))
  const mockProjectMembers = reactive(structuredClone(data.projectMembers))
  const liveProjectMembers = ref<ProjectMember[]>([])

  const instances = ref(structuredClone(data.instances))
  const snapshots = ref(structuredClone(data.snapshots))
  const restorePoints = ref(structuredClone(data.restorePoints))
  const networks = ref(structuredClone(data.networks))
  const floatingIps = ref(structuredClone(data.floatingIps))
  const portForwards = ref(structuredClone(data.portForwards))
  const firewallRules = ref(structuredClone(data.firewallRules))
  const apiKeys = ref(structuredClone(data.apiKeys))
  const sshKeys = ref<SshKey[]>(structuredClone(data.sshKeys))
  const activity = ref(structuredClone(data.activity))

  const liveProject = ref<XoProjectDetails>()
  const liveBackupPolicies = ref<XoBackupPolicy[]>([])
  const usageRecords = ref<XoUsageRecord[]>([])
  const customOfferings = reactive(new Map<string, Offering>())

  const isLive = computed(() => backend.value === 'xo')

  const project = computed(() => projects.value.find(project => project.id === currentProjectId.value)!)

  const organizationSuspended = computed(
    () => account.value?.organizations.find(_ => _.id === project.value?.organizationId)?.suspended ?? false
  )

  const inProject = <T extends { projectId: string }>(items: T[]) =>
    items.filter(item => item.projectId === currentProjectId.value)

  const projectInstances = computed(() => inProject(instances.value))
  const projectNetworks = computed(() => inProject(networks.value))
  const projectFloatingIps = computed(() => inProject(floatingIps.value))
  const projectActivity = computed(() => inProject(activity.value).sort((a, b) => b.at - a.at))

  const projectInstanceIds = computed(() => new Set(projectInstances.value.map(instance => instance.id)))
  const projectSnapshots = computed(() =>
    snapshots.value.filter(snapshot => projectInstanceIds.value.has(snapshot.instanceId))
  )

  /** public IPs come from the IP pools of the project in live mode, floating IPs are a preview */
  const hasPublicIpPools = computed(() => isLive.value && (liveProject.value?.scope.ipPools.length ?? 0) !== 0)

  const templates = computed<Template[]>(() =>
    isLive.value
      ? (liveProject.value?.resources.templates ?? []).map(template => ({
          id: template.id,
          name: template.name,
          os: guessOs(template.name),
          version: '',
          minDiskGiB: Math.max(0, ...template.disks.map(disk => toGiB(disk.size))),
          cloudInit: !/windows/i.test(template.name),
        }))
      : data.templates
  )

  /** with offerings, the project only creates instances of these sizes */
  const hasProjectOfferings = computed(() => isLive.value && (liveProject.value?.resources.offerings.length ?? 0) !== 0)

  const offerings = computed<Offering[]>(() =>
    hasProjectOfferings.value
      ? liveProject.value!.resources.offerings.map(offering => ({
          id: offering.id,
          name: offering.name,
          family: (['general', 'compute', 'memory'].includes(offering.family)
            ? offering.family
            : 'general') as Offering['family'],
          vcpus: offering.cpus,
          memoryGiB: toGiB(offering.memory),
          diskGiB: toGiB(offering.disk),
          pricePerHour: offering.pricePerHour,
        }))
      : data.offerings
  )

  const backupPolicies = computed<BackupPolicy[]>(() =>
    isLive.value
      ? liveBackupPolicies.value.map(policy => ({
          id: policy.id,
          name: policy.name,
          description: 'Defined by your provider',
          schedule: '',
          retention: 0,
          pricePerGiBMonth: provider.value.prices.storagePerGiBMonth,
        }))
      : data.backupPolicies
  )

  const getOffering = (id: string) => offerings.value.find(offering => offering.id === id) ?? customOfferings.get(id)!
  const getTemplate = (id: string): Template =>
    templates.value.find(template => template.id === id) ?? {
      id,
      name: id.startsWith('unknown:') ? id.slice('unknown:'.length) || 'Custom image' : 'Custom image',
      os: guessOs(id),
      version: '',
      minDiskGiB: 0,
      cloudInit: false,
    }
  const getNetwork = (id: string) => networks.value.find(network => network.id === id)
  const getInstance = (id: string) => instances.value.find(instance => instance.id === id)
  const getBackupPolicy = (id: string | undefined) => backupPolicies.value.find(policy => policy.id === id)

  const instanceDiskGiB = (instance: Instance) =>
    instance.diskGiB ?? getOffering(instance.offeringId).diskGiB + instance.extraDiskGiB

  // --- Quota and usage

  const quota = computed<Quota>(() => {
    if (!isLive.value) {
      return data.quotas[currentProjectId.value]
    }
    const live = liveProject.value?.quota ?? {}
    return {
      instances: live.instances ?? Infinity,
      vcpus: live.vcpus ?? Infinity,
      memoryGiB: live.memory !== undefined ? toGiB(live.memory) : Infinity,
      storageGiB: live.storage !== undefined ? toGiB(live.storage) : Infinity,
      floatingIps: hasPublicIpPools.value ? (live.ips ?? Infinity) : 5,
      snapshots: live.snapshots ?? Infinity,
    }
  })

  // Quotas count allocated resources, whether the instances are running or not
  const usage = computed(() => {
    if (isLive.value && liveProject.value !== undefined) {
      const live = liveProject.value.usage
      return {
        instances: live.instances,
        vcpus: live.vcpus,
        memoryGiB: toGiB(live.memory),
        storageGiB: toGiB(live.storage),
        floatingIps: hasPublicIpPools.value ? live.ips : projectFloatingIps.value.length,
        snapshots: live.snapshots,
      }
    }

    const instances = projectInstances.value
    return {
      instances: instances.length,
      vcpus: instances.reduce((sum, instance) => sum + getOffering(instance.offeringId).vcpus, 0),
      memoryGiB: instances.reduce((sum, instance) => sum + getOffering(instance.offeringId).memoryGiB, 0),
      storageGiB: instances.reduce((sum, instance) => sum + instanceDiskGiB(instance), 0),
      floatingIps: projectFloatingIps.value.length,
      snapshots: projectSnapshots.value.length,
    }
  })

  /** hourly price of an instance size, from the offerings or the custom rate */
  function priceOf(vcpus: number, memoryGiB: number) {
    return (
      offerings.value.find(offering => offering.vcpus === vcpus && offering.memoryGiB === memoryGiB)?.pricePerHour ??
      vcpus * CUSTOM_PRICE_PER_VCPU_HOUR + memoryGiB * CUSTOM_PRICE_PER_GIB_HOUR
    )
  }

  /** Month to date, from the hourly usage records of XO: each sample counts until the next one */
  const liveUsageLines = computed<UsageLine[]>(() => {
    const { prices } = provider.value
    const lines = new Map<string, UsageLine>()
    const add = (line: Omit<UsageLine, 'quantity' | 'cost'>, quantity: number, cost: number) => {
      const key = `${line.category}/${line.resourceId}`
      const existing = lines.get(key)
      if (existing === undefined) {
        lines.set(key, { ...line, quantity, cost })
      } else {
        existing.quantity += quantity
        existing.cost += cost
      }
    }

    const records = usageRecords.value
    records.forEach((record, index) => {
      // a sample stands for the period until the next one, at most two hours (missed samples)
      const hours = Math.min(((records[index + 1]?.at ?? Date.now()) - record.at) / 3600e3, 2)
      for (const vm of record.vms) {
        const memoryGiB = toGiB(vm.memory)
        if (vm.powerState === 'Running') {
          const price = priceOf(vm.cpus, memoryGiB)
          add(
            {
              category: 'compute',
              resourceId: vm.id,
              resourceName: `${vm.name} (${vm.cpus} vCPU, ${memoryGiB} GiB)`,
              unit: 'h',
            },
            hours,
            hours * price
          )
        }
        const diskMonths = (toGiB(vm.disk) * hours) / HOURS_PER_MONTH
        add(
          { category: 'storage', resourceId: vm.id, resourceName: `${vm.name} disks`, unit: 'GiB·month' },
          diskMonths,
          diskMonths * prices.storagePerGiBMonth
        )
        for (const ip of vm.ips) {
          add(
            { category: 'floating-ips', resourceId: ip, resourceName: `${ip} (${vm.name})`, unit: 'h' },
            hours,
            hours * prices.ipPerHour
          )
        }
      }
      const snapshotMonths = ((record.snapshotsPhysicalSize / GiB) * hours) / HOURS_PER_MONTH
      if (snapshotMonths > 0) {
        add(
          { category: 'snapshots', resourceId: 'snapshots', resourceName: 'Snapshots (space used)', unit: 'GiB·month' },
          snapshotMonths,
          snapshotMonths * prices.snapshotPerGiBMonth
        )
      }
    })
    return [...lines.values()]
  })

  // Month-to-date usage of the mock, as the usage records would aggregate it
  const mockUsageLines = computed<UsageLine[]>(() => {
    const { prices } = provider.value
    const start = monthStart()
    const hoursSince = (from: number) => Math.max(0, (Date.now() - Math.max(from, start)) / 3600e3)
    const monthFraction = hoursSince(0) / HOURS_PER_MONTH

    const lines: UsageLine[] = []

    for (const instance of projectInstances.value) {
      const offering = getOffering(instance.offeringId)
      // The prototype has no power history: count running instances for the whole period
      const hours = instance.state === 'halted' ? 0 : hoursSince(instance.createdAt)
      lines.push({
        category: 'compute',
        resourceId: instance.id,
        resourceName: `${instance.name} (${offering.name})`,
        quantity: hours,
        unit: 'h',
        cost: hours * offering.pricePerHour,
      })

      const diskGiB = instanceDiskGiB(instance)
      const storageMonths = hoursSince(instance.createdAt) / HOURS_PER_MONTH
      lines.push({
        category: 'storage',
        resourceId: instance.id,
        resourceName: `${instance.name} disks`,
        quantity: diskGiB * storageMonths,
        unit: 'GiB·month',
        cost: diskGiB * storageMonths * prices.storagePerGiBMonth,
      })

      const policy = getBackupPolicy(instance.backupPolicyId)
      if (policy !== undefined) {
        const backupGiB = restorePoints.value
          .filter(point => point.instanceId === instance.id)
          .reduce((sum, point) => sum + point.sizeGiB, 0)
        lines.push({
          category: 'backups',
          resourceId: instance.id,
          resourceName: `${instance.name} (${policy.name})`,
          quantity: backupGiB * monthFraction,
          unit: 'GiB·month',
          cost: backupGiB * monthFraction * policy.pricePerGiBMonth,
        })
      }
    }

    for (const snapshot of projectSnapshots.value) {
      const months = hoursSince(snapshot.createdAt) / HOURS_PER_MONTH
      lines.push({
        category: 'snapshots',
        resourceId: snapshot.id,
        resourceName: snapshot.name,
        quantity: snapshot.sizeGiB * months,
        unit: 'GiB·month',
        cost: snapshot.sizeGiB * months * prices.snapshotPerGiBMonth,
      })
    }

    for (const ip of projectFloatingIps.value) {
      const hours = hoursSince(0)
      lines.push({
        category: 'floating-ips',
        resourceId: ip.id,
        resourceName: ip.address,
        quantity: hours,
        unit: 'h',
        cost: hours * prices.ipPerHour,
      })
    }

    return lines
  })

  const usageLines = computed(() => (isLive.value ? liveUsageLines.value : mockUsageLines.value))

  const monthToDateCost = computed(() => usageLines.value.reduce((sum, line) => sum + line.cost, 0))

  const estimatedHourlyCost = computed(() => {
    const { prices } = provider.value
    return (
      projectInstances.value
        .filter(instance => instance.state !== 'halted')
        .reduce((sum, instance) => sum + getOffering(instance.offeringId).pricePerHour, 0) +
      usage.value.floatingIps * prices.ipPerHour +
      (usage.value.storageGiB * prices.storagePerGiBMonth) / HOURS_PER_MONTH
    )
  })

  // --- Members and roles

  const projectMembers = computed(() =>
    isLive.value ? liveProjectMembers.value : (mockProjectMembers[currentProjectId.value] ?? [])
  )

  const organizationRole = computed<OrganizationRole | undefined>(() =>
    currentUser.value.isAdmin
      ? 'admin'
      : organizationMembers.value.find(member => member.userId === currentUser.value.id)?.role
  )

  const canManageProject = computed(() => project.value?.role === 'admin')
  const canManageOrganization = computed(() => organizationRole.value === 'admin')

  // --- Errors

  function reportError(error: unknown) {
    lastError.value =
      error instanceof XoApiError
        ? `${error.message} (HTTP ${error.status})`
        : error instanceof Error
          ? error.message
          : String(error)
  }

  /** Runs an action and reports its error instead of throwing, returns undefined on failure */
  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      reportError(error)
      return undefined
    }
  }

  function log(message: string) {
    activity.value.push({
      id: uid('ev'),
      projectId: currentProjectId.value,
      at: Date.now(),
      user: currentUser.value.name,
      message,
    })
  }

  // --- Live mode

  function getOfferingId(vcpus: number, memoryGiB: number) {
    const offering = offerings.value.find(offering => offering.vcpus === vcpus && offering.memoryGiB === memoryGiB)
    if (offering !== undefined) {
      return offering.id
    }
    const id = `custom-${vcpus}-${memoryGiB}`
    if (!customOfferings.has(id)) {
      customOfferings.set(id, {
        id,
        name: 'Custom',
        family: 'general',
        vcpus,
        memoryGiB,
        diskGiB: 0,
        pricePerHour: priceOf(vcpus, memoryGiB),
      })
    }
    return id
  }

  // disk sizes are not part of the VM objects: keep what we know across refreshes
  const knownDiskSizes = reactive(new Map<string, number>())

  function toInstance(vm: XoVm, vifs: XoVif[]): Instance {
    // allocated memory: `size` is the actual usage of running VMs
    const memoryGiB = toGiB(vm.memory.dynamic[1])
    const baseTemplate = vm.other?.base_template_name ?? ''
    const template = liveProject.value?.resources.templates.find(template => template.name === baseTemplate)
    const createdAt = Date.parse(vm.creation?.date ?? '')
    const ownVifs = vifs.filter(vif => vif.$VM === vm.id)

    return {
      id: vm.id,
      projectId: currentProjectId.value,
      name: vm.name_label,
      state: VM_STATES[vm.power_state] ?? 'halted',
      offeringId: getOfferingId(vm.CPUs.number, memoryGiB),
      templateId: template?.id ?? `unknown:${baseTemplate}`,
      networkId: ownVifs[0]?.$network ?? '',
      privateIp: vm.mainIpAddress ?? '',
      publicIps: ownVifs.flatMap(vif => vif.allowedIpv4Addresses ?? []),
      extraDiskGiB: 0,
      diskGiB: knownDiskSizes.get(vm.id),
      backupPolicyId: liveBackupPolicies.value.find(policy => vm.tags.includes(policy.tag))?.id,
      sshKeyIds: [],
      createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
    }
  }

  async function refreshProject() {
    const id = currentProjectId.value
    const [details, policies] = await Promise.all([
      xo.get<XoProjectDetails>(`/projects/${id}`),
      xo.get<XoBackupPolicy[]>(`/projects/${id}/backup-policies`),
    ])
    liveProject.value = details
    liveBackupPolicies.value = policies

    // the scoped networks stand in for the private networks until the virtual router exists
    networks.value = details.resources.networks.map(
      (network): Network => ({
        id: network.id,
        projectId: id,
        name: network.name,
        cidr: '',
        gateway: '',
        dhcp: false,
        routerState: 'running',
      })
    )
  }

  async function refreshInstances() {
    const id = currentProjectId.value
    const filter = projectFilter(id)
    const [vms, vmSnapshots, vifs] = await Promise.all([
      xo.get<XoVm[]>(
        `/vms?fields=id,name_label,power_state,CPUs,memory,mainIpAddress,creation,other,tags&filter=${filter}`
      ),
      xo.get<XoVmSnapshot[]>(`/vm-snapshots?fields=id,name_label,snapshot_time,$snapshot_of&filter=${filter}`),
      xo.get<XoVif[]>(`/vifs?fields=id,$VM,$network,allowedIpv4Addresses&filter=${filter}`),
    ])
    if (id !== currentProjectId.value) {
      return
    }

    instances.value = vms.map(vm => toInstance(vm, vifs))
    snapshots.value = vmSnapshots.map(
      (snapshot): Snapshot => ({
        id: snapshot.id,
        instanceId: snapshot.$snapshot_of,
        name: snapshot.name_label,
        createdAt: snapshot.snapshot_time * 1e3,
        sizeGiB: 0,
      })
    )
  }

  async function refreshRestorePoints() {
    const points = await xo.get<
      { id: string; vmId: string; vmName: string; timestamp: number; size: number; policyId: string }[]
    >(`/projects/${currentProjectId.value}/restore-points`)
    restorePoints.value = points.map(
      (point): RestorePoint => ({
        id: point.id,
        instanceId: point.vmId,
        policyId: point.policyId,
        createdAt: point.timestamp,
        sizeGiB: Math.round((point.size / GiB) * 10) / 10,
      })
    )
  }

  async function loadUsageRecords() {
    if (!isLive.value) {
      return
    }
    await guard(async () => {
      usageRecords.value = await xo.get<XoUsageRecord[]>(
        `/projects/${currentProjectId.value}/usage-records?from=${monthStart()}`
      )
    })
  }

  async function refreshMembers() {
    const id = currentProjectId.value
    const [members, orgMembers] = await Promise.all([
      xo.get<ProjectMember[]>(`/projects/${id}/members`),
      xo.get<OrganizationMember[]>(`/organizations/${project.value.organizationId}/members`),
    ])
    liveProjectMembers.value = members
    organizationMembers.value = orgMembers
  }

  async function refreshAccountData() {
    const [keys, tokens] = await Promise.all([
      xo.get<{ title: string; key: string }[]>('/account/ssh-keys'),
      xo.get<{ prefix: string; description?: string; createdAt?: number; lastUsedAt?: number }[]>('/account/tokens'),
    ])
    sshKeys.value = await Promise.all(
      keys.map(
        async ({ title, key }): Promise<SshKey> => ({
          id: key,
          name: title,
          fingerprint: (await sshFingerprint(key)) ?? key.split(/\s+/)[0],
          createdAt: 0,
          publicKey: key,
        })
      )
    )
    // the session of the portal itself is not an API key
    apiKeys.value = tokens
      .filter(token => token.description !== 'Cloud portal session')
      .map(
        (token): ApiKey => ({
          id: token.prefix,
          name: token.description ?? token.prefix,
          prefix: token.prefix,
          role: 'project-admin',
          createdAt: token.createdAt ?? 0,
          lastUsedAt: token.lastUsedAt,
        })
      )
  }

  async function loadProject() {
    if (!isLive.value || project.value === undefined) {
      return
    }
    await guard(async () => {
      organization.value = await xo.get<Organization>(`/organizations/${project.value.organizationId}`)
      await refreshProject()
      await Promise.all([refreshInstances(), refreshMembers(), refreshRestorePoints(), loadUsageRecords()])
    })
  }

  async function refreshLive() {
    if (!isLive.value || status.value !== 'ready' || project.value === undefined) {
      return
    }
    try {
      await Promise.all([refreshProject(), refreshInstances()])
    } catch (error) {
      if (error instanceof XoApiError && error.status === 401) {
        status.value = 'login'
      }
    }
  }

  // events trigger refreshes, polling only covers a lost event stream
  useIntervalFn(refreshLive, 60e3)

  let eventSource: EventSource | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleRefresh() {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(refreshLive, 1000)
  }

  /** XO REST events (server-sent events), filtered by XO with the rights of the user */
  function connectEvents() {
    eventSource?.close()
    eventSource = new EventSource('/rest/v0/events')
    eventSource.addEventListener('init', async event => {
      const { id } = JSON.parse((event as MessageEvent).data)
      for (const [collection, fields] of [
        ['VM', ['id', 'name_label', 'power_state', 'tags', 'mainIpAddress', 'CPUs', 'memory', '$project']],
        ['VM-snapshot', ['id', 'name_label', '$project']],
        ['VIF', ['id', 'allowedIpv4Addresses', '$project']],
      ] as const) {
        await xo.post(`/events/${id}/subscriptions`, { collection, fields }).catch(() => {})
      }
    })
    for (const type of ['add', 'update', 'remove']) {
      eventSource.addEventListener(type, scheduleRefresh)
    }
  }

  watch(currentProjectId, async () => {
    if (isLive.value) {
      instances.value = []
      snapshots.value = []
      restorePoints.value = []
      usageRecords.value = []
      await loadProject()
    }
  })

  async function loadProvider() {
    try {
      const config = await xo.get<Provider>('/portal-config')
      provider.value = { ...data.PROVIDER, ...config }
    } catch {
      provider.value = data.PROVIDER
    }
    setCurrency(provider.value.currency)
  }

  async function loadSession() {
    ensureConsoleCookie()
    account.value = await xo.get<XoAccount>('/account')
    currentUser.value = { id: account.value.id, name: account.value.name, isAdmin: account.value.isAdmin }

    projects.value = await xo.get<Project[]>('/projects')
    if (!projects.value.some(project => project.id === currentProjectId.value)) {
      currentProjectId.value = projects.value[0]?.id
    }

    // the previews start empty, they act on the real instances
    floatingIps.value = []
    portForwards.value = []
    firewallRules.value = []
    restorePoints.value = []
    activity.value = []

    status.value = 'ready'
    connectEvents()
    await Promise.all([loadProject(), guard(refreshAccountData)])
  }

  /**
   * Detects whether a Xen Orchestra is reachable on `/rest/v0`, and whether the user is signed in.
   */
  async function init() {
    try {
      await xo.get('/account')
    } catch (error) {
      if (error instanceof XoApiError && error.status === 401) {
        backend.value = 'xo'
        await loadProvider()
        status.value = 'login'
        return
      }
      backend.value = 'mock'
      setCurrency(provider.value.currency)
      status.value = 'ready'
      return
    }
    backend.value = 'xo'
    await loadProvider()
    await guard(loadSession)
  }

  async function login(username: string, password: string) {
    await xoLogin(username, password)
    await loadSession()
  }

  async function logout() {
    eventSource?.close()
    await xoLogout()
    status.value = 'login'
    liveProject.value = undefined
    account.value = undefined
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    if (!isLive.value) {
      await wait(300)
      return true
    }
    return (
      (await guard(async () => {
        await xo.post('/account/actions/change_password', { oldPassword, newPassword })
        // XO revokes every token of the account: sign in again with the new password
        await xoLogin(currentUser.value.name, newPassword)
        return true
      })) !== undefined
    )
  }

  // --- Instances

  async function createInstance(params: {
    name: string
    offeringId: string
    templateId: string
    networkId: string
    extraDiskGiB: number
    backupPolicyId: string | undefined
    sshKeyIds: string[]
  }): Promise<Instance | undefined> {
    if (isLive.value) {
      return guard(async () => {
        const offering = getOffering(params.offeringId)
        const template = liveProject.value!.resources.templates.find(template => template.id === params.templateId)
        if (template === undefined) {
          throw new Error('This image cannot be used to create an instance in this project')
        }
        const sr = liveProject.value!.resources.srs.find(sr => sr.poolId === template.poolId)

        const vdis: Record<string, unknown>[] = []
        const [systemDisk] = template.disks
        if (systemDisk !== undefined) {
          vdis.push({ userdevice: systemDisk.userdevice, size: Math.max(systemDisk.size, offering.diskGiB * GiB) })
        } else if (sr !== undefined) {
          vdis.push({ name_label: `${params.name}-system`, size: offering.diskGiB * GiB, sr: sr.id })
        }
        if (params.extraDiskGiB > 0) {
          if (sr === undefined) {
            throw new Error('No storage available to the project in the pool of this image')
          }
          vdis.push({ name_label: `${params.name}-data`, size: params.extraDiskGiB * GiB, sr: sr.id })
        }

        const publicKeys = sshKeys.value
          .filter(key => params.sshKeyIds.includes(key.id) && key.publicKey !== undefined)
          .map(key => key.publicKey!)

        const { id } = await xo.post<{ id: string }>(`/projects/${currentProjectId.value}/actions/create_vm`, {
          pool: template.poolId,
          template: template.uuid,
          name_label: params.name,
          ...(hasProjectOfferings.value
            ? { offering: offering.id }
            : { cpus: offering.vcpus, memory: offering.memoryGiB * GiB }),
          vdis,
          vifs: [{ network: params.networkId }],
          boot: true,
          ...(publicKeys.length !== 0 && {
            cloud_config: `#cloud-config\nssh_authorized_keys:\n${publicKeys.map(key => `  - ${key}`).join('\n')}\n`,
          }),
        })

        log(`Created instance ${params.name}`)
        if (params.backupPolicyId !== undefined) {
          await xo.put(`/projects/${currentProjectId.value}/vms/${id}/backup-policy`, {
            policyId: params.backupPolicyId,
          })
        }
        await Promise.all([refreshProject(), refreshInstances()])
        return getInstance(id)
      })
    }

    await wait(400)
    const network = getNetwork(params.networkId)!
    const hostPart = 100 + instances.value.filter(instance => instance.networkId === network.id).length
    const instance: Instance = {
      ...params,
      id: `i-${randomHex(6)}`,
      projectId: currentProjectId.value,
      state: 'creating',
      privateIp: network.cidr.replace(/\.0\/\d+$/, `.${hostPart}`),
      createdAt: Date.now(),
    }
    instances.value.push(instance)
    log(`Created instance ${instance.name}`)
    setTimeout(() => setState(instance.id, 'running'), 4000)
    return instance
  }

  function setState(id: string, state: InstanceState) {
    const instance = getInstance(id)
    if (instance !== undefined) {
      instance.state = state
    }
  }

  const POWER_ACTIONS = { start: 'start', stop: 'clean_shutdown', reboot: 'clean_reboot' } as const
  // used when the guest cannot cooperate (no guest tools), like the "force stop" of public clouds
  const FORCED_POWER_ACTIONS = { stop: 'hard_shutdown', reboot: 'hard_reboot' } as const

  async function powerAction(id: string, action: 'start' | 'stop' | 'reboot') {
    const instance = getInstance(id)!
    const label = `${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Rebooted'} instance ${instance.name}`

    if (isLive.value) {
      await guard(async () => {
        try {
          await xo.post(`/vms/${id}/actions/${POWER_ACTIONS[action]}?sync=true`)
          log(label)
        } catch (error) {
          if (action === 'start' || !(error instanceof XoApiError) || !error.message.includes('VM_LACKS_FEATURE')) {
            throw error
          }
          await refreshInstances()
          // the clean operation may have been half done before failing
          if (action === 'reboot' || getInstance(id)?.state !== 'halted') {
            await xo.post(`/vms/${id}/actions/${FORCED_POWER_ACTIONS[action]}?sync=true`)
          }
          log(`${label} (forced, the instance has no guest tools)`)
        }
        await refreshInstances()
      })
      return
    }

    await wait(600)
    instance.state = action === 'stop' ? 'halted' : 'running'
    log(label)
  }

  function forgetInstance(id: string) {
    instances.value = instances.value.filter(item => item.id !== id)
    snapshots.value = snapshots.value.filter(snapshot => snapshot.instanceId !== id)
    portForwards.value = portForwards.value.filter(forward => forward.instanceId !== id)
    for (const ip of floatingIps.value) {
      if (ip.instanceId === id) {
        ip.instanceId = undefined
      }
    }
  }

  async function deleteInstance(id: string) {
    const instance = getInstance(id)!

    if (isLive.value) {
      return guard(async () => {
        await xo.delete(`/vms/${id}`)
        forgetInstance(id)
        log(`Deleted instance ${instance.name}`)
        await refreshProject()
        return true
      })
    }

    await wait(400)
    forgetInstance(id)
    log(`Deleted instance ${instance.name}`)
    return true
  }

  async function loadInstanceDisks(id: string) {
    if (!isLive.value) {
      return
    }
    await guard(async () => {
      const vdis = await xo.get<{ size: number }[]>(`/vms/${id}/vdis?fields=size`)
      const diskGiB = toGiB(vdis.reduce((sum, vdi) => sum + vdi.size, 0))
      knownDiskSizes.set(id, diskGiB)
      const instance = getInstance(id)
      if (instance !== undefined) {
        instance.diskGiB = diskGiB
      }
    })
  }

  // --- Snapshots

  async function createSnapshot(instanceId: string, name: string) {
    const instance = getInstance(instanceId)!

    if (isLive.value) {
      await guard(async () => {
        // through the project: snapshots count in its quota
        await xo.post(`/projects/${currentProjectId.value}/vms/${instanceId}/actions/snapshot`, { name_label: name })
        log(`Snapshot ${name} of ${instance.name}`)
        await Promise.all([refreshProject(), refreshInstances()])
      })
      return
    }

    await wait(800)
    snapshots.value.push({
      id: uid('snap'),
      instanceId,
      name,
      createdAt: Date.now(),
      sizeGiB: Math.round(instanceDiskGiB(instance) * 0.15),
    })
    log(`Snapshot ${name} of ${instance.name}`)
  }

  async function revertSnapshot(snapshotId: string) {
    const snapshot = snapshots.value.find(item => item.id === snapshotId)!
    const instance = getInstance(snapshot.instanceId)!

    if (isLive.value) {
      instance.state = 'restoring'
      await guard(async () => {
        await xo.post(`/vms/${instance.id}/actions/revert_snapshot?sync=true`, { snapshotId })
        log(`Reverted ${instance.name} to snapshot ${snapshot.name}`)
      })
      await guard(refreshInstances)
      return
    }

    instance.state = 'restoring'
    await wait(2000)
    instance.state = 'running'
    log(`Reverted ${instance.name} to snapshot ${snapshot.name}`)
  }

  async function deleteSnapshot(snapshotId: string) {
    const snapshot = snapshots.value.find(item => item.id === snapshotId)!

    if (isLive.value) {
      await guard(async () => {
        await xo.delete(`/vm-snapshots/${snapshotId}`)
        snapshots.value = snapshots.value.filter(item => item.id !== snapshotId)
        log(`Deleted snapshot ${snapshot.name}`)
        await refreshProject()
      })
      return
    }

    await wait(300)
    snapshots.value = snapshots.value.filter(item => item.id !== snapshotId)
    log(`Deleted snapshot ${snapshot.name}`)
  }

  // --- Backups

  async function setBackupPolicy(instanceId: string, policyId: string | undefined) {
    const instance = getInstance(instanceId)!
    const message =
      policyId === undefined
        ? `Disabled backups for ${instance.name}`
        : `Enabled ${getBackupPolicy(policyId)!.name} backups for ${instance.name}`

    if (isLive.value) {
      await guard(async () => {
        await xo.put(`/projects/${currentProjectId.value}/vms/${instanceId}/backup-policy`, {
          policyId: policyId ?? null,
        })
        log(message)
        await refreshInstances()
      })
      return
    }

    instance.backupPolicyId = policyId
    log(message)
  }

  /** In live mode, restores happen as a new instance only */
  const canRestoreInPlace = computed(() => !isLive.value)

  async function restore(restorePointId: string, mode: 'in-place' | 'new-instance') {
    const point = restorePoints.value.find(item => item.id === restorePointId)!
    const instance = getInstance(point.instanceId)
    const date = new Date(point.createdAt).toLocaleString()

    if (isLive.value) {
      return guard(async () => {
        const sr = liveProject.value!.resources.srs[0]
        if (sr === undefined) {
          throw new Error('No storage available to the project')
        }
        const { id } = await xo.post<{ id: string }>(`/projects/${currentProjectId.value}/actions/restore`, {
          restorePoint: restorePointId,
          sr: sr.id,
        })
        log(`Restored ${instance?.name ?? 'an instance'} from the backup of ${date} as a new instance`)
        await Promise.all([refreshProject(), refreshInstances()])
        return getInstance(id)
      })
    }

    if (mode === 'in-place') {
      instance!.state = 'restoring'
      log(`Restoring ${instance!.name} from backup of ${date}`)
      await wait(3000)
      instance!.state = 'running'
      return instance
    }

    return createInstance({
      name: `${instance!.name}-restored`,
      offeringId: instance!.offeringId,
      templateId: instance!.templateId,
      networkId: instance!.networkId,
      extraDiskGiB: instance!.extraDiskGiB,
      backupPolicyId: undefined,
      sshKeyIds: instance!.sshKeyIds,
    })
  }

  // --- Networking (preview in both modes)

  async function createNetwork(params: Pick<Network, 'name' | 'cidr'>) {
    await wait(400)
    const network: Network = {
      ...params,
      id: uid('net'),
      projectId: currentProjectId.value,
      gateway: params.cidr.replace(/\.0\/\d+$/, '.1'),
      dhcp: true,
      routerState: 'starting',
    }
    networks.value.push(network)
    log(`Created network ${network.name} (${network.cidr})`)
    setTimeout(() => {
      const created = getNetwork(network.id)
      if (created !== undefined) {
        created.routerState = 'running'
      }
    }, 3000)
  }

  async function allocateFloatingIp() {
    await wait(400)
    const address = `185.42.17.${50 + floatingIps.value.length}`
    floatingIps.value.push({ id: uid('fip'), projectId: currentProjectId.value, address, instanceId: undefined })
    log(`Allocated floating IP ${address}`)
  }

  function releaseFloatingIp(id: string) {
    const ip = floatingIps.value.find(item => item.id === id)!
    floatingIps.value = floatingIps.value.filter(item => item.id !== id)
    portForwards.value = portForwards.value.filter(forward => forward.floatingIpId !== id)
    log(`Released floating IP ${ip.address}`)
  }

  function attachFloatingIp(id: string, instanceId: string | undefined) {
    const ip = floatingIps.value.find(item => item.id === id)!
    ip.instanceId = instanceId
    if (instanceId !== undefined) {
      portForwards.value = portForwards.value.filter(forward => forward.floatingIpId !== id)
    }
    log(
      instanceId === undefined
        ? `Detached floating IP ${ip.address}`
        : `Attached floating IP ${ip.address} to ${getInstance(instanceId)!.name}`
    )
  }

  function addPortForward(params: Omit<PortForward, 'id'>) {
    portForwards.value.push({ ...params, id: uid('pf') })
    const ip = floatingIps.value.find(item => item.id === params.floatingIpId)!
    log(
      `Added port forward ${ip.address}:${params.publicPort} → ${getInstance(params.instanceId)!.name}:${params.privatePort}`
    )
  }

  function removePortForward(id: string) {
    portForwards.value = portForwards.value.filter(item => item.id !== id)
  }

  function addFirewallRule(params: Omit<FirewallRule, 'id'>) {
    // Keep catch-all deny rules last
    const index = firewallRules.value.findIndex(
      rule => rule.networkId === params.networkId && rule.action === 'deny' && rule.source === '0.0.0.0/0'
    )
    const rule = { ...params, id: uid('fw') }
    if (index === -1 || params.action === 'deny') {
      firewallRules.value.push(rule)
    } else {
      firewallRules.value.splice(index, 0, rule)
    }
    log(`Added firewall rule on ${getNetwork(params.networkId)!.name}`)
  }

  function removeFirewallRule(id: string) {
    firewallRules.value = firewallRules.value.filter(item => item.id !== id)
  }

  // --- Access

  /** Returns the secret, shown once */
  async function createApiKey(name: string, role: ApiKey['role'], password = ''): Promise<string | undefined> {
    if (isLive.value) {
      return guard(async () => {
        const { token } = await xo.post<{ token: string }>('/account/tokens', {
          description: name,
          expiresIn: '180 days',
          password,
        })
        log(`Created API key ${name}`)
        await refreshAccountData()
        return token
      })
    }

    const secret = `xop_${randomHex(4)}_${randomHex(32)}`
    apiKeys.value.push({
      id: uid('ak'),
      name,
      role,
      prefix: secret.slice(0, 8),
      createdAt: Date.now(),
      lastUsedAt: undefined,
    })
    log(`Created API key ${name}`)
    return secret
  }

  async function revokeApiKey(id: string) {
    const key = apiKeys.value.find(item => item.id === id)!
    if (isLive.value) {
      await guard(async () => {
        await xo.delete(`/account/tokens/${key.prefix}`)
        await refreshAccountData()
      })
    } else {
      apiKeys.value = apiKeys.value.filter(item => item.id !== id)
    }
    log(`Revoked API key ${key.name}`)
  }

  async function addSshKey(name: string, publicKey: string) {
    if (isLive.value) {
      await guard(async () => {
        await xo.post('/account/ssh-keys', { title: name, key: publicKey })
        await refreshAccountData()
      })
      return
    }
    sshKeys.value.push({
      id: uid('key'),
      name,
      fingerprint: (await sshFingerprint(publicKey)) ?? `SHA256:${randomHex(4)}…${randomHex(4)}`,
      createdAt: Date.now(),
      publicKey,
    })
  }

  async function removeSshKey(id: string) {
    if (isLive.value) {
      await guard(async () => {
        await xo.post('/account/ssh-keys/actions/remove', { key: id })
        await refreshAccountData()
      })
      return
    }
    sshKeys.value = sshKeys.value.filter(item => item.id !== id)
  }

  // --- Members

  function findOrganizationMember(userId: string) {
    return organizationMembers.value.find(member => member.userId === userId)!
  }

  async function setProjectMember(userId: string, role: ProjectRole | null) {
    const name = findOrganizationMember(userId).name

    if (isLive.value) {
      const done = await guard(async () => {
        if (role === null) {
          await xo.delete(`/projects/${currentProjectId.value}/members/${userId}`)
        } else {
          await xo.put(`/projects/${currentProjectId.value}/members/${userId}`, { role })
        }
        await refreshMembers()
        return true
      })
      if (!done) {
        return
      }
    } else {
      const members = (mockProjectMembers[currentProjectId.value] ??= [])
      const index = members.findIndex(member => member.userId === userId)
      if (index !== -1) {
        members.splice(index, 1)
      }
      if (role !== null) {
        members.push({ userId, name, role })
      }
    }
    log(role === null ? `Removed ${name} from the project` : `Gave the ${role} role to ${name}`)
  }

  async function setOrganizationMember(userId: string, role: OrganizationRole | null) {
    const name = findOrganizationMember(userId).name
    const organizationId = organization.value.id

    if (isLive.value) {
      const done = await guard(async () => {
        if (role === null) {
          await xo.delete(`/organizations/${organizationId}/members/${userId}`)
        } else {
          await xo.put(`/organizations/${organizationId}/members/${userId}`, { role })
        }
        await refreshMembers()
        return true
      })
      if (!done) {
        return
      }
    } else if (role === null) {
      organizationMembers.value = organizationMembers.value.filter(member => member.userId !== userId)
      for (const members of Object.values(mockProjectMembers)) {
        const index = members.findIndex(member => member.userId === userId)
        if (index !== -1) {
          members.splice(index, 1)
        }
      }
    } else {
      findOrganizationMember(userId).role = role
    }
    log(role === null ? `Removed ${name} from ${organization.value.name}` : `${name} is now organization ${role}`)
  }

  async function createUser(params: {
    name: string
    password: string
    organizationRole: OrganizationRole
    projectRole: ProjectRole | undefined
  }) {
    let userId: string | undefined

    if (isLive.value) {
      userId = await guard(async () => {
        const { id } = await xo.post<{ id: string }>(`/organizations/${organization.value.id}/users`, {
          name: params.name,
          password: params.password,
          role: params.organizationRole,
        })
        await refreshMembers()
        return id
      })
    } else {
      await wait(300)
      userId = uid('usr')
      organizationMembers.value.push({ userId, name: params.name, role: params.organizationRole })
    }

    if (userId === undefined) {
      return false
    }
    log(`Created the account ${params.name}`)
    if (params.projectRole !== undefined) {
      await setProjectMember(userId, params.projectRole)
    }
    return true
  }

  /** Returns the new temporary password, to share with the member */
  async function resetMemberPassword(userId: string): Promise<string | undefined> {
    if (!isLive.value) {
      await wait(300)
      return randomHex(16)
    }
    return guard(async () => {
      const { password } = await xo.post<{ password: string }>(
        `/organizations/${organization.value.id}/members/${userId}/actions/reset_password`
      )
      log(`Reset the password of ${findOrganizationMember(userId).name}`)
      return password
    })
  }

  return {
    backend,
    isLive,
    status,
    lastError,
    init,
    login,
    logout,
    changePassword,
    provider,
    currentUser,
    organization,
    organizationSuspended,
    projects,
    currentProjectId,
    project,
    quota,
    usage,
    usageLines,
    loadUsageRecords,
    monthToDateCost,
    estimatedHourlyCost,
    templates,
    offerings,
    hasProjectOfferings,
    hasPublicIpPools,
    backupPolicies,
    instances: projectInstances,
    networks: projectNetworks,
    floatingIps: projectFloatingIps,
    snapshots: projectSnapshots,
    activity: projectActivity,
    restorePoints,
    portForwards,
    firewallRules,
    apiKeys,
    sshKeys,
    organizationMembers,
    projectMembers,
    organizationRole,
    canManageProject,
    canManageOrganization,
    canRestoreInPlace,
    getOffering,
    getTemplate,
    getNetwork,
    getInstance,
    getBackupPolicy,
    instanceDiskGiB,
    createInstance,
    powerAction,
    deleteInstance,
    loadInstanceDisks,
    createSnapshot,
    revertSnapshot,
    deleteSnapshot,
    setBackupPolicy,
    restore,
    createNetwork,
    allocateFloatingIp,
    releaseFloatingIp,
    attachFloatingIp,
    addPortForward,
    removePortForward,
    addFirewallRule,
    removeFirewallRule,
    createApiKey,
    revokeApiKey,
    addSshKey,
    removeSshKey,
    setProjectMember,
    setOrganizationMember,
    createUser,
    resetMemberPassword,
  }
})
