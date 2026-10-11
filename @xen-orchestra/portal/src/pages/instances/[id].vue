<template>
  <template v-if="instance">
    <PageHeader :title="instance.name" icon="fa:server">
      <template #status>
        <InstanceStateTag :state="instance.state" />
      </template>
      <template #actions>
        <UiButton
          v-if="instance.state === 'halted'"
          variant="secondary"
          accent="brand"
          size="medium"
          left-icon="fa:play"
          :busy="pending === 'start'"
          @click="power('start')"
        >
          Start
        </UiButton>
        <template v-else>
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
        <UiButton variant="tertiary" accent="danger" size="medium" left-icon="fa:trash" @click="confirmDelete = true">
          Delete
        </UiButton>
      </template>
    </PageHeader>
    <TabList>
      <TabItem v-for="item of tabs" :key="item.id" :active="tab === item.id" @click="tab = item.id">
        {{ item.label }}
      </TabItem>
    </TabList>

    <PageContent>
      <UiCard v-if="confirmDelete" has-error>
        <UiInfo accent="danger" wrap>
          Delete {{ instance.name }} and its {{ instanceSnapshots.length }} snapshot(s)? Backups are kept until their
          retention expires.
        </UiInfo>
        <div class="actions">
          <UiButton variant="primary" accent="danger" size="medium" @click="remove()">Delete instance</UiButton>
          <UiButton variant="secondary" accent="brand" size="medium" @click="confirmDelete = false">Cancel</UiButton>
        </div>
      </UiCard>

      <!-- OVERVIEW -->
      <div v-if="tab === 'overview'" class="columns">
        <UiCard>
          <UiCardTitle>Details</UiCardTitle>
          <dl class="details typo-body-regular">
            <dt>ID</dt>
            <dd>{{ instance.id }}</dd>
            <dt>Size</dt>
            <dd>
              {{ offering.name }} · {{ offering.vcpus }} vCPU · {{ offering.memoryGiB }} GiB RAM
              <span class="muted">({{ formatHourlyPrice(offering.pricePerHour) }})</span>
            </dd>
            <dt>Image</dt>
            <dd>{{ template.name }} {{ template.version }}</dd>
            <dt>Disks</dt>
            <dd>
              {{ offering.diskGiB }} GiB system<template v-if="instance.extraDiskGiB">
                + {{ instance.extraDiskGiB }} GiB data
              </template>
            </dd>
            <dt>SSH keys</dt>
            <dd>{{ sshKeyNames || '-' }}</dd>
            <dt>Created</dt>
            <dd>{{ formatDate(instance.createdAt) }}</dd>
          </dl>
        </UiCard>
        <UiCard>
          <UiCardTitle>Network</UiCardTitle>
          <dl class="details typo-body-regular">
            <dt>Network</dt>
            <dd>{{ network?.name }} ({{ network?.cidr }})</dd>
            <dt>Private IP</dt>
            <dd>{{ instance.privateIp }}</dd>
            <dt>Public IP</dt>
            <dd>{{ attachedIp?.address ?? 'None' }}</dd>
            <dt>Port forwards</dt>
            <dd>
              <template v-if="forwards.length === 0">None</template>
              <div v-for="forward of forwards" :key="forward.id">
                {{ forwardLabel(forward) }}
              </div>
            </dd>
          </dl>
          <RouterLink to="/networks" class="typo-body-regular-small">Manage public IPs and firewall</RouterLink>
        </UiCard>
      </div>

      <!-- SNAPSHOTS & BACKUPS -->
      <template v-if="tab === 'protection'">
        <UiCard>
          <UiCardTitle>
            Snapshots
            <template #info>{{ instanceSnapshots.length }}</template>
            <template #description>Fast point-in-time copies stored next to the instance. Not a backup.</template>
          </UiCardTitle>
          <div class="inline-form">
            <UiInput v-model="snapshotName" accent="brand" class="grow" />
            <UiButton
              variant="primary"
              accent="brand"
              size="medium"
              left-icon="fa:camera"
              :busy="snapshotting"
              :disabled="snapshotQuotaReached"
              @click="snapshot()"
            >
              Take snapshot
            </UiButton>
          </div>
          <UiInfo v-if="snapshotQuotaReached" accent="warning">Snapshot quota reached for this project</UiInfo>
          <VtsTable :state="instanceSnapshots.length === 0 ? { type: 'no-data', message: 'No snapshot' } : undefined">
            <thead>
              <tr>
                <VtsHeaderCell>Name</VtsHeaderCell>
                <VtsHeaderCell>Taken</VtsHeaderCell>
                <VtsHeaderCell>Size</VtsHeaderCell>
                <VtsHeaderCell>Actions</VtsHeaderCell>
              </tr>
            </thead>
            <tbody>
              <VtsRow v-for="snap of instanceSnapshots" :key="snap.id">
                <VtsTextCell>{{ snap.name }}</VtsTextCell>
                <VtsTextCell>{{ formatDate(snap.createdAt) }}</VtsTextCell>
                <VtsTextCell>{{ snap.sizeGiB }} GiB</VtsTextCell>
                <UiTableCell>
                  <div class="actions">
                    <UiButton
                      variant="tertiary"
                      accent="warning"
                      size="small"
                      left-icon="fa:rotate-left"
                      :disabled="isBusy"
                      @click="store.revertSnapshot(snap.id)"
                    >
                      Revert
                    </UiButton>
                    <UiButton
                      variant="tertiary"
                      accent="danger"
                      size="small"
                      left-icon="fa:trash"
                      @click="store.deleteSnapshot(snap.id)"
                    >
                      Delete
                    </UiButton>
                  </div>
                </UiTableCell>
              </VtsRow>
            </tbody>
          </VtsTable>
        </UiCard>

        <UiCard>
          <UiCardTitle>
            Backups
            <template #description>
              Offsite copies made by {{ PROVIDER.name }} on a schedule. Restore in place or as a new instance.
            </template>
          </UiCardTitle>
          <div class="policies">
            <SelectCard :selected="instance.backupPolicyId === undefined" @click="setPolicy(undefined)">
              <span class="typo-body-bold">No backups</span>
            </SelectCard>
            <SelectCard
              v-for="policy of backupPolicies"
              :key="policy.id"
              :selected="instance.backupPolicyId === policy.id"
              @click="setPolicy(policy.id)"
            >
              <span class="typo-body-bold">{{ policy.name }}</span>
              <span class="typo-body-regular-small">{{ policy.schedule }} · keeps {{ policy.retention }}</span>
            </SelectCard>
          </div>
          <UiInfo v-if="instance.backupPolicyId === undefined" accent="warning">
            This instance is not backed up. Snapshots alone don't protect against storage failures.
          </UiInfo>
          <VtsTable
            :state="restorePoints.length === 0 ? { type: 'no-data', message: 'No restore point yet' } : undefined"
          >
            <thead>
              <tr>
                <VtsHeaderCell>Restore point</VtsHeaderCell>
                <VtsHeaderCell>Policy</VtsHeaderCell>
                <VtsHeaderCell>Size</VtsHeaderCell>
                <VtsHeaderCell>Restore</VtsHeaderCell>
              </tr>
            </thead>
            <tbody>
              <VtsRow v-for="point of restorePoints" :key="point.id">
                <VtsTextCell>{{ formatDate(point.createdAt) }}</VtsTextCell>
                <VtsTextCell>{{ store.getBackupPolicy(point.policyId)?.name }}</VtsTextCell>
                <VtsTextCell>{{ point.sizeGiB }} GiB</VtsTextCell>
                <UiTableCell>
                  <div class="actions">
                    <UiButton
                      variant="tertiary"
                      accent="warning"
                      size="small"
                      left-icon="fa:rotate-left"
                      :disabled="isBusy"
                      @click="store.restore(point.id, 'in-place')"
                    >
                      In place
                    </UiButton>
                    <UiButton
                      variant="tertiary"
                      accent="brand"
                      size="small"
                      left-icon="fa:clone"
                      @click="restoreAsNew(point.id)"
                    >
                      As new instance
                    </UiButton>
                  </div>
                </UiTableCell>
              </VtsRow>
            </tbody>
          </VtsTable>
        </UiCard>
      </template>

      <!-- CONSOLE -->
      <UiCard v-if="tab === 'console'">
        <VtsStateHero v-if="instance.state !== 'running'" format="card" type="offline" size="medium">
          Console is available when the instance is running
        </VtsStateHero>
        <div v-else class="console typo-body-regular">
          <span>{{ template.name }} {{ template.version }} {{ instance.name }} tty1</span>
          <span>&nbsp;</span>
          <span>{{ instance.name }} login: <span class="cursor">_</span></span>
        </div>
        <UiInfo accent="info" wrap>
          Prototype placeholder. The real portal would embed the same noVNC console as XO 6 (VtsRemoteConsole), proxied
          through xo-server with a tenant-scoped token.
        </UiInfo>
      </UiCard>
    </PageContent>
  </template>
  <VtsStateHero v-else format="page" type="not-found" size="large">Instance not found in this project</VtsStateHero>
