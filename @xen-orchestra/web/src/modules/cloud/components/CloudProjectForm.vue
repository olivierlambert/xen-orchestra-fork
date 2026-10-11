<template>
  <div class="cloud-project-form">
    <UiCard>
      <UiTitle>{{ t('cloud:project') }}</UiTitle>
      <div class="fields">
        <VtsInputWrapper v-if="projectId === undefined" :label="t('cloud:organization')">
          <CloudSelect v-model="form.organizationId">
            <option v-for="organization of organizations" :key="organization.id" :value="organization.id">
              {{ organization.name }}
            </option>
          </CloudSelect>
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('name')">
          <UiInput v-model="form.name" accent="brand" />
        </VtsInputWrapper>
        <VtsInputWrapper :label="t('description')">
          <UiInput v-model="form.description" accent="brand" />
        </VtsInputWrapper>
      </div>
    </UiCard>

    <UiCard>
      <UiTitle>{{ t('cloud:quota') }}</UiTitle>
      <UiInfo accent="info" wrap>{{ t('cloud:quota-description') }}</UiInfo>
      <div class="fields">
        <VtsInputWrapper v-for="key of QUOTA_KEYS" :key :label="t(`cloud:quota-${key}`)">
          <UiInput v-model="form.quota[key]" accent="brand" type="number" />
        </VtsInputWrapper>
      </div>
    </UiCard>

    <UiCard>
      <UiTitle>{{ t('cloud:scope') }}</UiTitle>
      <UiInfo accent="info" wrap>{{ t('cloud:scope-description') }}</UiInfo>
      <div class="group">
        <span class="typo-body-bold">{{ t('pools') }}</span>
        <UiCheckbox
          v-for="pool of infrastructure.pools"
          :key="pool.id"
          v-model="form.scope.pools"
          :value="pool.id"
          accent="brand"
        >
          {{ pool.name_label }}
        </UiCheckbox>
      </div>
      <div v-for="pool of selectedPools" :key="pool.id" class="pool">
        <span class="typo-h6">{{ pool.name_label }}</span>
        <div class="columns">
          <div class="group">
            <span class="typo-body-bold">{{ t('cloud:templates') }}</span>
            <UiCheckbox
              v-for="template of templatesOf(pool.id, false)"
              :key="template.id"
              v-model="form.scope.templates"
              :value="template.id"
              accent="brand"
            >
              {{ template.name_label }}
            </UiCheckbox>
            <details>
              <summary class="typo-body-regular-small">{{ t('cloud:default-templates') }}</summary>
              <div class="group">
                <UiCheckbox
                  v-for="template of templatesOf(pool.id, true)"
                  :key="template.id"
                  v-model="form.scope.templates"
                  :value="template.id"
                  accent="brand"
                >
                  {{ template.name_label }}
                </UiCheckbox>
              </div>
            </details>
          </div>
          <div class="group">
            <span class="typo-body-bold">{{ t('networks') }}</span>
            <UiCheckbox
              v-for="network of infrastructure.networks.filter(network => network.$pool === pool.id)"
              :key="network.id"
              v-model="form.scope.networks"
              :value="network.id"
              accent="brand"
            >
              {{ network.name_label }}
            </UiCheckbox>
          </div>
          <div class="group">
            <span class="typo-body-bold">{{ t('cloud:storage') }}</span>
            <UiCheckbox
              v-for="sr of infrastructure.srs.filter(sr => sr.$pool === pool.id)"
              :key="sr.id"
              v-model="form.scope.srs"
              :value="sr.id"
              accent="brand"
            >
              {{ sr.name_label }}
            </UiCheckbox>
          </div>
        </div>
      </div>
      <div class="columns">
        <div class="group">
          <span class="typo-body-bold">{{ t('offerings') }}</span>
          <span v-if="offerings.length === 0" class="typo-body-regular-small muted">{{ t('cloud:no-offering') }}</span>
          <UiCheckbox
            v-for="offering of offerings"
            :key="offering.id"
            v-model="form.scope.offerings"
            :value="offering.id"
            accent="brand"
          >
            {{ t('cloud:offering-size', { name: offering.name, cpus: offering.cpus, memory: offering.memory / GiB }) }}
          </UiCheckbox>
        </div>
        <div class="group">
          <span class="typo-body-bold">{{ t('ip-pools') }}</span>
          <span v-if="ipPools.length === 0" class="typo-body-regular-small muted">{{ t('cloud:no-ip-pool') }}</span>
          <UiCheckbox
            v-for="pool of ipPools"
            :key="pool.id"
            v-model="form.scope.ipPools"
            :value="pool.id"
            accent="brand"
          >
            {{ pool.name }}
          </UiCheckbox>
        </div>
        <div class="group">
          <span class="typo-body-bold">{{ t('cloud:backup-policies') }}</span>
          <span class="typo-body-regular-small muted">{{ t('cloud:backup-policies-description') }}</span>
          <UiCheckbox
            v-for="job of infrastructure.backupJobs"
            :key="job.id"
            v-model="form.scope.backupJobs"
            :value="job.id"
            accent="brand"
          >
            {{ job.name || job.id }}
          </UiCheckbox>
        </div>
      </div>
    </UiCard>

    <UiAlert v-if="action.error.value || loadError" accent="danger">{{ action.error.value ?? loadError }}</UiAlert>
    <div class="actions">
      <UiButton
        variant="primary"
        accent="brand"
        size="medium"
        left-icon="fa:check"
        :busy="action.isRunning.value"
        :disabled="!canSave"
        @click="save()"
      >
        {{ t('action:save') }}
      </UiButton>
      <UiButton variant="secondary" accent="brand" size="medium" @click="goBack()">{{ t('cancel') }}</UiButton>
      <UiButton
        v-if="projectId !== undefined"
        variant="tertiary"
        accent="danger"
        size="medium"
        left-icon="fa:trash"
        :busy="action.isRunning.value"
        @click="remove()"
      >
        {{ t('action:delete') }}
      </UiButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  BYTES_QUOTA_KEYS,
  cloudApi,
  EMPTY_SCOPE,
  getCloudInfrastructure,
  GiB,
  QUOTA_KEYS,
  type CloudInfrastructure,
  type CloudQuota,
  type CloudScope,
} from '@/modules/cloud/cloud.api.ts'
import CloudSelect from '@/modules/cloud/components/CloudSelect.vue'
import { useCloudAction, useCloudResource } from '@/modules/cloud/use-cloud-resource.ts'
import VtsInputWrapper from '@core/components/input-wrapper/VtsInputWrapper.vue'
import UiAlert from '@core/components/ui/alert/UiAlert.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCheckbox from '@core/components/ui/checkbox/UiCheckbox.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTitle from '@core/components/ui/title/UiTitle.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { projectId, organizationId } = defineProps<{
  /** undefined to create a project */
  projectId?: string
  organizationId?: string
}>()

