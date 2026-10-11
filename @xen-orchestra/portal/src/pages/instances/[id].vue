<template>
  <template v-if="instance">
    <PageHeader :title="instance.name" :back="{ to: '/instances', label: 'Instances' }">
      <template #leading>
        <OsBadge :os="template.os" size="large" />
      </template>
      <template #status>
        <StatusDot :state="instance.state" />
        <span v-if="sshTarget" class="ip-chip"><CopyValue :value="sshTarget" mono /></span>
      </template>
      <template #subtitle>
        {{ imageLabel }} · {{ offering.name }} · {{ offering.vcpus }} vCPU · {{ offering.memoryGiB }} GiB
        <template v-if="instance.diskGiB !== undefined"> · {{ instance.diskGiB }} GiB disk</template>
      </template>
      <template #actions>
        <UiButton
          v-if="instance.state === 'halted' && canOperate"
          variant="primary"
          accent="brand"
          size="medium"
          left-icon="fa:play"
          :busy="pending === 'start'"
          @click="power('start')"
        >
          Start
        </UiButton>
        <template v-else-if="canOperate">
          <UiButton
            variant="secondary"
            accent="brand"
            size="medium"
            left-icon="fa:repeat"
            :disabled="isBusy"
            :busy="pending === 'reboot'"
            @click="power('reboot')"
          >
            Reboot
          </UiButton>
          <UiButton
            variant="secondary"
            accent="warning"
            size="medium"
            left-icon="fa:power-off"
            :disabled="isBusy"
            :busy="pending === 'stop'"
            @click="power('stop')"
          >
            Stop
          </UiButton>
        </template>
        <PMenu v-if="canOperate" align="end">
          <template #trigger>
            <button type="button" class="more" aria-label="More actions"><PIcon :icon="faEllipsis" /></button>
          </template>
          <PMenuItem :icon="faCamera" :disabled="!canOperate || snapshotQuotaReached" @click="openSnapshot()">
            Take a snapshot
          </PMenuItem>
          <PMenuItem :icon="faShieldHalved" @click="tab = 'protection'">Backup policy</PMenuItem>
          <PMenuItem :icon="faTrash" danger :disabled="!canDelete" @click="confirmDelete = true">
            Delete instance
          </PMenuItem>
        </PMenu>
      </template>
    </PageHeader>

    <nav class="tabs-wrap">
      <div class="tabs" role="tablist">
        <button
          v-for="item of tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="tab typo-body-regular"
          :class="{ active: tab === item.id }"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          {{ item.label }}
          <span v-if="item.count" class="tab-count p-num">{{ item.count }}</span>
        </button>
      </div>
    </nav>

    <PageContent>
      <!-- OVERVIEW -->
      <div v-if="tab === 'overview'" class="overview">
        <div class="main-col">
          <PPanel title="Connect" :description="connectDescription">
            <template v-if="sshTarget">
              <CopyValue :value="sshCommand" mono block> <span class="prompt">$</span> {{ sshCommand }} </CopyValue>
              <div class="connect-alt typo-body-regular-small p-muted">
                <PIcon :icon="faKey" size="small" />
                <span>
                  Signs in with the SSH key added at creation.
                  <RouterLink to="/access" class="p-link">Manage keys</RouterLink>
                  · No key? Use the
                  <button type="button" class="link-button" @click="tab = 'console'">web console</button>.
                </span>
              </div>
            </template>
            <EmptyState
              v-else
              compact
              :icon="faPlug"
              title="No address yet"
              :description="
                instance.state === 'running'
                  ? 'The guest reports its address once booted.'
                  : 'Start the instance to connect to it.'
              "
            />
          </PPanel>

          <PPanel title="Performance" description="Last 10 minutes, refreshed every 5 seconds">
            <div v-if="stats" class="metrics">
              <div class="metric">
                <div class="metric-head">
                  <span class="typo-body-regular-small p-muted"><PIcon :icon="faMicrochip" size="small" /> CPU</span>
                  <span class="metric-value p-num">{{ Math.round(last(stats.cpu) * 100) }}%</span>
                </div>
                <div class="metric-chart"><Sparkline :values="stats.cpu" :max="1" /></div>
                <span class="p-caption p-muted"
                  >{{ offering.vcpus }} vCPU · peak {{ Math.round(Math.max(...stats.cpu, 0) * 100) }}%</span
                >
              </div>
              <div class="metric">
                <div class="metric-head">
                  <span class="typo-body-regular-small p-muted"><PIcon :icon="faMemory" size="small" /> Memory</span>
                  <span class="metric-value p-num">{{ formatBytes(last(stats.memoryUsed)) }}</span>
                </div>
                <div class="metric-chart">
                  <Sparkline :values="stats.memoryUsed" :max="stats.memoryTotal" tone="violet" />
                </div>
                <span class="p-caption p-muted">used of {{ formatBytes(stats.memoryTotal) }}</span>
              </div>
              <div class="metric">
                <div class="metric-head">
                  <span class="typo-body-regular-small p-muted"
                    ><PIcon :icon="faArrowRightArrowLeft" size="small" /> Network</span
                  >
                  <span class="metric-value p-num">{{
                    formatRate(last(stats.networkIn) + last(stats.networkOut))
                  }}</span>
                </div>
                <div class="metric-chart">
                  <Sparkline
                    :values="stats.networkIn.map((value, i) => value + (stats!.networkOut[i] ?? 0))"
                    tone="teal"
                  />
                </div>
                <span class="p-caption p-muted"
                  >↓ {{ formatRate(last(stats.networkIn)) }} · ↑ {{ formatRate(last(stats.networkOut)) }}</span
                >
              </div>
              <div class="metric">
                <div class="metric-head">
                  <span class="typo-body-regular-small p-muted"><PIcon :icon="faHardDrive" size="small" /> Disk</span>
                  <span class="metric-value p-num">{{ formatRate(last(stats.diskRead) + last(stats.diskWrite)) }}</span>
                </div>
                <div class="metric-chart">
                  <Sparkline
                    :values="stats.diskWrite.map((value, i) => value + (stats!.diskRead[i] ?? 0))"
                    tone="amber"
                  />
                </div>
                <span class="p-caption p-muted"
                  >read {{ formatRate(last(stats.diskRead)) }} · write {{ formatRate(last(stats.diskWrite)) }}</span
                >
              </div>
            </div>
            <EmptyState
              v-else
              compact
              :icon="faChartLine"
              title="No metrics"
              :description="
                instance.state === 'running'
                  ? 'Collecting the first samples…'
                  : 'Metrics are collected while the instance runs.'
              "
            />
          </PPanel>
        </div>

        <div class="side-col">
          <PPanel title="Network">
            <dl class="facts">
              <div v-for="ip of instance.publicIps ?? []" :key="ip">
                <dt>Public IPv4</dt>
                <dd><CopyValue :value="ip" mono /></dd>
              </div>
              <div v-if="instance.privateIp">
                <dt>Private IPv4</dt>
                <dd><CopyValue :value="instance.privateIp" mono /></dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{{ network?.name ?? 'None' }}</dd>
              </div>
            </dl>
          </PPanel>

          <PPanel title="Protection">
            <template #actions>
              <button type="button" class="link-button small" @click="tab = 'protection'">Details</button>
            </template>
            <dl class="facts">
              <div>
                <dt>Backups</dt>
                <dd>
                  <span v-if="policy" class="ok-text"
                    ><PIcon :icon="faShieldHalved" size="small" /> {{ policy.name }}</span
                  >
                  <span v-else class="warn-text"
                    ><PIcon :icon="faTriangleExclamation" size="small" /> Not protected</span
                  >
                </dd>
              </div>
              <div>
                <dt>Last restore point</dt>
                <dd>
                  <VtsRelativeTime v-if="restorePoints[0]" :date="restorePoints[0].createdAt" />
                  <span v-else class="p-muted">None yet</span>
                </dd>
              </div>
              <div>
                <dt>Snapshots</dt>
                <dd>{{ instanceSnapshots.length }}</dd>
              </div>
            </dl>
          </PPanel>

          <PPanel title="Details">
            <dl class="facts">
              <div v-if="store.showsCosts">
                <dt>{{ store.billingMode === 'showback' ? 'Internal cost this month' : 'Spent this month' }}</dt>
                <dd class="p-num">
                  {{ formatMoney(store.instanceMonthCost(instance.id)) }}
                  <span class="p-muted">· {{ formatHourlyPrice(offering.pricePerHour) }}</span>
                </dd>
              </div>
              <div v-else>
                <dt>Compute this month</dt>
                <dd class="p-num">{{ formatVcpuHours(instanceVcpuHours) }}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  <span :title="formatDate(instance.createdAt)"><VtsRelativeTime :date="instance.createdAt" /></span>
                  <span v-if="createdBy" class="p-muted"> by {{ createdBy }}</span>
                </dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>
                  <CopyValue :value="instance.id" mono>{{ instance.id.slice(0, 8) }}…</CopyValue>
                </dd>
              </div>
            </dl>
          </PPanel>
        </div>
      </div>

      <!-- SNAPSHOTS & BACKUPS -->
      <template v-if="tab === 'protection'">
        <PPanel
          title="Backup policy"
          :description="`Copies kept by ${store.provider.name} away from the instance, on a schedule.`"
        >
          <div class="policies">
            <button
              type="button"
              class="policy"
              :class="{ selected: !policy }"
              :disabled="!canOperate"
              @click="setPolicy(undefined)"
            >
              <span class="radio" />
              <span class="policy-text">
                <span class="typo-body-bold">No backups</span>
                <span class="typo-body-regular-small p-muted">Snapshots only</span>
              </span>
            </button>
            <button
              v-for="item of store.backupPolicies"
              :key="item.id"
              type="button"
              class="policy"
              :class="{ selected: policy?.id === item.id }"
              :disabled="!canOperate"
              @click="setPolicy(item.id)"
            >
              <span class="radio" />
              <span class="policy-text">
                <span class="typo-body-bold">{{ item.name }}</span>
                <span class="typo-body-regular-small p-muted">{{ item.description }}</span>
              </span>
            </button>
          </div>
        </PPanel>

        <PPanel title="Restore points" :count="restorePoints.length" flush>
          <ul v-if="restorePoints.length !== 0" class="p-list">
            <li v-for="point of restorePoints" :key="point.id" class="point">
              <span class="point-icon"><PIcon :icon="faBoxArchive" /></span>
              <span class="point-text">
                <span class="typo-body-bold-small">{{ formatDate(point.createdAt) }}</span>
                <span class="p-caption p-muted"
                  >{{ store.getBackupPolicy(point.policyId)?.name ?? 'Backup' }} · {{ point.sizeGiB }} GiB</span
                >
              </span>
              <UiButton
                v-if="store.canRestoreInPlace"
                variant="tertiary"
                accent="warning"
                size="small"
                left-icon="fa:rotate-left"
                :disabled="isBusy || !canOperate"
                @click="store.restore(point.id, 'in-place')"
              >
                Restore in place
              </UiButton>
              <UiButton
                variant="secondary"
                accent="brand"
                size="small"
                left-icon="fa:clone"
                :disabled="!canOperate"
                @click="restoreTarget = point.id"
              >
                Restore as new instance
              </UiButton>
            </li>
          </ul>
          <EmptyState
            v-else
            :icon="faBoxArchive"
            title="No restore point yet"
            :description="
              policy
                ? `The first backup runs with the next schedule of ${policy.name}.`
                : 'Choose a backup policy to get restore points.'
            "
          />
        </PPanel>

        <PPanel
          title="Snapshots"
          :count="instanceSnapshots.length"
          description="Instant point-in-time copies, stored next to the instance. Revert in seconds."
          flush
        >
          <template #actions>
            <UiButton
              variant="secondary"
              accent="brand"
              size="small"
              left-icon="fa:camera"
              :disabled="!canOperate || snapshotQuotaReached"
              @click="openSnapshot()"
            >
              Take a snapshot
            </UiButton>
          </template>
          <ul v-if="instanceSnapshots.length !== 0" class="p-list">
            <li v-for="snap of instanceSnapshots" :key="snap.id" class="point">
              <span class="point-icon snapshot"><PIcon :icon="faCamera" /></span>
              <span class="point-text">
                <span class="typo-body-bold-small">{{ snap.name }}</span>
                <span class="p-caption p-muted"
                  ><VtsRelativeTime :date="snap.createdAt" /> · {{ formatDate(snap.createdAt) }}</span
                >
              </span>
              <UiButton
                variant="tertiary"
                accent="warning"
                size="small"
                left-icon="fa:rotate-left"
                :disabled="isBusy || !canOperate"
                @click="revertTarget = snap.id"
              >
                Revert
              </UiButton>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                :disabled="!canDelete"
                @click="store.deleteSnapshot(snap.id)"
              >
                Delete
              </UiButton>
            </li>
          </ul>
          <EmptyState
            v-else
            compact
            :icon="faCamera"
            title="No snapshot"
            description="Take one before an upgrade or a risky change."
            class="pad"
          />
          <template v-if="Number.isFinite(store.quota.snapshots)" #footer>
            <span class="typo-body-regular-small"
              >{{ store.usage.snapshots }} of {{ store.quota.snapshots }} snapshots used in this project</span
            >
          </template>
        </PPanel>
      </template>

      <!-- CONSOLE -->
      <PPanel v-if="tab === 'console'" flush class="console-panel">
        <template #header>
          <h2 class="typo-h6 console-title"><PIcon :icon="faTerminal" /> Console</h2>
          <p class="typo-body-regular-small p-muted">Keyboard and screen of the instance, even without network.</p>
        </template>
        <EmptyState
          v-if="instance.state !== 'running'"
          :icon="faPowerOff"
          title="The instance is stopped"
          description="Start it to open its console."
        >
          <UiButton
            variant="primary"
            accent="brand"
            size="medium"
            left-icon="fa:play"
            :disabled="!canOperate"
            @click="power('start')"
          >
            Start
          </UiButton>
        </EmptyState>
        <div v-else-if="store.isLive" class="live-console">
          <VtsRemoteConsole :url="consoleUrl" :is-console-available="!isBusy" />
        </div>
        <div v-else class="mock-console p-mono">
          <span>Debian GNU/Linux 13 {{ instance.name }} tty1</span>
          <span>&nbsp;</span>
          <span>{{ instance.name }} login: <span class="cursor">_</span></span>
        </div>
      </PPanel>
    </PageContent>

    <!-- dialogs -->
    <PModal
      :open="snapshotOpen"
      title="Take a snapshot"
      :icon="faCamera"
      :description="`A point-in-time copy of ${instance.name}, ready to revert to.`"
      @close="snapshotOpen = false"
    >
      <label class="field">
        <span class="typo-body-bold-small">Name</span>
        <UiInput v-model="snapshotName" accent="brand" />
      </label>
      <span class="typo-body-regular-small p-muted"
        >{{ store.usage.snapshots }} of {{ store.quota.snapshots }} snapshots used in this project.</span
      >
      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="snapshotOpen = false">Cancel</UiButton>
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          left-icon="fa:camera"
          :busy="snapshotting"
          :disabled="String(snapshotName ?? '').trim() === ''"
          @click="snapshot()"
        >
          Take snapshot
        </UiButton>
      </template>
    </PModal>

    <PModal
      :open="revertTarget !== undefined"
      title="Revert to this snapshot?"
      :icon="faRotateLeft"
      :description="`${instance.name} goes back to “${revertSnapshot?.name}”. Changes made since then are lost.`"
      @close="revertTarget = undefined"
    >
      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="revertTarget = undefined">Cancel</UiButton>
        <UiButton variant="primary" accent="warning" size="medium" left-icon="fa:rotate-left" @click="revert()">
          Revert
        </UiButton>
      </template>
    </PModal>

    <PModal
      :open="restoreTarget !== undefined"
      title="Restore as a new instance"
      :icon="faClone"
      description="A new instance is created from this restore point, next to the current one."
      @close="restoreTarget = undefined"
    >
      <dl class="facts">
        <div>
          <dt>Restore point</dt>
          <dd>{{ restorePointToRestore ? formatDate(restorePointToRestore.createdAt) : '' }}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{{ offering.name }} · counts against the project quota</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="restoreTarget = undefined">Cancel</UiButton>
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          left-icon="fa:clone"
          :busy="restoring"
          @click="restoreAsNew()"
        >
          Restore
        </UiButton>
      </template>
    </PModal>

    <PModal :open="confirmDelete" danger title="Delete this instance?" :icon="faTrash" @close="confirmDelete = false">
      <p class="typo-body-regular">
        <strong>{{ instance.name }}</strong> and its {{ instanceSnapshots.length }} snapshot{{
          instanceSnapshots.length === 1 ? '' : 's'
        }}
        are deleted immediately. Restore points stay available until their retention ends.
      </p>
      <label class="field">
        <span class="typo-body-regular-small"
          >Type <strong class="p-mono">{{ instance.name }}</strong> to confirm</span
        >
        <UiInput v-model="deleteConfirmation" accent="danger" />
      </label>
      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="confirmDelete = false">Cancel</UiButton>
        <UiButton
          variant="primary"
          accent="danger"
          size="medium"
          left-icon="fa:trash"
          :disabled="deleteConfirmation !== instance.name"
          @click="remove()"
        >
          Delete instance
        </UiButton>
      </template>
    </PModal>
  </template>
  <PageContent v-else>
    <EmptyState
      :icon="faServer"
      title="Instance not found"
      description="It may have been deleted, or it belongs to another project."
    >
      <UiButton variant="secondary" accent="brand" size="medium" @click="router.push('/instances')">
        Back to instances
      </UiButton>
    </EmptyState>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import CopyValue from '@/components/ui/CopyValue.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import OsBadge from '@/components/ui/OsBadge.vue'