</template>

<script lang="ts" setup>
import InstanceStateTag from '@/components/InstanceStateTag.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import SelectCard from '@/components/SelectCard.vue'
import { backupPolicies, PROVIDER } from '@/mock/data.ts'
import type { PortForward } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatDate, formatHourlyPrice } from '@/utils/format.ts'
import VtsStateHero from '@core/components/state-hero/VtsStateHero.vue'
import TabItem from '@core/components/tab/TabItem.vue'
import TabList from '@core/components/tab/TabList.vue'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const store = usePortalStore()
const route = useRoute('/instances/[id]')
const router = useRouter()

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'protection', label: 'Snapshots & backups' },
  { id: 'console', label: 'Console' },
] as const

type TabId = (typeof tabs)[number]['id']

const tab = computed<TabId>({
  get: () => tabs.find(item => item.id === route.query.tab)?.id ?? 'overview',
  set: id => router.replace({ query: id === 'overview' ? {} : { tab: id } }),
})
const pending = ref<'start' | 'stop' | 'reboot'>()
const confirmDelete = ref(false)
const snapshotName = ref<string | number | undefined>(`snapshot-${new Date().toISOString().slice(0, 10)}`)
const snapshotting = ref(false)

const instance = computed(() => store.instances.find(instance => instance.id === route.params.id))
const offering = computed(() => store.getOffering(instance.value!.offeringId))
const template = computed(() => store.getTemplate(instance.value!.templateId))
const network = computed(() => store.getNetwork(instance.value!.networkId))
const isBusy = computed(() => instance.value?.state === 'creating' || instance.value?.state === 'restoring')

