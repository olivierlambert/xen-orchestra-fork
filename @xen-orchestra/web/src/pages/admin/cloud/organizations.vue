<template>
  <div class="cloud-organizations">
    <div class="list">
      <UiCard>
        <UiTitle>
          {{ t('organizations') }}
          <template #action>
            <UiButton variant="tertiary" accent="brand" size="small" left-icon="fa:rotate-left" @click="reloadAll()">
              {{ t('cloud:refresh') }}
            </UiButton>
          </template>
        </UiTitle>
        <UiInfo accent="info" wrap>{{ t('cloud:organizations-description') }}</UiInfo>
        <UiAlert v-if="error" accent="danger">{{ error }}</UiAlert>
        <VtsTable
          :state="organizations.length === 0 ? { type: 'no-data', message: t('cloud:no-organization') } : undefined"
        >
          <thead>
            <tr>
              <VtsHeaderCell>{{ t('name') }}</VtsHeaderCell>
              <VtsHeaderCell>{{ t('cloud:projects') }}</VtsHeaderCell>
              <VtsHeaderCell>{{ t('cloud:members') }}</VtsHeaderCell>
              <VtsHeaderCell>{{ t('status') }}</VtsHeaderCell>
            </tr>
          </thead>
          <tbody>
            <VtsRow
              v-for="organization of organizations"
              :key="organization.id"
              :selected="selectedId === organization.id"
              class="row"
              @click="selectedId = organization.id"
            >
              <VtsTextCell>{{ organization.name }}</VtsTextCell>
              <VtsTextCell>{{ projectsOf(organization.id).length }}</VtsTextCell>
              <VtsTextCell>{{ Object.keys(organization.members).length }}</VtsTextCell>
              <UiTableCell>
                <UiTag v-if="organization.suspended" accent="danger" variant="secondary">
                  {{ t('cloud:suspended') }}
                </UiTag>
                <UiTag v-else accent="success" variant="secondary">{{ t('cloud:active') }}</UiTag>
              </UiTableCell>
            </VtsRow>
          </tbody>
        </VtsTable>
        <div class="inline-form">
          <VtsInputWrapper :label="t('cloud:new-organization')">
            <UiInput v-model="newName" accent="brand" />
          </VtsInputWrapper>
          <UiButton
            variant="secondary"
            accent="brand"
            size="medium"
            left-icon="fa:plus"
            :disabled="String(newName ?? '').trim() === '' || action.isRunning.value"
            @click="createOrganization()"
          >
            {{ t('action:create') }}
          </UiButton>
        </div>
      </UiCard>
    </div>

    <div v-if="selected" class="detail">
      <UiCard>
        <UiTitle>
          {{ selected.name }}
          <template #action>
            <UiTag v-if="selected.suspended" accent="danger" variant="secondary">{{ t('cloud:suspended') }}</UiTag>
          </template>
        </UiTitle>
        <UiAlert v-if="action.error.value" accent="danger" close @close="action.error.value = undefined">
          {{ action.error.value }}
        </UiAlert>
        <template v-if="selected.suspended">
          <UiInfo accent="warning" wrap>
            {{
              t(selected.suspended.reason ? 'cloud:suspended-since-reason' : 'cloud:suspended-since', {
                date: new Date(selected.suspended.at).toLocaleString(),
                reason: selected.suspended.reason,
              })
            }}
          </UiInfo>
          <div>
            <UiButton
              variant="secondary"
              accent="brand"
              size="medium"
              left-icon="fa:play"
              :busy="action.isRunning.value"
              @click="resume()"
            >
              {{ t('cloud:resume') }}
            </UiButton>
          </div>
        </template>
        <div v-else class="inline-form">
          <VtsInputWrapper :label="t('cloud:suspension-reason')">
            <UiInput v-model="suspensionReason" accent="brand" />
          </VtsInputWrapper>
          <UiButton
            variant="secondary"
            accent="warning"
            size="medium"
            left-icon="fa:pause"
            :busy="action.isRunning.value"
            @click="suspend()"
          >
            {{ t('cloud:suspend') }}
          </UiButton>
        </div>
        <UiInfo accent="info" wrap>{{ t('cloud:suspend-description') }}</UiInfo>
      </UiCard>

      <UiCard>
        <UiTitle>
          {{ t('cloud:projects') }}
          <template #action>
            <UiButton
              variant="secondary"
              accent="brand"
              size="small"
              left-icon="fa:plus"
              @click="router.push({ name: '/admin/cloud-project/new', query: { organization: selected.id } })"
            >
              {{ t('cloud:new-project') }}
            </UiButton>
          </template>
        </UiTitle>
        <VtsStateHero v-if="selectedProjects.length === 0" format="card" type="no-data" size="small">
          {{ t('cloud:no-project') }}
        </VtsStateHero>
        <div v-for="project of selectedProjects" :key="project.id" class="project">
          <div class="project-header">
            <span class="typo-body-bold">{{ project.name }}</span>
            <UiButton
              variant="tertiary"
              accent="brand"
              size="small"
              left-icon="fa:pencil"
              @click="router.push({ name: '/admin/cloud-project/[id]', params: { id: project.id } })"
            >
              {{ t('action:edit') }}
            </UiButton>
          </div>
          <span v-if="project.description" class="typo-body-regular-small muted">{{ project.description }}</span>
          <template v-if="details[project.id]">
            <VtsProgressBar
              v-for="item of quotaItems(details[project.id])"
              :key="item.key"
              :label="item.label"
              :current="item.current"
              :total="item.total"
              legend-type="value-with-total"
              no-ruler
            />
            <span v-if="unlimitedItems(details[project.id]).length !== 0" class="typo-body-regular-small muted">
              {{
                t('cloud:no-limit-items', {
                  items: unlimitedItems(details[project.id])
                    .map(item => `${item.label} (${item.current})`)
                    .join(', '),
                })
              }}
            </span>
          </template>
        </div>
      </UiCard>

      <UiCard>
        <UiTitle>{{ t('cloud:members') }}</UiTitle>
        <VtsTable :state="members.length === 0 ? { type: 'no-data', message: t('cloud:no-member') } : undefined">
          <thead>
            <tr>
              <VtsHeaderCell>{{ t('email') }}</VtsHeaderCell>
              <VtsHeaderCell>{{ t('cloud:organization-role') }}</VtsHeaderCell>
            </tr>
          </thead>
          <tbody>
            <VtsRow v-for="member of members" :key="member.userId">
              <VtsTextCell>{{ member.name }}</VtsTextCell>
              <VtsTextCell>{{ t(`cloud:organization-role-${member.role}`) }}</VtsTextCell>
            </VtsRow>
          </tbody>
        </VtsTable>
        <span class="typo-body-bold">{{ t('cloud:create-account') }}</span>
        <div class="inline-form">
          <VtsInputWrapper :label="t('email')">
            <UiInput v-model="account.name" accent="brand" />
          </VtsInputWrapper>
          <VtsInputWrapper :label="t('password')">
            <UiInput v-model="account.password" accent="brand" type="password" />
          </VtsInputWrapper>
          <VtsInputWrapper :label="t('cloud:organization-role')">
            <CloudSelect v-model="account.role">
              <option value="admin">{{ t('cloud:organization-role-admin') }}</option>
              <option value="member">{{ t('cloud:organization-role-member') }}</option>
            </CloudSelect>
          </VtsInputWrapper>
          <UiButton
            variant="secondary"
            accent="brand"
            size="medium"
            left-icon="fa:plus"
            :disabled="!canCreateAccount"
            @click="createAccount()"
          >
            {{ t('action:create') }}
          </UiButton>
        </div>
      </UiCard>

      <UiCard>
        <div>
          <UiButton
            variant="secondary"
            accent="danger"
            size="medium"
            left-icon="fa:trash"
            :busy="action.isRunning.value"
            @click="deleteOrganization()"
          >
            {{ t('cloud:delete-organization') }}
          </UiButton>
        </div>
        <UiInfo accent="info" wrap>{{ t('cloud:delete-organization-description') }}</UiInfo>
      </UiCard>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  BYTES_QUOTA_KEYS,
  cloudApi,
  GiB,
  QUOTA_KEYS,
  type CloudMember,
  type CloudOrganizationRole,
  type CloudProjectDetails,
} from '@/modules/cloud/cloud.api.ts'
import CloudSelect from '@/modules/cloud/components/CloudSelect.vue'
import { useCloudAction, useCloudResource } from '@/modules/cloud/use-cloud-resource.ts'
import VtsInputWrapper from '@core/components/input-wrapper/VtsInputWrapper.vue'
import VtsProgressBar from '@core/components/progress-bar/VtsProgressBar.vue'
import VtsStateHero from '@core/components/state-hero/VtsStateHero.vue'
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
import UiTag from '@core/components/ui/tag/UiTag.vue'
import UiTitle from '@core/components/ui/title/UiTitle.vue'
import { useRouteQuery } from '@core/composables/route-query.composable.ts'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()