import PIcon from '@/components/ui/PIcon.vue'
import PMenu from '@/components/ui/PMenu.vue'
import PMenuItem from '@/components/ui/PMenuItem.vue'
import PModal from '@/components/ui/PModal.vue'
import PPanel from '@/components/ui/PPanel.vue'
import Sparkline from '@/components/ui/Sparkline.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { formatBytes, formatRate, useInstanceStats } from '@/composables/instance-stats.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import { formatDate, formatHourlyPrice, formatMoney, formatVcpuHours } from '@/utils/format.ts'
import { displayName } from '@/utils/people.ts'
import VtsRemoteConsole from '@core/components/console/VtsRemoteConsole.vue'
import VtsRelativeTime from '@core/components/relative-time/VtsRelativeTime.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import {
  faArrowRightArrowLeft,
  faBoxArchive,
  faCamera,
  faChartLine,
  faClone,
  faEllipsis,
  faHardDrive,
  faKey,
  faMemory,
  faMicrochip,
  faPlug,
  faPowerOff,
  faRotateLeft,
  faServer,
  faShieldHalved,
  faTerminal,
  faTrash,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const store = usePortalStore()
const toasts = useToasts()
const route = useRoute('/instances/[id]')
const router = useRouter()

type TabId = 'overview' | 'protection' | 'console'

