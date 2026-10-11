<template>
  <PageHeader :title="title" :subtitle="subtitle">
    <template #actions>
      <UiButton variant="secondary" accent="brand" size="medium" left-icon="fa:download" @click="exportCsv()">
        Export CSV
      </UiButton>
    </template>
  </PageHeader>
  <PageContent>
    <PPanel class="hero">
      <div class="hero-grid">
        <div class="figures">
          <div class="figure">
            <span class="p-eyebrow">{{ store.showsCosts ? 'Month to date' : 'Compute, month to date' }}</span>
            <span class="big p-num">{{
              store.showsCosts ? formatMoney(store.monthToDateCost) : formatVcpuHours(store.monthVcpuHours)
            }}</span>
            <span class="typo-body-regular-small p-muted">{{ dayOfMonth }} of {{ store.daysInMonth }} days</span>
          </div>
          <div class="figure">
            <span class="p-eyebrow">Projected for {{ monthShort }}</span>
            <span class="medium p-num">{{
              store.showsCosts ? formatMoney(store.forecastCost) : formatVcpuHours(store.forecastVcpuHours)
            }}</span>
            <span class="typo-body-regular-small p-muted">
              {{
                store.showsCosts
                  ? `at ${formatHourlyPrice(store.estimatedHourlyCost)}, the current rate`
                  : 'with the instances running now'
              }}
            </span>
          </div>
          <div class="breakdown">
            <div v-if="store.showsCosts" class="stack" role="img" aria-label="Cost by category">
              <span
                v-for="item of categories"
                :key="item.id"
                class="stack-part"
                :style="{ flexGrow: item.cost, background: item.color }"
                :title="`${item.label}: ${formatMoney(item.cost)}`"
              />
            </div>
            <ul class="legend" :class="{ quantities: !store.showsCosts }">
              <li v-for="item of categories" :key="item.id" class="typo-body-regular-small">
                <i class="dot" :style="{ background: item.color }" />
                <span class="label">{{ item.label }}</span>
                <template v-if="store.showsCosts">
                  <span class="p-num value">{{ formatMoney(item.cost) }}</span>
                  <span class="p-num p-muted pct">{{ percent(item.cost) }}</span>
                </template>
                <span v-else class="p-num value">{{ formatQuantity(item.quantity, item.unit) }}</span>
              </li>
            </ul>
          </div>
        </div>
        <div class="chart">
          <SpendChart
            v-if="store.showsCosts"
            :points="store.dailySpend"
            :days-in-month="store.daysInMonth"
            :forecast="store.forecastCost"
          />
          <SpendChart
            v-else
            :points="store.dailyVcpuHours"
            :days-in-month="store.daysInMonth"
            :forecast="store.forecastVcpuHours"
            :format="formatVcpuHours"
          />
        </div>
      </div>
    </PPanel>

    <PPanel title="By instance" :description="byInstanceDescription" flush>
      <div class="table" :class="{ 'no-cost': !store.showsCosts }" role="table">
        <div class="row head p-eyebrow" role="row">
          <span>Instance</span>
          <span class="right">Compute</span>
          <span class="right">Storage</span>
          <span class="right">Public IPv4</span>
          <span v-if="store.showsCosts" class="right">Total</span>
        </div>
        <div v-for="item of byInstance" :key="item.id" class="row" role="row">
          <span class="instance">
            <RouterLink v-if="item.exists" :to="`/instances/${item.id}`" class="typo-body-bold-small name">{{
              item.name
            }}</RouterLink>
            <span v-else class="typo-body-bold-small name deleted">{{ item.name }}</span>
            <span class="p-caption p-muted"
              >{{ item.exists ? '' : 'deleted · ' }}{{ Math.round(item.hours) }} h running</span
            >
          </span>
          <template v-if="store.showsCosts">
            <span class="right p-num">{{ formatMoney(item.compute) }}</span>
            <span class="right p-num">{{ formatMoney(item.storage) }}</span>
            <span class="right p-num" :class="{ 'p-muted': item.ips === 0 }">{{
              item.ips === 0 ? '-' : formatMoney(item.ips)
            }}</span>
            <span class="right p-num total">{{ formatMoney(item.total) }}</span>
          </template>
          <template v-else>
            <span class="right p-num">{{ formatVcpuHours(item.vcpuHours) }}</span>
            <span class="right p-num">{{ formatQuantity(item.storageQuantity, 'GiB·month') }}</span>
            <span class="right p-num" :class="{ 'p-muted': item.ipHours === 0 }">{{
              item.ipHours === 0 ? '-' : formatQuantity(item.ipHours, 'h')
            }}</span>
          </template>
        </div>
        <div v-for="line of otherLines" :key="`${line.category}-${line.resourceId}`" class="row" role="row">
          <span class="instance">
            <span class="typo-body-bold-small name">{{ line.resourceName }}</span>
            <span v-if="store.showsCosts" class="p-caption p-muted"
              >{{ formatNumber(line.quantity) }} {{ line.unit }}</span
            >
          </span>
          <span />
          <span class="right p-num">{{
            store.showsCosts ? formatMoney(line.cost) : `${formatNumber(line.quantity)} ${line.unit}`
          }}</span>
          <span />
          <span v-if="store.showsCosts" class="right p-num total">{{ formatMoney(line.cost) }}</span>
        </div>
        <div v-if="store.showsCosts" class="row foot" role="row">
          <span class="typo-body-bold">Total</span>
          <span class="right p-num">{{ formatMoney(sum('compute')) }}</span>
          <span class="right p-num">{{ formatMoney(sum('storage') + sum('snapshots')) }}</span>
          <span class="right p-num">{{ formatMoney(sum('floating-ips')) }}</span>
          <span class="right p-num total">{{ formatMoney(store.monthToDateCost) }}</span>
        </div>
      </div>
      <template #footer>
        <span class="typo-body-regular-small">{{ footnote }}</span>
      </template>
    </PPanel>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import PPanel from '@/components/ui/PPanel.vue'