const { data: organizations, error, reload } = useCloudResource(cloudApi.getOrganizations, [])
const { data: projects, reload: reloadProjects } = useCloudResource(cloudApi.getProjects, [])
const action = useCloudAction()

const selectedId = useRouteQuery<string>('id')
const selected = computed(() => organizations.value.find(organization => organization.id === selectedId.value))

const projectsOf = (organizationId: string) =>
  projects.value.filter(project => project.organizationId === organizationId)
const selectedProjects = computed(() => (selected.value === undefined ? [] : projectsOf(selected.value.id)))

const details = ref<Record<string, CloudProjectDetails>>({})
const members = ref<CloudMember[]>([])

async function loadSelected() {
  const organization = selected.value
  if (organization === undefined) {
    return
  }
  members.value = (await action.run(() => cloudApi.getMembers(organization.id))) ?? []
  const loaded = await Promise.all(selectedProjects.value.map(project => cloudApi.getProject(project.id)))
  details.value = Object.fromEntries(loaded.map(project => [project.id, project]))
}

watch([selected, selectedProjects], loadSelected, { immediate: true })

async function reloadAll() {
  await Promise.all([reload(), reloadProjects()])
  await loadSelected()
}

type QuotaItem = { key: string; label: string; current: number; total: number }

function allQuotaItems(project: CloudProjectDetails): QuotaItem[] {
  return QUOTA_KEYS.map(key => {
    const scale = BYTES_QUOTA_KEYS.has(key) ? GiB : 1
    const limit = project.quota[key]
    return {
      key,
      label: t(`cloud:quota-${key}`),
      current: Math.round((project.usage[key] ?? 0) / scale),
      total: limit === undefined ? Infinity : Math.round(limit / scale),
    }
  })
}

