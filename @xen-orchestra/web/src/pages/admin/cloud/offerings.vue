<template>
  <div class="cloud-offerings">
    <UiCard>
      <UiTitle>
        {{ t('offerings') }}
        <template #action>
          <UiButton variant="tertiary" accent="brand" size="small" left-icon="fa:rotate-left" @click="reload()">
            {{ t('cloud:refresh') }}
          </UiButton>
        </template>
      </UiTitle>
      <UiInfo accent="info" wrap>{{ t('cloud:offerings-description') }}</UiInfo>
      <UiAlert v-if="error" accent="danger">{{ error }}</UiAlert>
      <VtsTable :state="offerings.length === 0 ? { type: 'no-data', message: t('cloud:no-offering') } : undefined">
        <thead>
          <tr>
            <VtsHeaderCell>{{ t('name') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:family') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('vcpus') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:memory-gib') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:disk-gib') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:price-per-hour') }}</VtsHeaderCell>
            <VtsHeaderCell>{{ t('cloud:actions') }}</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="offering of offerings" :key="offering.id">
            <VtsTextCell>{{ offering.name }}</VtsTextCell>
            <VtsTextCell>{{ offering.family }}</VtsTextCell>
            <VtsTextCell>{{ offering.cpus }}</VtsTextCell>
            <VtsTextCell>{{ offering.memory / GiB }}</VtsTextCell>
            <VtsTextCell>{{ offering.disk / GiB }}</VtsTextCell>
            <VtsTextCell>{{ offering.pricePerHour }}</VtsTextCell>
            <UiTableCell>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                @click="remove(offering.id)"
              >
                {{ t('action:delete') }}
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
    </UiCard>

    <UiCard>
      <UiTitle>{{ t('cloud:new-offering') }}</UiTitle>
      <div class="form">
        <VtsInputWrapper :label="t('name')">
          <UiInput v-model="form.name" accent="brand" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('cloud:family')">
          <CloudSelect v-model="form.family">
            <option value="general">{{ t('cloud:family-general') }}</option>
            <option value="compute">{{ t('cloud:family-compute') }}</option>
            <option value="memory">{{ t('cloud:family-memory') }}</option>
          </CloudSelect>
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('vcpus')">
          <UiInput v-model="form.cpus" accent="brand" type="number" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('cloud:memory-gib')">
          <UiInput v-model="form.memory" accent="brand" type="number" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('cloud:disk-gib')">
          <UiInput v-model="form.disk" accent="brand" type="number" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('cloud:price-per-hour')">
          <UiInput v-model="form.pricePerHour" accent="brand" type="number" />
        </VtsInputWrapper>
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
import { cloudApi, GiB } from '@/modules/cloud/cloud.api.ts'
import CloudSelect from '@/modules/cloud/components/CloudSelect.vue'
import { useCloudAction, useCloudResource } from '@/modules/cloud/use-cloud-resource.ts'
import VtsInputWrapper from '@core/components/input-wrapper/VtsInputWrapper.vue'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiAlert from '@core/components/ui/alert/UiAlert.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import UiTitle from '@core/components/ui/title/UiTitle.vue'
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { data: offerings, error, reload } = useCloudResource(cloudApi.getOfferings, [])
const action = useCloudAction()

const form = reactive<{
  name: string | number | undefined
  family: string
  cpus: string | number | undefined
  memory: string | number | undefined
  disk: string | number | undefined
  pricePerHour: string | number | undefined
}>({ name: '', family: 'general', cpus: 2, memory: 4, disk: 40, pricePerHour: 0.024 })

const canCreate = computed(
  () =>
    String(form.name ?? '').trim() !== '' &&
    Number(form.cpus) > 0 &&
    Number(form.memory) > 0 &&
    Number(form.disk) > 0 &&
    Number(form.pricePerHour) >= 0 &&
    !action.isRunning.value
)

async function create() {
  const created = await action.run(() =>
    cloudApi.createOffering({
      name: String(form.name).trim(),
      family: form.family,
      cpus: Number(form.cpus),
      memory: Math.round(Number(form.memory) * GiB),
      disk: Math.round(Number(form.disk) * GiB),
      pricePerHour: Number(form.pricePerHour),
    })
  )
  if (created !== undefined) {
    form.name = ''
    await reload()
  }
}

async function remove(id: string) {
  await action.run(() => cloudApi.deleteOffering(id))
  await reload()
}
</script>

<style lang="postcss" scoped>
.cloud-offerings {
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
</style>