import SpendChart from '@/components/ui/SpendChart.vue'
import type { UsageCategory } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatHourlyPrice, formatMoney, formatNumber, formatQuantity, formatVcpuHours } from '@/utils/format.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import { computed, onMounted } from 'vue'

const store = usePortalStore()

onMounted(() => store.loadUsageRecords())

const CATEGORIES: Record<UsageCategory, { label: string; color: string; unit: string }> = {
  compute: { label: 'Compute', color: 'var(--p-chart-1)', unit: 'vCPU·h' },
  storage: { label: 'Storage', color: 'var(--p-chart-2)', unit: 'GiB·month' },
  'floating-ips': { label: 'Public IPv4', color: 'var(--p-chart-3)', unit: 'h' },
  snapshots: { label: 'Snapshots', color: 'var(--p-chart-4)', unit: 'GiB·month' },
  backups: { label: 'Backups', color: 'var(--p-chart-5)', unit: 'GiB·month' },
}

const now = new Date()
const dayOfMonth = now.getDate()
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const monthLabel = now.toLocaleString('en', { month: 'long', year: 'numeric' })
const monthShort = now.toLocaleString('en', { month: 'long' })
const monthLabelIso = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

const title = computed(
  () => ({ billing: 'Usage & costs', showback: 'Usage & internal costs', none: 'Usage' })[store.billingMode]
)

const subtitle = computed(() => {
  const parts = [monthLabel]
  if (store.billingMode === 'billing') {
    parts.push(`estimated, invoiced by ${store.provider.name}`)
  } else if (store.billingMode === 'showback') {
    parts.push('internal costs, not invoiced')
  }
  if (store.organization.costCenter) {
    parts.push(`cost center ${store.organization.costCenter}`)
  }
  return parts.join(' · ')
})

const byInstanceDescription = computed(() =>
  store.showsCosts
    ? 'Each instance with its disks and public IPv4. Deleted instances count for the time they existed.'
    : 'Resources used by each instance. Deleted instances count for the time they existed.'
)

const footnote = computed(() =>
  store.showsCosts
    ? `Computed from hourly samples and the prices of ${store.provider.name}: instances count while they run, disks and public IPv4 while they exist.`
    : 'Computed from hourly samples: instances count while they run, disks and public IPv4 while they exist.'
)

const linesOf = (category: UsageCategory) => store.usageLines.filter(line => line.category === category)
const sum = (category: UsageCategory) => linesOf(category).reduce((total, line) => total + line.cost, 0)
const quantity = (category: UsageCategory) =>
  linesOf(category).reduce((total, line) => total + (category === 'compute' ? (line.vcpuHours ?? 0) : line.quantity), 0)

const categories = computed(() =>
  (Object.keys(CATEGORIES) as UsageCategory[])
    .map(id => ({ id, ...CATEGORIES[id], cost: sum(id), quantity: quantity(id) }))
    .filter(item => (store.showsCosts ? item.cost >= 0.005 : item.quantity >= 0.5))
)

const percent = (cost: number) => {
  const total = store.monthToDateCost
  if (total === 0) {
    return ''
  }
  const ratio = (cost / total) * 100
  return ratio < 1 ? '<1%' : `${Math.round(ratio)}%`
}

