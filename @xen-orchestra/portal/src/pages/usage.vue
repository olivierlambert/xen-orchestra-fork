<template>
  <PageHeader title="Usage" icon="fa:file-csv">
    <template #actions>
      <UiButton variant="secondary" accent="brand" size="medium" left-icon="fa:download" @click="exportCsv()">
        Export CSV
      </UiButton>
    </template>
  </PageHeader>
  <PageContent>
    <PreviewNotice>
      Preview: costs are estimated in your browser from the current resources of the project. Usage records will come
      from Xen Orchestra.
    </PreviewNotice>
    <div class="columns">
      <UiCard>
        <UiCardTitle>
          {{ monthLabel }}, month to date
          <template #description>Estimated charges. Your invoice is issued by {{ PROVIDER.name }}.</template>
        </UiCardTitle>
        <span class="typo-h1 amount">{{ formatMoney(store.monthToDateCost) }}</span>
        <span class="typo-body-regular-small muted">
          At the current rate, about {{ formatMoney(projectedCost) }} by the end of the month
        </span>
      </UiCard>
      <UiCard>
        <UiCardTitle>By category</UiCardTitle>
        <VtsDonutChartWithLegend :segments icon="fa:file-csv" />
      </UiCard>
    </div>

    <UiCard>
      <UiCardTitle>
        Details
        <template #description>
          Same records as the usage API, for billing integrations (WHMCS, HostBill, custom scripts).
        </template>
      </UiCardTitle>
      <VtsTable>
        <thead>
          <tr>
            <VtsHeaderCell>Category</VtsHeaderCell>
            <VtsHeaderCell>Resource</VtsHeaderCell>
            <VtsHeaderCell>Quantity</VtsHeaderCell>
            <VtsHeaderCell>Cost</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="line of sortedLines" :key="`${line.category}-${line.resourceId}`">
            <VtsTextCell>{{ CATEGORIES[line.category].label }}</VtsTextCell>
            <VtsTextCell>{{ line.resourceName }}</VtsTextCell>
            <VtsTextCell>{{ formatNumber(line.quantity) }} {{ line.unit }}</VtsTextCell>
            <VtsTextCell>{{ formatMoney(line.cost) }}</VtsTextCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div class="api typo-body-regular-small">
        <span class="muted">API</span>
        <code>GET /rest/v0/projects/{{ store.project.id }}/usage?from={{ monthStartIso }}</code>
      </div>
    </UiCard>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import PreviewNotice from '@/components/PreviewNotice.vue'
import { PROVIDER } from '@/mock/data.ts'
import type { UsageCategory } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatMoney, formatNumber } from '@/utils/format.ts'
import type { LegendItemAccent } from '@core/components/ui/legend/UiLegend.vue'
import VtsDonutChartWithLegend from '@core/components/donut-chart-with-legend/VtsDonutChartWithLegend.vue'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import { computed } from 'vue'

const store = usePortalStore()

const CATEGORIES: Record<UsageCategory, { label: string; accent: LegendItemAccent }> = {
  compute: { label: 'Compute', accent: 'info' },
  storage: { label: 'Storage', accent: 'success' },
  snapshots: { label: 'Snapshots', accent: 'warning' },
  backups: { label: 'Backups', accent: 'neutral' },
  'floating-ips': { label: 'Public IPs', accent: 'muted' },
}

const now = new Date()
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
const monthLabel = now.toLocaleString('en', { month: 'long', year: 'numeric' })
const monthStartIso = monthStart.toISOString().slice(0, 10)

const projectedCost = computed(
  () => store.monthToDateCost + ((monthEnd.getTime() - now.getTime()) / 3600e3) * store.estimatedHourlyCost
)

const sortedLines = computed(() => [...store.usageLines].sort((a, b) => b.cost - a.cost))

const segments = computed(() =>
  (Object.keys(CATEGORIES) as UsageCategory[]).map(category => ({
    label: CATEGORIES[category].label,
    accent: CATEGORIES[category].accent,
    value:
      Math.round(
        store.usageLines.filter(line => line.category === category).reduce((sum, line) => sum + line.cost, 0) * 100
      ) / 100,
    unit: '€',
  }))
)

function exportCsv() {
  const rows = [
    ['project', 'category', 'resource_id', 'resource', 'quantity', 'unit', 'cost'],
    ...store.usageLines.map(line => [
      store.project.id,
      line.category,
      line.resourceId,
      line.resourceName,
      line.quantity.toFixed(3),
      line.unit,
      line.cost.toFixed(4),
    ]),
  ]
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `usage-${store.project.id}-${monthStartIso}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<style lang="postcss" scoped>
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

.api {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  color: var(--color-neutral-txt-primary);

  code {
    padding: 0.2rem 0.6rem;
    border-radius: 0.4rem;
    background-color: var(--color-neutral-background-secondary);
  }
}

@media (max-width: 640px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
</style>
