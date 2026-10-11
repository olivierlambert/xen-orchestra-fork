<template>
  <PageHeader title="Instances" :subtitle="summary">
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
    <div class="toolbar">
      <label class="search">
        <PIcon :icon="faMagnifyingGlass" class="p-muted" />
        <input v-model="search" type="search" placeholder="Search by name or address" class="typo-body-regular" />
      </label>
      <div class="segments" role="tablist">
        <button
          v-for="item of FILTERS"
          :key="item.id"
          type="button"
          role="tab"
          class="segment typo-body-regular-small"
          :class="{ active: filter === item.id }"
          :aria-selected="filter === item.id"
          @click="filter = item.id"
        >
          {{ item.label }}
          <span class="p-num p-muted">{{ countOf(item.id) }}</span>
        </button>
      </div>
    </div>

    <PPanel flush>
      <div v-if="filtered.length !== 0" class="table" :class="{ 'no-cost': !store.showsCosts }" role="table">
        <div class="row head p-eyebrow" role="row">
          <span role="columnheader">Instance</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Addresses</span>
          <span role="columnheader">Backups</span>
          <span v-if="store.showsCosts" role="columnheader" class="right">Cost</span>
          <span />
        </div>
        <div v-for="instance of filtered" :key="instance.id" class="row item" role="row" @click="open(instance.id)">
          <span class="cell identity" role="cell">
            <OsBadge :os="store.getTemplate(instance.templateId).os" />
            <span class="names">
              <RouterLink :to="`/instances/${instance.id}`" class="name typo-body-bold" @click.stop>{{
                instance.name
              }}</RouterLink>
              <span class="p-caption p-muted"
                >{{ imageLabel(instance.templateId) }} · {{ sizeLabel(instance.offeringId) }}</span
              >
            </span>
          </span>
          <span class="cell status" role="cell"><StatusDot :state="instance.state" /></span>
          <span class="cell addresses" role="cell">
            <span v-for="ip of instance.publicIps ?? []" :key="ip" class="address">
              <PIcon :icon="faGlobe" size="small" class="public" />
              <CopyValue :value="ip" mono />
            </span>
            <span v-if="instance.privateIp" class="address">
              <PIcon :icon="faHouseLaptop" size="small" class="p-muted" />
              <CopyValue :value="instance.privateIp" mono class="p-muted" />
            </span>
            <span v-if="!instance.privateIp && !instance.publicIps?.length" class="p-muted p-caption">
              {{ instance.state === 'running' ? 'Waiting for the guest agent' : 'Assigned at start' }}
            </span>
          </span>
          <span class="cell backup-cell" role="cell">
            <span v-if="instance.backupPolicyId" class="backup ok typo-body-regular-small">
              <PIcon :icon="faShieldHalved" size="small" />
              {{ store.getBackupPolicy(instance.backupPolicyId)?.name }}
            </span>
            <span v-else class="backup none typo-body-regular-small">
              <PIcon :icon="faTriangleExclamation" size="small" />
              Not protected
            </span>
          </span>
          <span v-if="store.showsCosts" class="cell right cost" role="cell">
            <span class="typo-body-bold-small p-num"
              >≈ {{ formatMoney(monthly(instance.offeringId)) }}<span class="p-muted">/mo</span></span
            >
            <span class="p-caption p-muted p-num">{{
              formatHourlyPrice(store.getOffering(instance.offeringId).pricePerHour)
            }}</span>
          </span>
          <span class="cell menu" role="cell" @click.stop>
            <PMenu align="end">
              <template #trigger>
                <button type="button" class="kebab" :aria-label="`Actions for ${instance.name}`">
                  <PIcon :icon="faEllipsis" />
                </button>
              </template>
              <PMenuItem
                v-if="instance.state === 'halted' && canOperate"
                :icon="faPlay"
                @click="store.powerAction(instance.id, 'start')"
                >Start</PMenuItem
              >
              <template v-else-if="canOperate">
                <PMenuItem :icon="faRotateRight" @click="store.powerAction(instance.id, 'reboot')">Reboot</PMenuItem>
                <PMenuItem :icon="faPowerOff" @click="store.powerAction(instance.id, 'stop')">Stop</PMenuItem>
              </template>
              <PMenuItem :icon="faTerminal" :to="`/instances/${instance.id}?tab=console`">Open console</PMenuItem>
              <PMenuItem :icon="faCamera" :to="`/instances/${instance.id}?tab=protection`"
                >Snapshots & backups</PMenuItem
              >
            </PMenu>
          </span>
        </div>
      </div>
      <EmptyState
        v-else-if="store.instances.length === 0"
        :icon="faServer"
        title="No instance yet"
        description="Pick an image and a size: your instance is ready in about a minute, with your SSH key already installed."
      >
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          left-icon="fa:plus"
          @click="router.push('/instances/new')"
        >
          New instance
        </UiButton>
      </EmptyState>
      <EmptyState
        v-else
        :icon="faMagnifyingGlass"
        title="No match"
        description="No instance matches this search and filter."
      />
    </PPanel>
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
import PPanel from '@/components/ui/PPanel.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatHourlyPrice, formatMoney } from '@/utils/format.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import {
  faCamera,
  faEllipsis,
  faGlobe,
  faHouseLaptop,
  faMagnifyingGlass,
  faPlay,
  faPowerOff,
  faRotateRight,
  faServer,
  faShieldHalved,
  faTerminal,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const store = usePortalStore()
const router = useRouter()

type Filter = 'all' | 'running' | 'stopped'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'stopped', label: 'Stopped' },
]