const instance = computed(() => store.instances.find(instance => instance.id === route.params.id))
const offering = computed(() => store.getOffering(instance.value!.offeringId))
const template = computed(() => store.getTemplate(instance.value!.templateId))
const network = computed(() => store.getNetwork(instance.value!.networkId))
const policy = computed(() => store.getBackupPolicy(instance.value?.backupPolicyId))
const imageLabel = computed(() => [template.value.name, template.value.version].filter(Boolean).join(' '))

const instanceSnapshots = computed(() =>
  store.snapshots
    .filter(snapshot => snapshot.instanceId === instance.value!.id)
    .sort((a, b) => b.createdAt - a.createdAt)
)
const restorePoints = computed(() =>
  store.restorePoints.filter(point => point.instanceId === instance.value!.id).sort((a, b) => b.createdAt - a.createdAt)
)

const tabs = computed<{ id: TabId; label: string; count?: number }[]>(() => [
  { id: 'overview', label: 'Overview' },
  {
    id: 'protection',
    label: 'Backups & snapshots',
    count: instance.value ? instanceSnapshots.value.length + restorePoints.value.length : undefined,
  },
  { id: 'console', label: 'Console' },
])

const tab = computed<TabId>({
  get: () => (['protection', 'console'].includes(String(route.query.tab)) ? (route.query.tab as TabId) : 'overview'),
  set: id => router.replace({ query: id === 'overview' ? {} : { tab: id } }),
})

