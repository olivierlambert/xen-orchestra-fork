<template>
  <PageHeader
    title="Networking"
    :subtitle="
      store.showsPublicIps
        ? `Networks and public addresses of ${store.project.name}`
        : `Networks available to ${store.project.name}`
    "
  />
  <PageContent>
    <template v-if="store.isLive">
      <div class="networks">
        <article
          v-for="network of store.networks"
          :key="network.id"
          class="network"
          :class="{ public: network.publicIpv4 }"
        >
          <header class="network-head">
            <span class="network-icon"><PIcon :icon="network.publicIpv4 ? faGlobe : faLock" size="large" /></span>
            <div>
              <h2 class="typo-h6">{{ network.name }}</h2>
              <p class="typo-body-regular-small p-muted">
                {{ network.description || (network.publicIpv4 ? 'Public IPv4' : 'Private addressing') }}
              </p>
            </div>
          </header>
          <dl class="facts">
            <div>
              <dt>Addressing</dt>
              <dd>{{ network.publicIpv4 ? 'Static public IPv4, set by cloud-init' : 'DHCP' }}</dd>
            </div>
            <div>
              <dt>Instances</dt>
              <dd class="p-num">{{ instancesOn(network.id).length }}</dd>
            </div>
            <div v-if="network.publicIpv4 && store.showsCosts">
              <dt>Price</dt>
              <dd class="p-num">{{ formatMoney(store.provider.prices.ipPerHour * 730) }} per address per month</dd>
            </div>
          </dl>
          <div v-if="instancesOn(network.id).length !== 0" class="chips">
            <RouterLink
              v-for="instance of instancesOn(network.id)"
              :key="instance.id"
              :to="`/instances/${instance.id}`"
              class="chip typo-body-regular-small"
            >
              <StatusDot :state="instance.state" dot-only />
              {{ instance.name }}
            </RouterLink>
          </div>
        </article>
      </div>

      <PPanel v-if="store.showsPublicIps" title="Public IPv4" :count="publicAddresses.length" flush>
        <template #description>
          Given to instances created on the Internet network, released when the instance is deleted.
          <template v-if="Number.isFinite(store.quota.floatingIps)">
            {{ store.usage.floatingIps }} of {{ store.quota.floatingIps }} used.
          </template>
        </template>
        <ul v-if="publicAddresses.length !== 0" class="p-list">
          <li v-for="item of publicAddresses" :key="item.address" class="address-row">
            <span class="address-icon"><PIcon :icon="faGlobe" /></span>
            <CopyValue :value="item.address" mono class="address typo-body-bold" />
            <RouterLink :to="`/instances/${item.instance.id}`" class="attached typo-body-regular-small">
              <PIcon :icon="faArrowRight" size="small" class="p-muted" />
              <StatusDot :state="item.instance.state" dot-only />
              {{ item.instance.name }}
            </RouterLink>
            <span v-if="store.showsCosts" class="p-caption p-muted p-num"
              >{{ formatMoney(store.provider.prices.ipPerHour * 730) }}/mo</span
            >
          </li>
        </ul>
        <EmptyState
          v-else
          :icon="faGlobe"
          title="No public address"
          description="Create an instance on the Internet network to give it a public IPv4."
        />
      </PPanel>
    </template>
    <NetworkingPreview v-else />
  </PageContent>
</template>

<script lang="ts" setup>
import NetworkingPreview from '@/components/NetworkingPreview.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import CopyValue from '@/components/ui/CopyValue.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PIcon from '@/components/ui/PIcon.vue'
import PPanel from '@/components/ui/PPanel.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatMoney } from '@/utils/format.ts'
import { faArrowRight, faGlobe, faLock } from '@fortawesome/free-solid-svg-icons'
import { computed } from 'vue'

const store = usePortalStore()

const instancesOn = (networkId: string) => store.instances.filter(instance => instance.networkId === networkId)

const publicAddresses = computed(() =>
  store.instances
    .flatMap(instance => (instance.publicIps ?? []).map(address => ({ address, instance })))
    .sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }))
)
</script>

<style lang="postcss" scoped>
.networks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(32rem, 1fr));
  gap: var(--p-gap);
}

.network {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-l);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation);
  animation: p-fade-up 0.25s ease-out both;

  &.public {
    background: linear-gradient(160deg, var(--p-brand-softer), var(--p-surface) 55%);
  }
}

.network-head {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  color: var(--p-text);
}

.network-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  border-radius: var(--p-radius-m);
  background-color: var(--p-subtle);
  color: var(--p-muted);
  flex-shrink: 0;

  .public & {
    background-color: var(--p-brand-soft);
    color: var(--color-brand-txt-base);
  }
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  > div {
    display: flex;
    justify-content: space-between;
    gap: 1.6rem;
    font-size: 1.4rem;
  }

  dt {
    color: var(--p-muted);
  }

  dd {
    color: var(--p-text);
    text-align: end;
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 1rem;
  border: var(--p-border);
  border-radius: 99rem;
  background-color: var(--p-surface);
  color: var(--p-text);
  text-decoration: none;

  &:hover {
    border-color: var(--color-brand-item-base);
  }
}

.address-row {
  display: flex;
  align-items: center;
  gap: 1.6rem;
  padding: 1.2rem 2.4rem;
  flex-wrap: wrap;
}

.address-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: var(--p-radius-m);
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);
}

.address {
  min-width: 16rem;
  color: var(--p-text);
}

.attached {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
  color: var(--p-text);
  text-decoration: none;

  &:hover {
    color: var(--color-brand-txt-base);
  }
}
</style>