const sshKeyNames = computed(() =>
  store.sshKeys
    .filter(key => instance.value!.sshKeyIds.includes(key.id))
    .map(key => key.name)
    .join(', ')
)

const attachedIp = computed(() => store.floatingIps.find(ip => ip.instanceId === instance.value!.id))
const forwards = computed(() => store.portForwards.filter(forward => forward.instanceId === instance.value!.id))

const instanceSnapshots = computed(() =>
  store.snapshots
    .filter(snapshot => snapshot.instanceId === instance.value!.id)
    .sort((a, b) => b.createdAt - a.createdAt)
)
const snapshotQuotaReached = computed(() => store.usage.snapshots >= store.quota.snapshots)

const restorePoints = computed(() =>
  store.restorePoints.filter(point => point.instanceId === instance.value!.id).sort((a, b) => b.createdAt - a.createdAt)
)

function forwardLabel(forward: PortForward) {
  const ip = store.floatingIps.find(ip => ip.id === forward.floatingIpId)
  return `${ip?.address}:${forward.publicPort} → ${forward.privatePort}/${forward.protocol}`
}

async function power(action: 'start' | 'stop' | 'reboot') {
  pending.value = action
  try {
    await store.powerAction(instance.value!.id, action)
  } finally {
    pending.value = undefined
  }
}

async function remove() {
  await store.deleteInstance(instance.value!.id)
  await router.push('/instances')
}

async function snapshot() {
  snapshotting.value = true
  try {
    await store.createSnapshot(instance.value!.id, String(snapshotName.value))
  } finally {
    snapshotting.value = false
  }
}

function setPolicy(policyId: string | undefined) {
  if (instance.value!.backupPolicyId !== policyId) {
    store.setBackupPolicy(instance.value!.id, policyId)
  }
}

async function restoreAsNew(pointId: string) {
  const created = await store.restore(pointId, 'new-instance')
  await router.push(`/instances/${created.id}`)
}
</script>

<style lang="postcss" scoped>
.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(40rem, 1fr));
  gap: 1.6rem;
}

.details {
  display: grid;
  grid-template-columns: 14rem 1fr;
  gap: 1rem 1.6rem;
  color: var(--color-neutral-txt-primary);

  dt {
    color: var(--color-neutral-txt-secondary);
  }
}

.muted {
  color: var(--color-neutral-txt-secondary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;

  .grow {
    flex: 1;
    min-width: 20rem;
  }
}

.policies {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1.2rem;
}

.console {
  display: flex;
  flex-direction: column;
  min-height: 32rem;
  padding: 1.6rem;
  border-radius: 0.4rem;
  background-color: #111;
  color: #ddd;
  font-family: monospace;

  .cursor {
    animation: blink 1s steps(1) infinite;
  }
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .columns {
    grid-template-columns: 1fr;
  }

  .details {
    grid-template-columns: 1fr;
  }
}
</style>