watch(
  () => instance.value?.id,
  id => {
    if (id !== undefined) {
      store.loadInstanceDisks(id)
    }
  },
  { immediate: true }
)

const isBusy = computed(() => instance.value?.state === 'creating' || instance.value?.state === 'restoring')
const canOperate = computed(() => store.project.role !== 'viewer')
const canDelete = computed(() => store.project.role === 'admin')
const snapshotQuotaReached = computed(() => store.usage.snapshots >= store.quota.snapshots)

const stats = useInstanceStats(
  computed(() => instance.value?.id),
  computed(() => instance.value?.state === 'running')
)
const last = (values: number[]) => values[values.length - 1] ?? 0

const instanceVcpuHours = computed(() =>
  store.usageLines
    .filter(line => line.instanceId === instance.value?.id)
    .reduce((sum, line) => sum + (line.vcpuHours ?? 0), 0)
)

const createdBy = computed(() => {
  const name = store.organizationMembers.find(member => member.userId === instance.value?.createdBy)?.name
  return name === undefined ? undefined : displayName(name)
})

// cloud images log in with the default user of the distribution
const DEFAULT_USERS: Record<string, string> = { debian: 'debian', ubuntu: 'ubuntu', rocky: 'rocky', alma: 'almalinux' }
const sshTarget = computed(() => instance.value?.publicIps?.[0] ?? (instance.value?.privateIp || undefined))
const sshCommand = computed(() => `ssh ${DEFAULT_USERS[template.value.os] ?? 'root'}@${sshTarget.value}`)
const connectDescription = computed(() =>
  instance.value?.publicIps?.length
    ? 'Reachable from the Internet on its public IPv4'
    : 'Reachable from the private network of the project'
)

