import * as data from '@/mock/data.ts'
import type { ApiKey, FirewallRule, Instance, InstanceState, Network, PortForward, UsageLine } from '@/mock/types.ts'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_PRICE_PER_GIB_MONTH = 0.05
const SNAPSHOT_PRICE_PER_GIB_MONTH = 0.05
const FLOATING_IP_PRICE_PER_HOUR = 0.004
const HOURS_PER_MONTH = 730

let counter = 0
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`

const randomHex = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Mocked tenant-scoped backend. Each action stands for a future REST call
// (e.g. `POST /rest/v0/projects/:id/instances`), with a fake latency.
export const usePortalStore = defineStore('portal', () => {
  const currentProjectId = useLocalStorage('portal-project', data.projects[0].id)

  const instances = ref(structuredClone(data.instances))
  const snapshots = ref(structuredClone(data.snapshots))
  const restorePoints = ref(structuredClone(data.restorePoints))
  const networks = ref(structuredClone(data.networks))
  const floatingIps = ref(structuredClone(data.floatingIps))
  const portForwards = ref(structuredClone(data.portForwards))
  const firewallRules = ref(structuredClone(data.firewallRules))
  const apiKeys = ref(structuredClone(data.apiKeys))
  const sshKeys = ref(structuredClone(data.sshKeys))
  const activity = ref(structuredClone(data.activity))

  const project = computed(() => data.projects.find(project => project.id === currentProjectId.value)!)
  const quota = computed(() => data.quotas[currentProjectId.value])

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

  const getOffering = (id: string) => data.offerings.find(offering => offering.id === id)!
  const getTemplate = (id: string) => data.templates.find(template => template.id === id)!
  const getNetwork = (id: string) => networks.value.find(network => network.id === id)
  const getInstance = (id: string) => instances.value.find(instance => instance.id === id)
  const getBackupPolicy = (id: string | undefined) => data.backupPolicies.find(policy => policy.id === id)

  const instanceDiskGiB = (instance: Instance) => getOffering(instance.offeringId).diskGiB + instance.extraDiskGiB

  const usage = computed(() => {
    const instances = projectInstances.value
    const activeInstances = instances.filter(instance => instance.state !== 'halted')

    return {
      instances: instances.length,
      vcpus: activeInstances.reduce((sum, instance) => sum + getOffering(instance.offeringId).vcpus, 0),
      memoryGiB: activeInstances.reduce((sum, instance) => sum + getOffering(instance.offeringId).memoryGiB, 0),
      storageGiB: instances.reduce((sum, instance) => sum + instanceDiskGiB(instance), 0),
      floatingIps: projectFloatingIps.value.length,
      snapshots: projectSnapshots.value.length,
    }
  })

  // Month-to-date usage, as the future usage records API would aggregate it
  const usageLines = computed<UsageLine[]>(() => {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const hoursSince = (from: number) => Math.max(0, (Date.now() - Math.max(from, monthStart.getTime())) / 3600e3)
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
        cost: diskGiB * storageMonths * STORAGE_PRICE_PER_GIB_MONTH,
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
        cost: snapshot.sizeGiB * months * SNAPSHOT_PRICE_PER_GIB_MONTH,
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
        cost: hours * FLOATING_IP_PRICE_PER_HOUR,
      })
    }

    return lines
  })

  const monthToDateCost = computed(() => usageLines.value.reduce((sum, line) => sum + line.cost, 0))

  const estimatedHourlyCost = computed(
    () =>
      projectInstances.value
        .filter(instance => instance.state !== 'halted')
        .reduce((sum, instance) => sum + getOffering(instance.offeringId).pricePerHour, 0) +
      projectFloatingIps.value.length * FLOATING_IP_PRICE_PER_HOUR +
      (usage.value.storageGiB * STORAGE_PRICE_PER_GIB_MONTH) / HOURS_PER_MONTH
  )

  function log(message: string) {
    activity.value.push({
      id: uid('ev'),
      projectId: currentProjectId.value,
      at: Date.now(),
      user: data.currentUser.name,
      message,
    })
  }

  async function createInstance(params: {
    name: string
    offeringId: string
    templateId: string
    networkId: string
    extraDiskGiB: number
    backupPolicyId: string | undefined
    sshKeyIds: string[]
  }) {
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

  async function powerAction(id: string, action: 'start' | 'stop' | 'reboot') {
    const instance = getInstance(id)!
    await wait(600)
    instance.state = action === 'stop' ? 'halted' : 'running'
    log(`${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Rebooted'} instance ${instance.name}`)
  }

  async function deleteInstance(id: string) {
    const instance = getInstance(id)!
    await wait(400)
    instances.value = instances.value.filter(item => item.id !== id)
    snapshots.value = snapshots.value.filter(snapshot => snapshot.instanceId !== id)
    portForwards.value = portForwards.value.filter(forward => forward.instanceId !== id)
    for (const ip of floatingIps.value) {
      if (ip.instanceId === id) {
        ip.instanceId = undefined
      }
    }
    log(`Deleted instance ${instance.name}`)
  }

  async function createSnapshot(instanceId: string, name: string) {
    const instance = getInstance(instanceId)!
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
    instance.state = 'restoring'
    await wait(2000)
    instance.state = 'running'
    log(`Reverted ${instance.name} to snapshot ${snapshot.name}`)
  }

  async function deleteSnapshot(snapshotId: string) {
    const snapshot = snapshots.value.find(item => item.id === snapshotId)!
    await wait(300)
    snapshots.value = snapshots.value.filter(item => item.id !== snapshotId)
    log(`Deleted snapshot ${snapshot.name}`)
  }

  function setBackupPolicy(instanceId: string, policyId: string | undefined) {
    const instance = getInstance(instanceId)!
    instance.backupPolicyId = policyId
    log(
      policyId === undefined
        ? `Disabled backups for ${instance.name}`
        : `Enabled ${getBackupPolicy(policyId)!.name} backups for ${instance.name}`
    )
  }

  async function restore(restorePointId: string, mode: 'in-place' | 'new-instance') {
    const point = restorePoints.value.find(item => item.id === restorePointId)!
    const instance = getInstance(point.instanceId)!
    const date = new Date(point.createdAt).toLocaleString()

    if (mode === 'in-place') {
      instance.state = 'restoring'
      log(`Restoring ${instance.name} from backup of ${date}`)
      await wait(3000)
      instance.state = 'running'
      return instance
    }

    return createInstance({
      name: `${instance.name}-restored`,
      offeringId: instance.offeringId,
      templateId: instance.templateId,
      networkId: instance.networkId,
      extraDiskGiB: instance.extraDiskGiB,
      backupPolicyId: undefined,
      sshKeyIds: instance.sshKeyIds,
    })
  }

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

  function createApiKey(name: string, role: ApiKey['role']) {
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

  function revokeApiKey(id: string) {
    const key = apiKeys.value.find(item => item.id === id)!
    apiKeys.value = apiKeys.value.filter(item => item.id !== id)
    log(`Revoked API key ${key.name}`)
  }

  function addSshKey(name: string) {
    sshKeys.value.push({
      id: uid('key'),
      name,
      fingerprint: `SHA256:${randomHex(4)}…${randomHex(4)}`,
      createdAt: Date.now(),
    })
  }

  function removeSshKey(id: string) {
    sshKeys.value = sshKeys.value.filter(item => item.id !== id)
  }

  return {
    currentProjectId,
    project,
    quota,
    usage,
    usageLines,
    monthToDateCost,
    estimatedHourlyCost,
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
    getOffering,
    getTemplate,
    getNetwork,
    getInstance,
    getBackupPolicy,
    instanceDiskGiB,
    createInstance,
    powerAction,
    deleteInstance,
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
  }
})
