<template>
  <PageHeader title="Members" icon="object:organization" />
  <PageContent>
    <div class="columns">
      <UiCard>
        <UiCardTitle>
          {{ store.project.name }}
          <template #info>{{ rows.length }}</template>
          <template #description>
            Roles give access to this project only. Organization admins manage every project.
          </template>
        </UiCardTitle>
        <VtsTable :state="rows.length === 0 ? { type: 'no-data', message: 'No member yet' } : undefined">
          <thead>
            <tr>
              <VtsHeaderCell>Member</VtsHeaderCell>
              <VtsHeaderCell>Role</VtsHeaderCell>
              <VtsHeaderCell v-if="store.canManageProject">Actions</VtsHeaderCell>
            </tr>
          </thead>
          <tbody>
            <VtsRow v-for="row of rows" :key="row.userId">
              <VtsTextCell>
                {{ row.name }}
                <span v-if="row.userId === store.currentUser.id" class="muted">(you)</span>
              </VtsTextCell>
              <UiTableCell>
                <UiTag v-if="row.inherited" accent="info" variant="secondary">Admin, as organization admin</UiTag>
                <NativeSelect
                  v-else-if="store.canManageProject"
                  :id="`role-${row.userId}`"
                  :model-value="row.role"
                  @update:model-value="role => store.setProjectMember(row.userId, role as ProjectRole)"
                >
                  <option v-for="(label, role) of PROJECT_ROLES" :key="role" :value="role">{{ label }}</option>
                </NativeSelect>
                <UiTag v-else accent="neutral" variant="secondary">{{ PROJECT_ROLES[row.role] }}</UiTag>
              </UiTableCell>
              <UiTableCell v-if="store.canManageProject">
                <UiButton
                  v-if="!row.inherited"
                  variant="tertiary"
                  accent="danger"
                  size="small"
                  left-icon="fa:trash"
                  @click="store.setProjectMember(row.userId, null)"
                >
                  Remove
                </UiButton>
              </UiTableCell>
            </VtsRow>
          </tbody>
        </VtsTable>

        <div v-if="store.canManageProject" class="inline-form">
          <FormField label="Add a member of the organization" for="add-member">
            <NativeSelect id="add-member" v-model="newMemberId" :disabled="candidates.length === 0">
              <option v-if="candidates.length === 0" :value="undefined">Everyone is already in the project</option>
              <option v-for="member of candidates" :key="member.userId" :value="member.userId">
                {{ member.name }}
              </option>
            </NativeSelect>
          </FormField>
          <FormField label="Role" for="add-member-role">
            <NativeSelect id="add-member-role" v-model="newMemberRole">
              <option v-for="(label, role) of PROJECT_ROLES" :key="role" :value="role">{{ label }}</option>
            </NativeSelect>
          </FormField>
          <UiButton
            variant="secondary"
            accent="brand"
            size="medium"
            left-icon="fa:plus"
            :disabled="newMemberId === undefined"
            @click="addMember()"
          >
            Add
          </UiButton>
        </div>
      </UiCard>

      <UiCard>
        <UiCardTitle>Roles</UiCardTitle>
        <dl class="roles typo-body-regular">
          <template v-for="(description, role) of ROLE_DESCRIPTIONS" :key="role">
            <dt class="typo-body-bold">{{ PROJECT_ROLES[role] }}</dt>
            <dd>{{ description }}</dd>
          </template>
        </dl>
        <UiInfo accent="info" wrap>
          Roles are enforced by Xen Orchestra on every API call, including Terraform and the CLI. Nobody in the
          organization can create custom permissions.
        </UiInfo>
      </UiCard>
    </div>

    <UiCard>
      <UiCardTitle>
        {{ store.organization.name }}
        <template #info>{{ store.organizationMembers.length }}</template>
        <template #description>
          Members of the organization can be added to its projects. Organization admins manage members and every
          project. Removing an account created here deletes it.
        </template>
      </UiCardTitle>
      <UiAlert v-if="resetResult" accent="success" close @close="resetResult = undefined">
        New password of {{ resetResult.name }}: <code>{{ resetResult.password }}</code
        >. Share it with them, it is shown only once.
      </UiAlert>
      <VtsTable>
        <thead>
          <tr>
            <VtsHeaderCell>Member</VtsHeaderCell>
            <VtsHeaderCell>Organization role</VtsHeaderCell>
            <VtsHeaderCell v-if="store.canManageOrganization">Actions</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="member of store.organizationMembers" :key="member.userId">
            <VtsTextCell>
              {{ member.name }}
              <span v-if="member.userId === store.currentUser.id" class="muted">(you)</span>
            </VtsTextCell>
            <UiTableCell>
              <NativeSelect
                v-if="store.canManageOrganization && member.userId !== store.currentUser.id"
                :id="`org-role-${member.userId}`"
                :model-value="member.role"
                @update:model-value="role => store.setOrganizationMember(member.userId, role as OrganizationRole)"
              >
                <option v-for="(label, role) of ORGANIZATION_ROLES" :key="role" :value="role">{{ label }}</option>
              </NativeSelect>
              <UiTag v-else :accent="member.role === 'admin' ? 'info' : 'neutral'" variant="secondary">
                {{ ORGANIZATION_ROLES[member.role] }}
              </UiTag>
            </UiTableCell>
            <UiTableCell v-if="store.canManageOrganization">
              <div v-if="member.userId !== store.currentUser.id" class="actions">
                <UiButton
                  variant="tertiary"
                  accent="brand"
                  size="small"
                  left-icon="fa:lock"
                  @click="resetPassword(member.userId, member.name)"
                >
                  Reset password
                </UiButton>
                <UiButton
                  variant="tertiary"
                  accent="danger"
                  size="small"
                  left-icon="fa:trash"
                  @click="store.setOrganizationMember(member.userId, null)"
                >
                  Remove from organization
                </UiButton>
              </div>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>

      <template v-if="store.canManageOrganization">
        <UiCardTitle>
          Create an account
          <template #description>
            The account can only reach this organization. The prototype has no invitation email: share the temporary
            password with the person.
          </template>
        </UiCardTitle>
        <div class="inline-form">
          <FormField label="Email" for="new-user-name">
            <UiInput id="new-user-name" v-model="newUserName" accent="brand" />
          </FormField>
          <FormField label="Temporary password" for="new-user-password">
            <UiInput id="new-user-password" v-model="newUserPassword" accent="brand" type="password" />
          </FormField>
          <FormField label="Organization role" for="new-user-org-role">
            <NativeSelect id="new-user-org-role" v-model="newUserOrganizationRole">
              <option v-for="(label, role) of ORGANIZATION_ROLES" :key="role" :value="role">{{ label }}</option>
            </NativeSelect>
          </FormField>
          <FormField :label="`Role in ${store.project.name}`" for="new-user-project-role">
            <NativeSelect id="new-user-project-role" v-model="newUserProjectRole">
              <option value="">None</option>
              <option v-for="(label, role) of PROJECT_ROLES" :key="role" :value="role">{{ label }}</option>
            </NativeSelect>
          </FormField>
          <UiButton
            variant="secondary"
            accent="brand"
            size="medium"
            left-icon="fa:plus"
            :busy="creatingUser"
            :disabled="!canCreateUser"
            @click="createUser()"
          >
            Create account
          </UiButton>
        </div>
      </template>
    </UiCard>
  </PageContent>