const search = ref('')
const filter = ref<Filter>('all')

const canOperate = computed(() => store.project.role !== 'viewer')

const matches = (state: string, id: Filter) =>
  id === 'all' || (id === 'running' ? state !== 'halted' : state === 'halted')
const countOf = (id: Filter) => store.instances.filter(instance => matches(instance.state, id)).length

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return store.instances
    .filter(instance => matches(instance.state, filter.value))
    .filter(
      instance =>
        query === '' ||
        instance.name.toLowerCase().includes(query) ||
        instance.privateIp.includes(query) ||
        (instance.publicIps ?? []).some(ip => ip.includes(query))
    )
    .sort((a, b) => a.name.localeCompare(b.name))
})

const summary = computed(() => {
  const running = countOf('running')
  const hourly = store.instances
    .filter(instance => instance.state !== 'halted')
    .reduce((sum, instance) => sum + store.getOffering(instance.offeringId).pricePerHour, 0)
  const vcpus = store.instances
    .filter(instance => instance.state !== 'halted')
    .reduce((sum, instance) => sum + store.getOffering(instance.offeringId).vcpus, 0)
  return `${store.instances.length} instance${store.instances.length === 1 ? '' : 's'} · ${running} running · ${
    store.showsCosts ? `${formatHourlyPrice(hourly)} for compute` : `${vcpus} vCPU in use`
  }`
})

const imageLabel = (templateId: string) => {
  const template = store.getTemplate(templateId)
  return [template.name, template.version].filter(Boolean).join(' ')
}
const sizeLabel = (offeringId: string) => {
  const offering = store.getOffering(offeringId)
  return `${offering.name} · ${offering.vcpus} vCPU · ${offering.memoryGiB} GiB`
}
const monthly = (offeringId: string) => store.getOffering(offeringId).pricePerHour * 730

const open = (id: string) => router.push(`/instances/${id}`)
</script>

<style lang="postcss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  flex-wrap: wrap;
}

.search {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  max-width: 42rem;
  padding: 0.9rem 1.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);

  &:focus-within {
    border-color: var(--color-brand-item-base);
    box-shadow: 0 0 0 0.3rem color-mix(in srgb, var(--color-brand-item-base) 18%, transparent);
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--p-text);
  }
}

.segments {
  display: flex;
  padding: 0.3rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-subtle);
}

.segment {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: var(--p-radius-s);
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;

  &.active {
    background-color: var(--p-surface);
    color: var(--p-text);
    box-shadow: var(--p-elevation);
    font-weight: 600;
  }
}

.table {
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns:
    minmax(24rem, 2.2fr) minmax(10rem, 0.8fr) minmax(16rem, 1.4fr) minmax(14rem, 1fr) minmax(10rem, 0.8fr)
    4.4rem;
  align-items: center;
  gap: 1.6rem;
  padding: 1.4rem 2.4rem;
}

.head {
  padding-block: 0 1rem;
  border-block-end: var(--p-border);
}

.no-cost .row {
  grid-template-columns: minmax(24rem, 2.2fr) minmax(10rem, 0.8fr) minmax(16rem, 1.4fr) minmax(14rem, 1fr) 4.4rem;
}

.item {
  border-block-end: var(--p-border);
  cursor: pointer;
  transition: background-color 0.12s;

  &:last-child {
    border-block-end: none;
  }

  &:hover {
    background-color: var(--p-brand-softer);
  }
}

.right {
  text-align: end;
  justify-self: end;
}

.identity {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  min-width: 0;
}

.names {
  display: flex;
  flex-direction: column;
  min-width: 0;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.name {
  color: var(--p-text);
  text-decoration: none;

  &:hover {
    color: var(--color-brand-txt-base);
  }
}

.addresses {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.address {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;

  .public {
    color: var(--color-brand-txt-base);
  }
}

.backup {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 1rem;
  border-radius: 99rem;

  &.ok {
    background-color: color-mix(in srgb, var(--color-success-item-base) 12%, var(--p-surface));
    color: var(--color-success-txt-base);
  }

  &.none {
    background-color: color-mix(in srgb, var(--color-warning-item-base) 14%, var(--p-surface));
    color: var(--color-warning-txt-base);
  }
}

.cost {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.menu {
  justify-self: end;
}

.kebab {
  display: flex;
  padding: 0.8rem;
  border: none;
  border-radius: var(--p-radius-s);
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;

  &:hover {
    background-color: var(--p-subtle);
    color: var(--p-text);
  }
}

@media (max-width: 1100px) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'identity status menu'
      'addresses backup cost';
    row-gap: 1rem;
  }

  .head {
    display: none;
  }

  .identity {
    grid-area: identity;
  }

  .status {
    grid-area: status;
  }

  .backup-cell {
    grid-area: backup;
  }

  .addresses {
    grid-area: addresses;
  }

  .cost {
    grid-area: cost;
  }

  .menu {
    grid-area: menu;
  }
}

@media (max-width: 600px) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'identity menu'
      'status cost'
      'addresses addresses'
      'backup backup';
    padding: 1.6rem;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .search {
    max-width: none;
    width: 100%;
  }

  .segments {
    align-self: flex-start;
  }
}
</style>
