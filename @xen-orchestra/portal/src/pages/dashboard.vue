<template>
  <PageHeader :title="greeting">
    <template #subtitle>
      <span class="project-line">
        <strong>{{ store.project.name }}</strong>
        <template v-if="store.project.description"> · {{ store.project.description }}</template>
      </span>
    </template>
    <template #actions>
      <UiButton
        v-if="canOperate"
        variant="primary"
        accent="brand"
        size="medium"
        left-icon="fa:plus"
        @click="router.push('/instances/new')"
      >
        New instance
      </UiButton>
    </template>
  </PageHeader>
  <PageContent>
    <div v-if="unprotected.length !== 0 && store.backupPolicies.length !== 0" class="callout">
      <span class="callout-icon"><PIcon :icon="faShieldHalved" /></span>
      <div class="callout-text">
        <span class="typo-body-bold">
          {{
            unprotected.length === 1
              ? `${unprotected[0].name} is not backed up`
              : `${unprotected.length} instances are not backed up`
          }}
        </span>
        <span class="typo-body-regular-small p-muted">
          Snapshots stay next to the instance: they don't protect against a storage failure.
        </span>
      </div>
      <UiButton
        v-if="unprotected.length === 1 && canOperate"
        variant="secondary"
        accent="brand"
        size="medium"
        :busy="enabling"
        @click="enableBackup(unprotected[0].id)"
      >
        Enable {{ store.backupPolicies[0].name.toLowerCase()
        }}<template v-if="store.backupPolicies[0].retention">
          ({{ store.backupPolicies[0].retention }} restore points)
        </template>
      </UiButton>
      <UiButton
        v-else-if="canOperate"
        variant="secondary"
        accent="brand"
        size="medium"
        @click="router.push('/instances')"
      >
        Review
      </UiButton>
    </div>

    <div class="tiles">
      <StatTile
        label="Instances"
        :value="running"
        :unit="`of ${store.instances.length} running`"
        :icon="faServer"
        to="/instances"
      >
        <template #hint>{{ allocated.vcpus }} vCPU · {{ allocated.memoryGiB }} GiB allocated</template>
      </StatTile>
      <StatTile
        v-if="store.showsCosts"
        :label="costLabel"
        :value="formatMoney(store.monthToDateCost)"
        :icon="faEuroSign"
        to="/usage"
      >
        <template #hint>
          About <strong class="p-text">{{ formatMoney(store.forecastCost) }}</strong> by {{ monthEnd }}
        </template>
      </StatTile>
      <StatTile
        v-else
        label="Compute this month"
        :value="formatQuantity(store.monthVcpuHours, '')"
        unit="vCPU·h"
        :icon="faMicrochip"
        to="/usage"
      >
        <template #hint>
          About <strong class="p-text">{{ formatVcpuHours(store.forecastVcpuHours) }}</strong> by {{ monthEnd }}
        </template>
      </StatTile>
      <StatTile
        v-if="store.showsPublicIps"
        label="Public IPv4"
        :value="store.usage.floatingIps"
        :unit="limitLabel(store.quota.floatingIps)"
        :icon="faGlobe"
        to="/networks"
      >
        <template #hint>{{ publicHint }}</template>
      </StatTile>
      <StatTile
        v-else
        label="Storage"
        :value="store.usage.storageGiB"
        :unit="`GiB${Number.isFinite(store.quota.storageGiB) ? ` of ${store.quota.storageGiB}` : ''}`"
        :icon="faHardDrive"
        to="/instances"
      >
        <template #hint>{{ store.usage.snapshots }} snapshot{{ store.usage.snapshots === 1 ? '' : 's' }} kept</template>
      </StatTile>
      <StatTile
        label="Backups"
        :value="backedUp"
        :unit="`of ${store.instances.length} protected`"
        :icon="faShieldHalved"
        :tone="unprotected.length !== 0 ? 'warning' : undefined"
        to="/instances"
      >
        <template #hint>
          <template v-if="lastBackup">Last restore point <VtsRelativeTime :date="lastBackup" /></template>
          <template v-else>No restore point yet</template>
        </template>
      </StatTile>
    </div>

    <div class="grid">
      <PPanel v-if="store.showsCosts" :title="costLabel" class="spend">
        <template #description>
          {{ formatMoney(store.monthToDateCost) }} so far · current rate
          {{ formatHourlyPrice(store.estimatedHourlyCost) }}
          <template v-if="store.billingMode === 'showback'"> · not invoiced</template>
        </template>
        <template #actions>
          <RouterLink to="/usage" class="p-link typo-body-regular-small">Details</RouterLink>
        </template>
        <SpendChart :points="store.dailySpend" :days-in-month="store.daysInMonth" :forecast="store.forecastCost" />
        <div class="legend p-caption p-muted">
          <span><i class="swatch solid" /> Spent</span>
          <span><i class="swatch dashed" /> Projection at the current rate</span>
        </div>
      </PPanel>
      <PPanel v-else title="Compute this month" class="spend">
        <template #description>
          {{ formatVcpuHours(store.monthVcpuHours) }} so far · {{ store.usage.vcpus }} vCPU allocated
        </template>
        <template #actions>
          <RouterLink to="/usage" class="p-link typo-body-regular-small">Details</RouterLink>
        </template>
        <SpendChart
          :points="store.dailyVcpuHours"
          :days-in-month="store.daysInMonth"
          :forecast="store.forecastVcpuHours"
          :format="formatVcpuHours"
        />
        <div class="legend p-caption p-muted">
          <span><i class="swatch solid" /> vCPU-hours used</span>
          <span><i class="swatch dashed" /> Projection with the running instances</span>
        </div>
      </PPanel>

      <PPanel title="Quotas" class="quotas-panel" :description="`Set by ${store.provider.name} for this project`">
        <div class="quotas">
          <QuotaMeter label="Instances" :current="store.usage.instances" :total="store.quota.instances" />
          <QuotaMeter label="vCPU" :current="store.usage.vcpus" :total="store.quota.vcpus" />
          <QuotaMeter label="Memory" :current="store.usage.memoryGiB" :total="store.quota.memoryGiB" unit="GiB" />
          <QuotaMeter label="Storage" :current="store.usage.storageGiB" :total="store.quota.storageGiB" unit="GiB" />
          <QuotaMeter
            v-if="store.showsPublicIps"
            label="Public IPv4"
            :current="store.usage.floatingIps"
            :total="store.quota.floatingIps"
          />
          <QuotaMeter label="Snapshots" :current="store.usage.snapshots" :total="store.quota.snapshots" />
        </div>
        <template #footer>
          <span class="typo-body-regular-small">
            Need more?
            <a :href="store.provider.supportUrl" target="_blank" rel="noopener noreferrer" class="p-link"
              >Ask {{ store.provider.name }}</a
            >
          </span>
        </template>
      </PPanel>

      <PPanel title="Instances" :count="store.instances.length" flush>
        <template #actions>
          <RouterLink to="/instances" class="p-link typo-body-regular-small">View all</RouterLink>
        </template>
        <ul v-if="store.instances.length !== 0" class="p-list">
          <li v-for="instance of store.instances.slice(0, 5)" :key="instance.id">
            <RouterLink :to="`/instances/${instance.id}`" class="instance-row">
              <OsBadge :os="store.getTemplate(instance.templateId).os" size="small" />
              <span class="instance-name">
                <span class="typo-body-bold-small">{{ instance.name }}</span>
                <span class="p-caption p-muted"
                  >{{ store.getOffering(instance.offeringId).name }} ·
                  {{ instance.publicIps?.[0] ?? instance.privateIp ?? '' }}</span
                >
              </span>
              <StatusDot :state="instance.state" />
            </RouterLink>
          </li>
        </ul>
        <EmptyState
          v-else
          :icon="faServer"
          title="No instance yet"
          description="Create your first instance in a minute."
        >
          <UiButton
            v-if="canOperate"
            variant="primary"
            accent="brand"
            size="small"
            left-icon="fa:plus"
            @click="router.push('/instances/new')"
          >
            New instance
          </UiButton>
        </EmptyState>
      </PPanel>

      <PPanel title="Activity" flush>
        <ul v-if="store.activity.length !== 0" class="activity">
          <li v-for="event of store.activity.slice(0, 6)" :key="event.id" class="event">
            <span class="event-icon" :class="event.kind"
              ><PIcon :icon="ACTIVITY_ICONS[event.kind ?? 'other']" size="small"
            /></span>
            <span class="event-text">
              <component
                :is="event.instanceId ? RouterLink : 'span'"
                :to="event.instanceId ? `/instances/${event.instanceId}` : undefined"
                class="typo-body-regular-small message"
              >
                {{ event.message }}
              </component>
              <span class="p-caption p-muted">
                <template v-if="event.user"
                  >{{ event.user.includes('@') ? displayName(event.user) : event.user }} ·
                </template>
                <VtsRelativeTime :date="event.at" />
              </span>
            </span>
          </li>
        </ul>
        <EmptyState
          v-else
          compact
          :icon="faClockRotateLeft"
          title="Nothing yet"
          description="Creations, snapshots and backups of the project appear here."
        />
      </PPanel>
    </div>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import OsBadge from '@/components/ui/OsBadge.vue'
