<template>
  <PageHeader title="New instance" icon="fa:plus" />
  <PageContent>
    <div class="layout">
      <div class="form">
        <UiCard>
          <UiCardTitle>1. Image</UiCardTitle>
          <div class="grid">
            <VtsStateHero v-if="store.templates.length === 0" format="card" type="no-data" size="small">
              No image available to this project yet
            </VtsStateHero>
            <SelectCard
              v-for="item of store.templates"
              :key="item.id"
              :selected="templateId === item.id"
              @click="templateId = item.id"
            >
              <span class="typo-body-bold">{{ item.name }}</span>
              <span class="typo-body-regular-small muted">{{ item.version }}</span>
              <UiTag v-if="item.cloudInit" accent="info" variant="secondary">cloud-init</UiTag>
            </SelectCard>
          </div>
        </UiCard>

        <UiCard>
          <UiCardTitle>
            2. Size
            <template #description>
              Disk size is included in the price. vCPU and memory count against your quota.
            </template>
          </UiCardTitle>
          <TabList>
            <TabItem
              v-for="family of families"
              :key="family.id"
              :active="selectedFamily === family.id"
              @click="selectedFamily = family.id"
            >
              {{ family.label }}
            </TabItem>
          </TabList>
          <div class="grid">
            <SelectCard
              v-for="item of familyOfferings"
              :key="item.id"
              :selected="offeringId === item.id"
              :disabled="!fitsQuota(item)"
              @click="offeringId = item.id"
            >
              <span class="typo-body-bold">{{ item.name }}</span>
              <span class="typo-body-regular-small">
                {{ item.vcpus }} vCPU · {{ item.memoryGiB }} GiB RAM · {{ item.diskGiB }} GiB disk
              </span>
              <span class="typo-body-bold-small price">{{ formatHourlyPrice(item.pricePerHour) }}</span>
              <span class="typo-body-regular-small muted">{{ formatMonthlyPrice(item.pricePerHour) }}</span>
              <span v-if="!fitsQuota(item)" class="typo-body-regular-small danger">Exceeds project quota</span>
            </SelectCard>
          </div>
        </UiCard>

        <UiCard>
          <UiCardTitle>3. Network and storage</UiCardTitle>
          <div class="fields">
            <FormField label="Network" for="network" :info="networkInfo">
              <NativeSelect id="network" v-model="networkId">
                <option v-for="network of store.networks" :key="network.id" :value="network.id">
                  {{ network.name }}<template v-if="network.cidr"> ({{ network.cidr }})</template>
                </option>
              </NativeSelect>
            </FormField>
            <FormField label="Additional data disk (GiB)" for="extra-disk" :info="extraDiskInfo">
              <UiInput id="extra-disk" v-model="extraDiskGiB" accent="brand" type="number" />
            </FormField>
          </div>
        </UiCard>

        <UiCard>
          <UiCardTitle>
            4. Access
            <template #description>Keys are injected with cloud-init at first boot</template>
          </UiCardTitle>
          <div v-if="template?.cloudInit" class="checkboxes">
            <UiCheckbox v-for="key of store.sshKeys" :key="key.id" v-model="sshKeyIds" :value="key.id" accent="brand">
              {{ key.name }} <span class="muted">{{ key.fingerprint }}</span>
            </UiCheckbox>
            <RouterLink to="/access" class="typo-body-regular-small">Manage SSH keys</RouterLink>
          </div>
          <UiInfo v-else accent="info">
            The Administrator password will be generated and shown in the instance console.
          </UiInfo>
        </UiCard>

        <UiCard>
          <UiCardTitle>
            5. Backups
            <template #description>Policies are defined by {{ PROVIDER.name }}. You can change this later.</template>
          </UiCardTitle>
          <PreviewNotice />
          <div class="grid">
            <SelectCard :selected="backupPolicyId === undefined" @click="backupPolicyId = undefined">
              <span class="typo-body-bold">No backups</span>
              <span class="typo-body-regular-small muted">You can still take manual snapshots</span>
            </SelectCard>
            <SelectCard
              v-for="policy of backupPolicies"
              :key="policy.id"
              :selected="backupPolicyId === policy.id"
              @click="backupPolicyId = policy.id"
            >
              <span class="typo-body-bold">{{ policy.name }}</span>
              <span class="typo-body-regular-small">{{ policy.description }}</span>
              <span class="typo-body-regular-small muted">
                Keeps {{ policy.retention }} restore points · {{ formatMoney(policy.pricePerGiBMonth) }}/GiB·month
              </span>
            </SelectCard>
          </div>
        </UiCard>
      </div>

      <UiCard class="summary">
        <UiCardTitle>Summary</UiCardTitle>
        <FormField label="Name" for="name">
          <UiInput id="name" v-model="name" accent="brand" />
        </FormField>
        <dl class="recap typo-body-regular">
          <dt class="muted">Image</dt>
          <dd>{{ template?.name }} {{ template?.version }}</dd>
          <dt class="muted">Size</dt>
          <dd>{{ offering.name }} ({{ offering.vcpus }} vCPU, {{ offering.memoryGiB }} GiB)</dd>
          <dt class="muted">Storage</dt>
          <dd>{{ offering.diskGiB + extraDisk }} GiB</dd>
          <dt class="muted">Network</dt>
          <dd>{{ store.getNetwork(networkId)?.name }}</dd>
          <dt class="muted">Backups</dt>
          <dd>{{ store.getBackupPolicy(backupPolicyId)?.name ?? 'None' }}</dd>
        </dl>
        <div class="total">
          <span class="typo-h3">{{ formatHourlyPrice(hourlyPrice) }}</span>
          <span class="typo-body-regular-small muted">{{ formatMonthlyPrice(hourlyPrice) }}, billed per hour</span>
        </div>
        <UiInfo v-if="quotaError" accent="danger" wrap>{{ quotaError }}</UiInfo>
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          :busy="creating"
          :disabled="!canCreate"
          left-icon="fa:play"
          @click="create()"
        >
          Create instance
        </UiButton>
      </UiCard>
    </div>
  </PageContent>
