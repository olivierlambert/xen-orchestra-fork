<template>
  <PageHeader title="Instances" icon="fa:server">
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
    <UiCard>
      <div class="toolbar">
        <UiInput v-model="search" accent="brand" right-icon="fa:magnifying-glass" clearable class="search" />
        <span class="typo-body-regular-small muted"
          >{{ filtered.length }} of {{ store.instances.length }} instances</span
        >
      </div>
      <VtsTable :state="tableState">
        <thead>
          <tr>
            <VtsHeaderCell>Name</VtsHeaderCell>
            <VtsHeaderCell>State</VtsHeaderCell>
            <VtsHeaderCell>Size</VtsHeaderCell>
            <VtsHeaderCell>IP addresses</VtsHeaderCell>
            <VtsHeaderCell>Backups</VtsHeaderCell>
            <VtsHeaderCell>Price</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="instance of filtered" :key="instance.id">
            <VtsLinkCell :to="`/instances/${instance.id}`" icon="fa:server">{{ instance.name }}</VtsLinkCell>
            <UiTableCell><InstanceStateTag :state="instance.state" /></UiTableCell>
            <VtsTextCell>
              {{ store.getOffering(instance.offeringId).name }}
              <span class="muted">
                · {{ store.getOffering(instance.offeringId).vcpus }} vCPU,
                {{ store.getOffering(instance.offeringId).memoryGiB }} GiB
              </span>
            </VtsTextCell>
            <VtsTextCell>
              {{ [publicIp(instance.id), instance.privateIp].filter(Boolean).join(' · ') || '-' }}
            </VtsTextCell>
            <UiTableCell>
              <UiTag v-if="instance.backupPolicyId" accent="success" variant="secondary">
                {{ store.getBackupPolicy(instance.backupPolicyId)!.name }}
              </UiTag>
              <UiTag v-else accent="warning" variant="secondary">None</UiTag>
            </UiTableCell>
            <VtsTextCell>{{ formatHourlyPrice(store.getOffering(instance.offeringId).pricePerHour) }}</VtsTextCell>
          </VtsRow>
        </tbody>
      </VtsTable>
    </UiCard>
  </PageContent>
</template>

<script lang="ts" setup>
import InstanceStateTag from '@/components/InstanceStateTag.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatHourlyPrice } from '@/utils/format.ts'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsLinkCell from '@core/components/table/cells/VtsLinkCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable, { type TableState } from '@core/components/table/VtsTable.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import UiTag from '@core/components/ui/tag/UiTag.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const store = usePortalStore()
const router = useRouter()

const search = ref<string | number | undefined>('')

const filtered = computed(() => {
  const query = String(search.value ?? '')
    .trim()
    .toLowerCase()
  return store.instances.filter(
    instance => query === '' || instance.name.includes(query) || instance.privateIp.includes(query)
  )
})

const tableState = computed<TableState | undefined>(() => {
  if (store.instances.length === 0) {
    return { type: 'no-data', message: 'No instances in this project yet' }
  }
  if (filtered.value.length === 0) {
    return { type: 'no-result', message: 'No instance matches your search' }
  }
  return undefined
})

function publicIp(instanceId: string) {
  const live = store.getInstance(instanceId)?.publicIps
  if (live !== undefined && live.length !== 0) {
    return live.join(', ')
  }
  const direct = store.floatingIps.find(ip => ip.instanceId === instanceId)
  if (direct !== undefined) {
    return direct.address
  }
  const forward = store.portForwards.find(forward => forward.instanceId === instanceId)
  const ip = forward && store.floatingIps.find(ip => ip.id === forward.floatingIpId)
  return ip && `${ip.address} (NAT)`
}
</script>

<style lang="postcss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.6rem;
}

.search {
  max-width: 32rem;
}

.muted {
  color: var(--color-neutral-txt-secondary);
}
</style>