const { t } = useI18n()
const router = useRouter()

const { data: organizations } = useCloudResource(cloudApi.getOrganizations, [])
const { data: offerings } = useCloudResource(cloudApi.getOfferings, [])
const { data: ipPools } = useCloudResource(cloudApi.getIpPools, [])
const { data: infrastructure } = useCloudResource<CloudInfrastructure>(getCloudInfrastructure, {
  pools: [],
  templates: [],
  networks: [],
  srs: [],
  backupJobs: [],
})
const action = useCloudAction()
const loadError = ref<string>()

const form = reactive<{
  organizationId: string | undefined
  name: string | number | undefined
  description: string | number | undefined
  quota: Record<keyof CloudQuota, string | number | undefined>
  scope: CloudScope
}>({
  organizationId,
  name: '',
  description: '',
  quota: { instances: '', vcpus: '', memory: '', storage: '', snapshots: '', ips: '' },
  scope: structuredClone(EMPTY_SCOPE),
})

watch(
  organizations,
  list => {
    if (form.organizationId === undefined && list.length !== 0) {
      form.organizationId = list[0].id
    }
  },
  { immediate: true }
)

watch(
  () => projectId,
  async id => {
    if (id === undefined) {
      return
    }
    try {
      const project = await cloudApi.getProject(id)
      form.organizationId = project.organizationId
      form.name = project.name
      form.description = project.description
      for (const key of QUOTA_KEYS) {
        const value = project.quota[key]
        form.quota[key] = value === undefined ? '' : BYTES_QUOTA_KEYS.has(key) ? value / GiB : value
      }
      form.scope = { ...structuredClone(EMPTY_SCOPE), ...project.scope }
    } catch (error) {
      loadError.value = (error as Error).message
    }
  },
  { immediate: true }
)

const selectedPools = computed(() => infrastructure.value.pools.filter(pool => form.scope.pools.includes(pool.id)))

const templatesOf = (poolId: string, isDefault: boolean) =>
  infrastructure.value.templates.filter(
    template => template.$pool === poolId && template.isDefaultTemplate === isDefault
  )

const canSave = computed(
  () => String(form.name ?? '').trim() !== '' && form.organizationId !== undefined && !action.isRunning.value
)

function getQuota(): CloudQuota {
  const quota: CloudQuota = {}
  for (const key of QUOTA_KEYS) {
    const value = form.quota[key]
    if (value !== undefined && String(value).trim() !== '') {
      quota[key] = Math.round(Number(value) * (BYTES_QUOTA_KEYS.has(key) ? GiB : 1))
    }
  }
  return quota
}

// resources of pools which are no longer selected are dropped
function getScope(): CloudScope {
  const { pools } = form.scope
  const inPools = (ids: string[], objects: { id: string; $pool: string }[]) =>
    ids.filter(id => pools.includes(objects.find(object => object.id === id)?.$pool ?? ''))
  return {
    ...form.scope,
    templates: inPools(form.scope.templates, infrastructure.value.templates),
    networks: inPools(form.scope.networks, infrastructure.value.networks),
    srs: inPools(form.scope.srs, infrastructure.value.srs),
  }
}

function goBack() {
  void router.push({ name: '/admin/cloud/organizations', query: { id: form.organizationId } })
}

async function save() {
  const body = {
    name: String(form.name).trim(),
    description: String(form.description ?? '').trim(),
    quota: getQuota(),
    scope: getScope(),
  }
  const done = await action.run(async () => {
    if (projectId === undefined) {
      await cloudApi.createProject({ ...body, organizationId: form.organizationId! })
    } else {
      await cloudApi.updateProject(projectId, body)
    }
    return true
  })
  if (done) {
    goBack()
  }
}

async function remove() {
  const done = await action.run(async () => {
    await cloudApi.deleteProject(projectId!)
    return true
  })
  if (done) {
    goBack()
  }
}
</script>

<style lang="postcss" scoped>
.cloud-project-form {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.8rem;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1.6rem;
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
  gap: 1.6rem;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.pool {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-block: 1.2rem;
  border-block-start: 0.1rem solid var(--color-neutral-border);
}

.actions {
  display: flex;
  gap: 0.8rem;
}

.muted {
  color: var(--color-neutral-txt-secondary);
}
</style>