</template>

<script lang="ts" setup>
import FormField from '@/components/FormField.vue'
import NativeSelect from '@/components/NativeSelect.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import type { OrganizationRole, ProjectRole } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiAlert from '@core/components/ui/alert/UiAlert.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import UiTag from '@core/components/ui/tag/UiTag.vue'
import { computed, ref, watch } from 'vue'

const store = usePortalStore()

const PROJECT_ROLES: Record<ProjectRole, string> = {
  viewer: 'Viewer',
  member: 'Member',
  admin: 'Admin',
}

const ORGANIZATION_ROLES: Record<OrganizationRole, string> = {
  member: 'Member',
  admin: 'Organization admin',
}

const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  viewer: 'Sees the instances, snapshots and usage of the project.',
  member: 'Also creates instances within the quota, starts and stops them, takes and reverts snapshots.',
  admin: 'Also deletes instances and snapshots, and manages the members of the project.',
}

// Organization admins are admins of every project without being direct members
const rows = computed(() => {
  const direct = store.projectMembers.map(member => ({ ...member, inherited: false }))
  const inherited = store.organizationMembers
    .filter(member => member.role === 'admin' && !direct.some(row => row.userId === member.userId))
    .map(member => ({ userId: member.userId, name: member.name, role: 'admin' as const, inherited: true }))
  return [...inherited, ...direct]
})

const candidates = computed(() =>
  store.organizationMembers.filter(member => !rows.value.some(row => row.userId === member.userId))
)

const newMemberId = ref<string | undefined>()
const newMemberRole = ref<ProjectRole>('member')

watch(
  candidates,
  members => {
    if (!members.some(member => member.userId === newMemberId.value)) {
      newMemberId.value = members[0]?.userId
    }
  },
  { immediate: true }
)

async function addMember() {
  await store.setProjectMember(newMemberId.value!, newMemberRole.value)
}

const resetResult = ref<{ name: string; password: string }>()

async function resetPassword(userId: string, name: string) {
  const password = await store.resetMemberPassword(userId)
  if (password !== undefined) {
    resetResult.value = { name, password }
  }
}

const newUserName = ref<string | number | undefined>('')
const newUserPassword = ref<string | number | undefined>('')
const newUserOrganizationRole = ref<OrganizationRole>('member')
const newUserProjectRole = ref<ProjectRole | ''>('member')
const creatingUser = ref(false)

const canCreateUser = computed(
  () =>
    /^[^\s@]+@[^\s@]+$/.test(String(newUserName.value ?? '')) &&
    String(newUserPassword.value ?? '').length >= 8 &&
    !creatingUser.value
)

async function createUser() {
  creatingUser.value = true
  try {
    const created = await store.createUser({
      name: String(newUserName.value),
      password: String(newUserPassword.value),
      organizationRole: newUserOrganizationRole.value,
      projectRole: newUserProjectRole.value === '' ? undefined : newUserProjectRole.value,
    })
    if (created) {
      newUserName.value = ''
      newUserPassword.value = ''
    }
  } finally {
    creatingUser.value = false
  }
}
</script>

<style lang="postcss" scoped>
.columns {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1.6rem;
  align-items: start;
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

.roles {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--color-neutral-txt-primary);

  dd {
    margin-block-end: 0.8rem;
    color: var(--color-neutral-txt-secondary);
  }
}

.muted {
  color: var(--color-neutral-txt-secondary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

@media (max-width: 1024px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
</style>