import PIcon from '@/components/ui/PIcon.vue'
import PPanel from '@/components/ui/PPanel.vue'
import QuotaMeter from '@/components/ui/QuotaMeter.vue'
import SpendChart from '@/components/ui/SpendChart.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import type { ActivityKind } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import { formatHourlyPrice, formatMoney, formatQuantity, formatVcpuHours } from '@/utils/format.ts'
import { displayName, firstName } from '@/utils/people.ts'
import VtsRelativeTime from '@core/components/relative-time/VtsRelativeTime.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import {
  faArrowRotateLeft,
  faBolt,
  faCamera,
  faCirclePlus,
  faClockRotateLeft,
  faEuroSign,
  faGlobe,
  faHardDrive,
  faKey,
  faMicrochip,
  faServer,
  faShieldHalved,
  faTrash,
  faCircle,
} from '@fortawesome/free-solid-svg-icons'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

const store = usePortalStore()
const toasts = useToasts()
const router = useRouter()

const ACTIVITY_ICONS: Record<ActivityKind, IconDefinition> = {
  create: faCirclePlus,
  delete: faTrash,
  power: faBolt,
  snapshot: faCamera,
  backup: faShieldHalved,
  restore: faArrowRotateLeft,
  access: faKey,
  other: faCircle,
}