const quotaItems = (project: CloudProjectDetails) => allQuotaItems(project).filter(item => Number.isFinite(item.total))
const unlimitedItems = (project: CloudProjectDetails) =>
  allQuotaItems(project).filter(item => !Number.isFinite(item.total))

const newName = ref<string | number | undefined>('')

async function createOrganization() {
  const created = await action.run(() => cloudApi.createOrganization(String(newName.value).trim()))
  if (created !== undefined) {
    newName.value = ''
    await reload()
    selectedId.value = created.id
  }
}

const suspensionReason = ref<string | number | undefined>('')

async function suspend() {
  const organization = selected.value!
  await action.run(() => cloudApi.suspend(organization.id, String(suspensionReason.value ?? '')))
  suspensionReason.value = ''
  await reload()
}

async function resume() {
  const organization = selected.value!
  await action.run(() => cloudApi.resume(organization.id))
  await reload()
}

async function deleteOrganization() {
  const organization = selected.value!
  const done = await action.run(async () => {
    await cloudApi.deleteOrganization(organization.id)
    return true
  })
  if (done) {
    selectedId.value = ''
    await reload()
  }
}

const account = reactive<{
  name: string | number | undefined
  password: string | number | undefined
  role: CloudOrganizationRole
}>({ name: '', password: '', role: 'admin' })

const canCreateAccount = computed(
  () =>
    /^[^\s@]+@[^\s@]+$/.test(String(account.name ?? '')) &&
    String(account.password ?? '').length >= 8 &&
    !action.isRunning.value
)

async function createAccount() {
  const organization = selected.value!
  const created = await action.run(() =>
    cloudApi.createUser(organization.id, {
      name: String(account.name),
      password: String(account.password),
      role: account.role,
    })
  )
  if (created !== undefined) {
    account.name = ''
    account.password = ''
    await reload()
    await loadSelected()
  }
}
</script>

<style lang="postcss" scoped>
.cloud-organizations {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.8rem;
  padding: 0.8rem;
  align-items: start;
}

.list,
.detail {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.row {
  cursor: pointer;
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1.2rem;

  > * {
    min-width: 16rem;
  }
}

.project {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-block-end: 1.6rem;
  border-block-end: 0.1rem solid var(--color-neutral-border);

  &:last-child {
    border: none;
  }
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.muted {
  color: var(--color-neutral-txt-secondary);
}

@media (max-width: 1024px) {
  .cloud-organizations {
    grid-template-columns: 1fr;
  }
}
</style>