</template>

<script lang="ts" setup>
import FormField from '@/components/FormField.vue'
import NativeSelect from '@/components/NativeSelect.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import PreviewNotice from '@/components/PreviewNotice.vue'
import SelectCard from '@/components/SelectCard.vue'
import { backupPolicies, offerings, PROVIDER } from '@/mock/data.ts'
import type { Offering } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatHourlyPrice, formatMoney, formatMonthlyPrice } from '@/utils/format.ts'
import VtsStateHero from '@core/components/state-hero/VtsStateHero.vue'
import TabItem from '@core/components/tab/TabItem.vue'
import TabList from '@core/components/tab/TabList.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import UiCheckbox from '@core/components/ui/checkbox/UiCheckbox.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTag from '@core/components/ui/tag/UiTag.vue'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const STORAGE_PRICE_PER_GIB_HOUR = 0.05 / 730

const store = usePortalStore()
const router = useRouter()

const families: { id: Offering['family']; label: string }[] = [
  { id: 'general', label: 'General purpose' },
  { id: 'compute', label: 'CPU optimized' },
  { id: 'memory', label: 'Memory optimized' },
]

const templateId = ref(store.templates[0]?.id)
const selectedFamily = ref<Offering['family']>('general')
const offeringId = ref('g1.medium')
const networkId = ref(store.networks[0]?.id)
const extraDiskGiB = ref<string | number | undefined>(0)
const sshKeyIds = ref(store.sshKeys.slice(0, 1).map(key => key.id))
const backupPolicyId = ref<string | undefined>(backupPolicies[0].id)
const name = ref<string | number | undefined>(`instance-${store.instances.length + 1}`)
const creating = ref(false)

const template = computed(() => (templateId.value === undefined ? undefined : store.getTemplate(templateId.value)))

// the live templates and networks arrive after the page may have been opened
watch(
  () => [store.templates, store.networks] as const,
  ([templates, networks]) => {
    if (!templates.some(item => item.id === templateId.value)) {
      templateId.value = templates[0]?.id
    }
    if (!networks.some(item => item.id === networkId.value)) {
      networkId.value = networks[0]?.id
    }
  }
)

const networkInfo = computed(() =>
  store.backend === 'xo'
    ? 'Networks made available to the project by your provider'
    : 'Private network with DHCP, routed by the project router'
)
const offering = computed(() => store.getOffering(offeringId.value))
const familyOfferings = computed(() => offerings.filter(offering => offering.family === selectedFamily.value))
const extraDisk = computed(() => Math.max(0, Number(extraDiskGiB.value) || 0))

const extraDiskInfo = computed(() => {
  const left = store.quota.storageGiB - store.usage.storageGiB
  return `${formatMoney(0.05)}/GiB·month. ${Number.isFinite(left) ? `${left} GiB left in quota.` : 'No storage quota.'}`
})

const hourlyPrice = computed(() => offering.value.pricePerHour + extraDisk.value * STORAGE_PRICE_PER_GIB_HOUR)

function fitsQuota(offering: Offering) {
  const { usage, quota } = store
  return usage.vcpus + offering.vcpus <= quota.vcpus && usage.memoryGiB + offering.memoryGiB <= quota.memoryGiB
}

const quotaError = computed(() => {
  const { usage, quota } = store
  if (usage.instances >= quota.instances) {
    return `Instance quota reached (${quota.instances}). Delete an instance or ask ${PROVIDER.name} for more.`
  }
  if (!fitsQuota(offering.value)) {
    return 'This size exceeds the vCPU or memory quota of the project.'
  }
  if (usage.storageGiB + offering.value.diskGiB + extraDisk.value > quota.storageGiB) {
    return 'Not enough storage quota left for this disk size.'
  }
  return undefined
})

const canCreate = computed(
  () =>
    quotaError.value === undefined &&
    templateId.value !== undefined &&
    networkId.value !== undefined &&
    /^[a-z0-9][a-z0-9-]*$/.test(String(name.value ?? '')) &&
    !creating.value
)

async function create() {
  creating.value = true
  try {
    const instance = await store.createInstance({
      name: String(name.value),
      offeringId: offeringId.value,
      templateId: templateId.value!,
      networkId: networkId.value!,
      extraDiskGiB: extraDisk.value,
      backupPolicyId: backupPolicyId.value,
      sshKeyIds: template.value?.cloudInit ? sshKeyIds.value : [],
    })
    if (instance !== undefined) {
      await router.push(`/instances/${instance.id}`)
    }
  } finally {
    creating.value = false
  }
}
</script>

<style lang="postcss" scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 36rem;
  gap: 1.6rem;
  align-items: start;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  min-width: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1.2rem;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
  gap: 1.6rem;
}

.checkboxes {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.summary {
  position: sticky;
  top: 1.6rem;
}

.recap {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem 1.6rem;
  color: var(--color-neutral-txt-primary);
}

.total {
  display: flex;
  flex-direction: column;
  color: var(--color-neutral-txt-primary);
}

.muted {
  color: var(--color-neutral-txt-secondary);
}

.price {
  color: var(--color-brand-txt-base);
}

.danger {
  color: var(--color-danger-txt-base);
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .summary {
    position: static;
  }
}
</style>