const consoleUrl = computed(
  () => new URL(`/api/consoles/${instance.value!.id}`, window.location.origin.replace(/^http/, 'ws'))
)

// actions

const pending = ref<'start' | 'stop' | 'reboot'>()
async function power(action: 'start' | 'stop' | 'reboot') {
  pending.value = action
  try {
    await store.powerAction(instance.value!.id, action)
    const done = { start: 'started', stop: 'stopped', reboot: 'rebooted' }[action]
    toasts.success(`${instance.value?.name} ${done}`)
  } finally {
    pending.value = undefined
  }
}

const snapshotOpen = ref(false)
const snapshotName = ref<string | number | undefined>('')
const snapshotting = ref(false)
function openSnapshot() {
  snapshotName.value = `snapshot-${new Date().toISOString().slice(0, 10)}`
  snapshotOpen.value = true
}
async function snapshot() {
  snapshotting.value = true
  try {
    await store.createSnapshot(instance.value!.id, String(snapshotName.value))
    snapshotOpen.value = false
    toasts.success('Snapshot taken', `“${snapshotName.value}” of ${instance.value!.name}`)
    tab.value = 'protection'
  } finally {
    snapshotting.value = false
  }
}

const revertTarget = ref<string>()
const revertSnapshot = computed(() => store.snapshots.find(snapshot => snapshot.id === revertTarget.value))
async function revert() {
  const id = revertTarget.value!
  revertTarget.value = undefined
  await store.revertSnapshot(id)
  toasts.success('Snapshot restored', `${instance.value?.name} is back to its earlier state.`)
}

