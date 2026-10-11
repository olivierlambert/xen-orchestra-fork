<template>
  <div class="cloud-ip-pools">
    <UiCard>
      <UiTitle>
        {{ t('ip-pools') }}
        <template #action>
          <UiButton variant="tertiary" accent="brand" size="small" left-icon="fa:rotate-left" @click="reload()">
            {{ t('cloud:refresh') }}
          </UiButton>
        </template>
      </UiTitle>
      <UiInfo accent="info" wrap>{{ t('cloud:ip-pools-description') }}</UiInfo>
      <UiAlert v-if="error" accent="danger">{{ error }}</UiAlert>
      <VtsTable :state="ipPools.length === 0 ? { type: 'no-data', message: t('cloud:no-ip-pool') } : undefined">
        <thead>
          <tr>
            <VtsHeaderCell>{{ t('name') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('networks') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('gateway') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('dns') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:addresses-used') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:actions') }}</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="pool of ipPools" :key="pool.id">
            <VtsTextCell>{{ pool.name }}</VtsTextCell>
            <VtsTextCell>{{ pool.networks.map(networkName).join(', ') }}</VtsTextCell>
            <VtsTextCell>
              {{ pool.gateway ? `${pool.gateway}/${pool.prefixLength ?? '?'}` : t('cloud:none') }}
            </VtsTextCell>
            <VtsTextCell>{{ pool.dns?.join(', ') || t('cloud:none') }}</VtsTextCell>
            <VtsTextCell>
              {{
                t('cloud:used-of-total', {
                  used: pool.addresses.filter(address => address.vifs.length !== 0).length,
                  total: pool.addresses.length,
                })
              }}
            </VtsTextCell>
            <UiTableCell>
              <UiButton variant="tertiary" accent="danger" size="small" left-icon="fa:trash" @click="remove(pool.id)">
                {{ t('action:delete') }}
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
    </UiCard>

    <UiCard>
      <UiTitle>{{ t('cloud:new-ip-pool') }}</UiTitle>
      <div class="form">
        <VtsInputWrapper :label="t('name')">
          <UiInput v-model="form.name" accent="brand" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('gateway')">
          <UiInput v-model="form.gateway" accent="brand" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('cloud:prefix-length')">
          <UiInput v-model="form.prefixLength" accent="brand" type="number" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('cloud:dns-servers')">
          <UiInput v-model="form.dns" accent="brand" />
        </VtsInputWrapper>
      </div>
      <VtsInputWrapper :label="t('cloud:addresses')" :message="t('cloud:addresses-help')">
        <UiTextarea v-model="form.addresses" accent="brand" />
      </VtsInputWrapper>
      <div class="networks">
        <span class="typo-body-bold">{{ t('networks') }}</span>
        <div v-for="pool of infrastructure.pools" :key="pool.id" class="group">
          <span class="typo-body-regular-small muted">{{ pool.name_label }}</span>
          <UiCheckbox
            v-for="network of infrastructure.networks.filter(network => network.$pool === pool.id)"
            :key="network.id"
            v-model="form.networks"
            :value="network.id"
            accent="brand"
          >
            {{ network.name_label }}
          </UiCheckbox>
        </div>
      </div>
      <UiAlert v-if="action.error.value" accent="danger">{{ action.error.value }}</UiAlert>
      <div>
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          left-icon="fa:plus"
          :busy="action.isRunning.value"
          :disabled="!canCreate"
          @click="create()"
        >
          {{ t('action:create') }}
        </UiButton>
      </div>
    </UiCard>
  </div>
</template>

<script lang="ts" setup>
import { cloudApi, getCloudInfrastructure, type CloudInfrastructure } from '@/modules/cloud/cloud.api.ts'
import { useCloudAction, useCloudResource } from '@/modules/cloud/use-cloud-resource.ts'
import VtsInputWrapper from '@core/components/input-wrapper/VtsInputWrapper.vue'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiAlert from '@core/components/ui/alert/UiAlert.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCheckbox from '@core/components/ui/checkbox/UiCheckbox.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import UiTextarea from '@core/components/ui/text-area/UiTextarea.vue'
import UiTitle from '@core/components/ui/title/UiTitle.vue'
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { data: ipPools, error, reload } = useCloudResource(cloudApi.getIpPools, [])
const { data: infrastructure } = useCloudResource<CloudInfrastructure>(getCloudInfrastructure, {
  pools: [],
  templates: [],
  networks: [],
  srs: [],
  backupJobs: [],
})
const action = useCloudAction()

const networkName = (id: string) => infrastructure.value.networks.find(network => network.id === id)?.name_label ?? id

const form = reactive<{
  name: string | number | undefined
  gateway: string | number | undefined
  prefixLength: string | number | undefined
  dns: string | number | undefined
  addresses: string
  networks: string[]
}>({ name: '', gateway: '', prefixLength: 24, dns: '', addresses: '', networks: [] })

const addressLines = computed(() =>
  form.addresses
    .split(/[\n,]/)
    .map(line => line.trim())
    .filter(line => line !== '')
)

const canCreate = computed(
  () =>
    String(form.name ?? '').trim() !== '' &&
    addressLines.value.length !== 0 &&
    form.networks.length !== 0 &&
    !action.isRunning.value
)

async function create() {
  const gateway = String(form.gateway ?? '').trim()
  const dns = String(form.dns ?? '')
    .split(',')
    .map(server => server.trim())
    .filter(server => server !== '')
  const created = await action.run(() =>
    cloudApi.createIpPool({
      name: String(form.name).trim(),
      networks: form.networks,
      addresses: addressLines.value,
      ...(gateway !== '' && { gateway, prefixLength: Number(form.prefixLength) }),
      ...(dns.length !== 0 && { dns }),
    })
  )
  if (created !== undefined) {
    form.name = ''
    form.addresses = ''
    await reload()
  }
}

async function remove(id: string) {
  await action.run(() => cloudApi.deleteIpPool(id))
  await reload()
}
</script>

<style lang="postcss" scoped>
.cloud-ip-pools {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.8rem;
}

.form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 1.6rem;
}

.networks {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
}

.muted {
  color: var(--color-neutral-txt-secondary);
}
</style>