const byInstance = computed(() => {
  type Group = {
    id: string
    name: string
    exists: boolean
    hours: number
    vcpuHours: number
    storageQuantity: number
    ipHours: number
    compute: number
    storage: number
    ips: number
    total: number
  }
  const groups = new Map<string, Group>()
  for (const line of store.usageLines) {
    if (line.instanceId === undefined) {
      continue
    }
    let group = groups.get(line.instanceId)
    if (group === undefined) {
      group = {
        id: line.instanceId,
        name: line.instanceName ?? line.instanceId,
        exists: store.getInstance(line.instanceId) !== undefined,
        hours: 0,
        vcpuHours: 0,
        storageQuantity: 0,
        ipHours: 0,
        compute: 0,
        storage: 0,
        ips: 0,
        total: 0,
      }
      groups.set(line.instanceId, group)
    }
    if (line.category === 'compute') {
      group.compute += line.cost
      group.hours += line.quantity
      group.vcpuHours += line.vcpuHours ?? 0
    } else if (line.category === 'floating-ips') {
      group.ips += line.cost
      group.ipHours += line.quantity
    } else {
      group.storage += line.cost
      group.storageQuantity += line.quantity
    }
    group.total += line.cost
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.exists) - Number(a.exists) || b.total - a.total || b.vcpuHours - a.vcpuHours
  )
})

const otherLines = computed(() => store.usageLines.filter(line => line.instanceId === undefined))

function exportCsv() {
  const withCost = store.showsCosts
  const rows = [
    [
      'month',
      'organization',
      'cost_center',
      'project',
      'category',
      'instance',
      'resource_id',
      'resource',
      'quantity',
      'unit',
      ...(withCost ? ['cost', 'currency'] : []),
    ],
    ...store.usageLines.map(line => [
      monthLabelIso,
      store.organization.name,
      store.organization.costCenter ?? '',
      store.project.name,
      line.category,
      line.instanceName ?? '',
      line.resourceId,
      line.resourceName,
      (line.category === 'compute' && !withCost ? (line.vcpuHours ?? 0) : line.quantity).toFixed(3),
      line.category === 'compute' && !withCost ? 'vCPU·h' : line.unit,
      ...(withCost ? [line.cost.toFixed(4), store.provider.currency] : []),
    ]),
  ]
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `${store.project.name.toLowerCase()}-usage-${monthLabelIso}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<style lang="postcss" scoped>
.hero-grid {
  display: grid;
  grid-template-columns: minmax(28rem, 1fr) minmax(0, 2fr);
  gap: 3.2rem;
}

.figures {
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--p-text);
}

.big {
  font-size: 4.4rem;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.medium {
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.breakdown {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.stack {
  display: flex;
  gap: 0.2rem;
  height: 1rem;
  border-radius: 99rem;
  overflow: hidden;
}

.stack-part {
  flex-basis: 0;
  min-width: 0.4rem;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 1rem 1fr auto 4rem;
    align-items: center;
    gap: 1rem;
    color: var(--p-text);
  }

  &.quantities li {
    grid-template-columns: 1rem 1fr auto;
  }

  .dot {
    width: 1rem;
    height: 1rem;
    border-radius: 0.3rem;
  }

  .value,
  .pct {
    text-align: end;
  }
}

.chart {
  display: flex;
  min-height: 28rem;
}

.table {
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns: minmax(18rem, 2fr) repeat(4, minmax(9rem, 1fr));
  align-items: center;
  gap: 1.6rem;
  padding: 1.2rem 2.4rem;
  border-block-end: var(--p-border);
  color: var(--p-text);
  font-size: 1.4rem;
}

.no-cost .row {
  grid-template-columns: minmax(18rem, 2fr) repeat(3, minmax(9rem, 1fr));
}

.head {
  padding-block: 0 1rem;
  font-size: 1.1rem;
}

.foot {
  border-block-end: none;
  background-color: color-mix(in srgb, var(--p-subtle) 60%, var(--p-surface));
}

.no-cost .row:last-child {
  border-block-end: none;
}

.right {
  text-align: end;
}

.total {
  font-weight: 600;
}

.instance {
  display: flex;
  flex-direction: column;
}

.name {
  color: var(--p-text);
  text-decoration: none;
}

a.name:hover {
  color: var(--color-brand-txt-base);
}

.deleted {
  color: var(--p-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--p-muted) 60%, transparent);
}

@media (max-width: 1000px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .row,
  .no-cost .row {
    grid-template-columns: 1fr auto;

    > :nth-child(2),
    > :nth-child(3),
    > :nth-child(4) {
      display: none;
    }
  }

  .no-cost .row {
    > :nth-child(2) {
      display: block;
    }

    > :nth-child(3),
    > :nth-child(4) {
      display: none;
    }
  }

  .head {
    display: none;
  }
}
</style>