async function setPolicy(policyId: string | undefined) {
  if (instance.value!.backupPolicyId !== policyId) {
    await store.setBackupPolicy(instance.value!.id, policyId)
    toasts.success(
      policyId === undefined ? 'Backups disabled' : `${store.getBackupPolicy(policyId)?.name} enabled`,
      instance.value?.name
    )
  }
}

const restoreTarget = ref<string>()
const restoring = ref(false)
const restorePointToRestore = computed(() => store.restorePoints.find(point => point.id === restoreTarget.value))
async function restoreAsNew() {
  restoring.value = true
  try {
    const created = await store.restore(restoreTarget.value!, 'new-instance')
    restoreTarget.value = undefined
    if (created !== undefined) {
      toasts.success('Instance restored', `${created.name} was created from the backup.`)
      await router.push(`/instances/${created.id}`)
    }
  } finally {
    restoring.value = false
  }
}

const confirmDelete = ref(false)
const deleteConfirmation = ref<string | number | undefined>('')
watch(confirmDelete, () => (deleteConfirmation.value = ''))
async function remove() {
  const name = instance.value!.name
  confirmDelete.value = false
  if (await store.deleteInstance(instance.value!.id)) {
    toasts.success(`${name} deleted`)
    await router.push('/instances')
  }
}
</script>

<style lang="postcss" scoped>
.more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-s);
  background-color: var(--p-surface);
  color: var(--p-text);
  cursor: pointer;

  &:hover {
    background-color: var(--p-subtle);
  }
}