const greeting = computed(() => {
  const hour = new Date().getHours()
  const moment = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${moment}, ${firstName(store.currentUser.name)}`
})

const monthEnd = computed(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), store.daysInMonth).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  })
})

const running = computed(() => store.instances.filter(instance => instance.state === 'running').length)
const allocated = computed(() => ({ vcpus: store.usage.vcpus, memoryGiB: store.usage.memoryGiB }))
const unprotected = computed(() => store.instances.filter(instance => instance.backupPolicyId === undefined))
const backedUp = computed(() => store.instances.length - unprotected.value.length)

const limitLabel = (total: number) => (Number.isFinite(total) ? `of ${total}` : '')

const publicHint = computed(() => {
  const withIp = store.instances
    .filter(instance => (instance.publicIps?.length ?? 0) !== 0)
    .map(instance => instance.name)
  return withIp.length === 0 ? 'No instance exposed on the Internet' : `Used by ${withIp.join(', ')}`
})

const lastBackup = computed(() => Math.max(0, ...store.restorePoints.map(point => point.createdAt)))
const canOperate = computed(() => store.project.role !== 'viewer')
const costLabel = computed(() => (store.billingMode === 'showback' ? 'Internal cost this month' : 'Spent this month'))

const enabling = ref(false)
async function enableBackup(instanceId: string) {
  const policy = store.backupPolicies[0]
  enabling.value = true
  try {
    await store.setBackupPolicy(instanceId, policy.id)
    toasts.success(`${policy.name} enabled`, `${store.getInstance(instanceId)?.name} is now protected.`)
  } finally {
    enabling.value = false
  }
}
</script>

<style lang="postcss" scoped>
.project-line strong {
  color: var(--p-text);
  font-weight: 600;
}

.p-text {
  color: var(--p-text);
  font-weight: 600;
}

.callout {
  display: flex;
  align-items: center;
  gap: 1.6rem;
  padding: 1.6rem 2rem;
  border: 0.1rem solid color-mix(in srgb, var(--color-warning-item-base) 40%, var(--color-neutral-border));
  border-radius: var(--p-radius-l);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-warning-item-base) 12%, var(--p-surface)),
    var(--p-surface)
  );
  animation: p-fade-up 0.25s ease-out both;
}

.callout-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background-color: color-mix(in srgb, var(--color-warning-item-base) 22%, var(--p-surface));
  color: var(--color-warning-txt-base);
  flex-shrink: 0;
}

.callout-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  color: var(--p-text);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--p-gap);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--p-gap);
  align-items: start;
}

.spend,
.quotas-panel {
  align-self: stretch;
}

.spend :deep(.body) {
  flex: 1;
}

.quotas {
  display: flex;
  flex-direction: column;
  gap: 1.8rem;
}

.legend {
  display: flex;
  gap: 2rem;

  span {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
}

.swatch {
  display: inline-block;
  width: 1.6rem;
  height: 0;
  border-top: 0.25rem solid var(--color-brand-item-base);

  &.dashed {
    border-top-style: dashed;
    opacity: 0.6;
  }
}

.instance-row {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem 2.4rem;
  color: var(--p-text);
  text-decoration: none;
  transition: background-color 0.12s;

  &:hover {
    background-color: var(--p-brand-softer);
  }
}

.instance-name {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.activity {
  display: flex;
  flex-direction: column;
  list-style: none;
  padding: 0 2.4rem 1.6rem;
}

.event {
  position: relative;
  display: flex;
  gap: 1.2rem;
  padding-block: 0.8rem;

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 1.4rem;
    top: 3.8rem;
    bottom: -0.6rem;
    width: 0.1rem;
    background-color: var(--color-neutral-border);
  }
}

.event-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 50%;
  background-color: var(--p-subtle);
  color: var(--p-muted);
  flex-shrink: 0;

  &.create {
    background-color: var(--p-brand-soft);
    color: var(--color-brand-txt-base);
  }

  &.backup {
    background-color: color-mix(in srgb, var(--color-success-item-base) 15%, var(--p-surface));
    color: var(--color-success-txt-base);
  }

  &.snapshot {
    background-color: color-mix(in srgb, var(--p-chart-4) 15%, var(--p-surface));
    color: var(--p-chart-4);
  }

  &.delete {
    background-color: color-mix(in srgb, var(--color-danger-item-base) 12%, var(--p-surface));
    color: var(--color-danger-txt-base);
  }
}

.event-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;

  .message {
    color: var(--p-text);
    text-decoration: none;
  }

  a.message:hover {
    color: var(--color-brand-txt-base);
  }
}

@media (max-width: 1200px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .tiles {
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem;
  }

  .tiles :deep(.stat-tile) {
    padding: 1.4rem;

    .value {
      font-size: 2.4rem;
    }

    .icon,
    .hint {
      display: none;
    }
  }

  .callout {
    flex-wrap: wrap;
  }
}
</style>
