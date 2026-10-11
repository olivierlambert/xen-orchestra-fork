<template>
  <PageHeader :title="store.project.name" icon="fa:layer-group">
    <template #actions>
      <UiButton
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
    <div class="kpis">
      <UiCard>
        <UiCardTitle>Instances running</UiCardTitle>
        <span class="typo-h2 amount">{{ running }} / {{ store.instances.length }}</span>
        <RouterLink to="/instances" class="typo-body-regular-small">View all instances</RouterLink>
      </UiCard>
      <UiCard>
        <UiCardTitle>Spent this month</UiCardTitle>
        <span class="typo-h2 amount">{{ formatMoney(store.monthToDateCost) }}</span>
        <span class="typo-body-regular-small muted">
          Current rate {{ formatHourlyPrice(store.estimatedHourlyCost) }},
          {{ formatMonthlyPrice(store.estimatedHourlyCost) }}
        </span>
      </UiCard>
      <UiCard>
        <UiCardTitle>Public IPs</UiCardTitle>
        <span class="typo-h2 amount">{{ store.usage.floatingIps }}</span>
        <span v-if="!store.hasPublicIpPools" class="typo-body-regular-small muted">
          {{ attachedIps }} attached to an instance
        </span>
      </UiCard>
      <UiCard>
        <UiCardTitle>Protected by backups</UiCardTitle>
        <span class="typo-h2 amount">{{ backedUp }} / {{ store.instances.length }}</span>
        <RouterLink to="/instances" class="typo-body-regular-small">Review unprotected instances</RouterLink>
      </UiCard>
    </div>

    <div class="columns">
      <UiCard>
        <UiCardTitle>
          Quotas
          <template #description>Limits set by {{ store.provider.name }} for this project</template>
        </UiCardTitle>
        <div class="quotas">
          <VtsProgressBar
            v-for="item of limitedQuotaItems"
            :key="item.label"
            :label="item.label"
            :current="item.current"
            :total="item.total"
            legend-type="value-with-total"
            no-ruler
          />
          <span v-if="unlimitedQuotaItems.length !== 0" class="typo-body-regular-small muted">
            No limit: {{ unlimitedQuotaItems.map(item => `${item.label} (${item.current} used)`).join(', ') }}
          </span>
        </div>
      </UiCard>

      <UiCard>
        <UiCardTitle>Recent activity</UiCardTitle>
        <ul class="activity">
          <li v-for="event of store.activity.slice(0, 8)" :key="event.id" class="event">
            <span class="typo-body-regular">{{ event.message }}</span>
            <span class="typo-body-regular-small muted"> {{ event.user }} · <VtsRelativeTime :date="event.at" /> </span>
          </li>
        </ul>
      </UiCard>
    </div>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatHourlyPrice, formatMoney, formatMonthlyPrice } from '@/utils/format.ts'
import VtsProgressBar from '@core/components/progress-bar/VtsProgressBar.vue'
import VtsRelativeTime from '@core/components/relative-time/VtsRelativeTime.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const store = usePortalStore()
const router = useRouter()

const running = computed(() => store.instances.filter(instance => instance.state === 'running').length)
const backedUp = computed(() => store.instances.filter(instance => instance.backupPolicyId !== undefined).length)
const attachedIps = computed(
  () =>
    store.floatingIps.filter(
      ip => ip.instanceId !== undefined || store.portForwards.some(forward => forward.floatingIpId === ip.id)
    ).length
)

const quotaItems = computed(() => [
  { label: 'Instances', current: store.usage.instances, total: store.quota.instances },
  { label: 'vCPUs', current: store.usage.vcpus, total: store.quota.vcpus },
  { label: 'Memory GiB', current: store.usage.memoryGiB, total: store.quota.memoryGiB },
  { label: 'Storage GiB', current: store.usage.storageGiB, total: store.quota.storageGiB },
  { label: 'Public IPs', current: store.usage.floatingIps, total: store.quota.floatingIps },
  { label: 'Snapshots', current: store.usage.snapshots, total: store.quota.snapshots },
])

const limitedQuotaItems = computed(() => quotaItems.value.filter(item => Number.isFinite(item.total)))
const unlimitedQuotaItems = computed(() => quotaItems.value.filter(item => !Number.isFinite(item.total)))
</script>

<style lang="postcss" scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
  gap: 1.6rem;
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(40rem, 1fr));
  gap: 1.6rem;
}

.amount {
  color: var(--color-neutral-txt-primary);
}

.muted {
  color: var(--color-neutral-txt-secondary);
}

.quotas {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.activity {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  list-style: none;
}

.event {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding-block-end: 1.2rem;
  border-block-end: 0.1rem solid var(--color-neutral-border);
  color: var(--color-neutral-txt-primary);

  &:last-child {
    border: none;
  }
}

@media (max-width: 640px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
</style>