.tabs-wrap {
  width: 100%;
  max-width: var(--p-content-width);
  margin: 2rem auto 0;
  padding-inline: var(--p-page-padding);
}

.tabs {
  display: flex;
  gap: 2.4rem;
  border-block-end: var(--p-border);
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 0.2rem 1.2rem;
  border: none;
  border-block-end: 0.2rem solid transparent;
  margin-block-end: -0.1rem;
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    color: var(--p-text);
  }

  &.active {
    border-color: var(--color-brand-item-base);
    color: var(--p-text);
    font-weight: 600;
  }
}

.tab-count {
  padding: 0 0.7rem;
  border-radius: 99rem;
  background-color: var(--p-subtle);
  font-size: 1.2rem;
}

.overview {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(28rem, 1fr);
  gap: var(--p-gap);
  align-items: start;
}

.main-col,
.side-col {
  display: flex;
  flex-direction: column;
  gap: var(--p-gap);
  min-width: 0;
}

.prompt {
  color: var(--p-muted);
  user-select: none;
}

.connect-alt {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
}

.ip-chip {
  padding: 0.2rem 1rem;
  border: var(--p-border);
  border-radius: 99rem;
  color: var(--p-text);
  font-size: 1.3rem;
}

.link-button {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-brand-txt-base);
  font-family: inherit;
  font-size: inherit;
  font-weight: 500;
  cursor: pointer;

  &.small {
    font-size: 1.4rem;
  }

  &:hover {
    text-decoration: underline;
  }
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2.4rem 3.2rem;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.metric-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;

  span:first-child {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
}

.metric-value {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--p-text);
}

.metric-chart {
  height: 5.6rem;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;

  > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1.6rem;
  }

  dt {
    color: var(--p-muted);
    font-size: 1.4rem;
    white-space: nowrap;
  }

  dd {
    color: var(--p-text);
    font-size: 1.4rem;
    text-align: end;
    flex-shrink: 0;
    max-width: 70%;
  }
}

.ok-text,
.warn-text {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.ok-text {
  color: var(--color-success-txt-base);
}

.warn-text {
  color: var(--color-warning-txt-base);
}

.policies {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
  gap: 1.2rem;
}

.policy {
  display: flex;
  align-items: flex-start;
  gap: 1.2rem;
  padding: 1.6rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  text-align: start;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background-color 0.12s;

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-brand-item-base) 50%, var(--color-neutral-border));
  }

  &:disabled {
    cursor: not-allowed;
  }

  &.selected {
    border-color: var(--color-brand-item-base);
    background-color: var(--p-brand-softer);
    box-shadow: 0 0 0 0.1rem var(--color-brand-item-base);
  }
}

.radio {
  width: 1.8rem;
  height: 1.8rem;
  margin-top: 0.2rem;
  border: 0.2rem solid var(--color-neutral-border);
  border-radius: 50%;
  flex-shrink: 0;

  .selected & {
    border: 0.5rem solid var(--color-brand-item-base);
  }
}

.policy-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.point {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem 2.4rem;
  flex-wrap: wrap;
}

.point-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: var(--p-radius-m);
  background-color: color-mix(in srgb, var(--color-success-item-base) 12%, var(--p-surface));
  color: var(--color-success-txt-base);
  flex-shrink: 0;

  &.snapshot {
    background-color: color-mix(in srgb, var(--p-chart-4) 14%, var(--p-surface));
    color: var(--p-chart-4);
  }
}

.point-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 18rem;
}

.pad {
  padding-inline: 2.4rem;
}

.console-title {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--p-text);
}

.live-console {
  height: 64vh;
  min-height: 44rem;
  margin: 0 1.6rem 1.6rem;
  border-radius: var(--p-radius-m);
  overflow: hidden;
  background-color: #000;
}

.mock-console {
  display: flex;
  flex-direction: column;
  margin: 0 1.6rem 1.6rem;
  padding: 2rem;
  min-height: 32rem;
  border-radius: var(--p-radius-m);
  background-color: #0b0d12;
  color: #d6d9e0;
}

.cursor {
  animation: blink 1s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--p-text);
}

@media (max-width: 1100px) {
  .overview {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .metrics {
    grid-template-columns: 1fr;
  }
}
</style>
