<template>
  <PageHeader
    title="Members"
    :subtitle="`Who can work in ${store.project.name}, and the people of ${store.organization.name}`"
  >
    <template #actions>
      <UiButton
        v-if="store.canManageProject || store.canManageOrganization"
        variant="primary"
        accent="brand"
        size="medium"
        left-icon="fa:plus"
        @click="openAdd()"
      >
        Add people
      </UiButton>
    </template>
  </PageHeader>
  <PageContent>
    <div class="layout">
      <div class="main">
        <PPanel
          :title="store.project.name"
          :count="rows.length"
          description="Roles give access to this project only."
          flush
        >
          <ul class="p-list">
            <li v-for="row of rows" :key="row.userId" class="person">
              <Avatar :name="row.name" />
              <span class="who">
                <span class="typo-body-bold-small">
                  {{ displayName(row.name) }}
                  <span v-if="row.userId === store.currentUser.id" class="you">you</span>
                </span>
                <span class="p-caption p-muted">{{ row.name }}</span>
              </span>
              <span
                v-if="row.inherited"
                class="role-pill inherited typo-body-regular-small"
                title="Organization admins are admins of every project"
              >
                <PIcon :icon="faBuildingShield" size="small" /> Admin (via organization)
              </span>
              <PMenu v-else-if="store.canManageProject" align="end">
                <template #trigger>
                  <button type="button" class="role-pill typo-body-regular-small">
                    {{ PROJECT_ROLES[row.role].label }} <PIcon :icon="faChevronDown" size="small" />
                  </button>
                </template>
                <PMenuItem
                  v-for="(role, id) of PROJECT_ROLES"
                  :key="id"
                  :icon="role.icon"
                  :active="row.role === id"
                  @click="setRole(row.userId, row.name, id)"
                >
                  <span class="role-option">
                    <span>{{ role.label }}</span>
                    <span class="p-caption p-muted">{{ role.description }}</span>
                  </span>
                </PMenuItem>
                <div class="menu-sep" />
                <PMenuItem :icon="faUserMinus" danger @click="setRole(row.userId, row.name, null)">
                  Remove from {{ store.project.name }}
                </PMenuItem>
              </PMenu>
              <span v-else class="role-pill static typo-body-regular-small">{{ PROJECT_ROLES[row.role].label }}</span>
            </li>
          </ul>
        </PPanel>

        <PPanel
          :title="store.organization.name"
          :count="store.organizationMembers.length"
          description="Organization admins manage the people and every project."
          flush
        >
          <ul class="p-list">
            <li v-for="member of organizationMembers" :key="member.userId" class="person">
              <Avatar :name="member.name" />
              <span class="who">
                <span class="typo-body-bold-small">
                  {{ displayName(member.name) }}
                  <span v-if="member.userId === store.currentUser.id" class="you">you</span>
                </span>
                <span class="p-caption p-muted">{{ member.name }}</span>
              </span>
              <span v-if="member.role === 'admin'" class="role-pill static admin typo-body-regular-small"
                >Organization admin</span
              >
              <PMenu v-if="store.canManageOrganization && member.userId !== store.currentUser.id" align="end">
                <template #trigger>
                  <button type="button" class="kebab" :aria-label="`Actions for ${member.name}`">
                    <PIcon :icon="faEllipsis" />
                  </button>
                </template>
                <PMenuItem
                  :icon="faBuildingShield"
                  @click="store.setOrganizationMember(member.userId, member.role === 'admin' ? 'member' : 'admin')"
                >
                  {{ member.role === 'admin' ? 'Make member' : 'Make organization admin' }}
                </PMenuItem>
                <PMenuItem :icon="faKey" @click="resetPassword(member.userId, member.name)">Reset password</PMenuItem>
                <div class="menu-sep" />
                <PMenuItem :icon="faUserMinus" danger @click="removeTarget = member">
                  Remove from {{ store.organization.name }}
                </PMenuItem>
              </PMenu>
              <span v-else class="kebab-placeholder" />
            </li>
          </ul>
        </PPanel>
      </div>

      <aside class="roles">
        <span class="p-eyebrow">Project roles</span>
        <div v-for="(role, id) of PROJECT_ROLES" :key="id" class="role-card">
          <span class="role-icon" :class="id"><PIcon :icon="role.icon" /></span>
          <span class="role-text">
            <span class="typo-body-bold-small">{{ role.label }}</span>
            <span class="typo-body-regular-small p-muted">{{ role.description }}</span>
          </span>
        </div>
        <p class="typo-body-regular-small p-muted note">
          <PIcon :icon="faLock" size="small" />
          Enforced on every request, from this portal as well as the API and Terraform.
        </p>
      </aside>
    </div>

    <!-- add people -->
    <PModal
      :open="addOpen"
      title="Add people"
      :icon="faUserPlus"
      :description="`Give access to ${store.project.name}.`"
      @close="addOpen = false"
    >
      <div class="segments">
        <button
          type="button"
          class="segment typo-body-regular-small"
          :class="{ active: addMode === 'existing' }"
          :disabled="candidates.length === 0"
          @click="addMode = 'existing'"
        >
          From {{ store.organization.name }}
        </button>
        <button
          v-if="store.canManageOrganization"
          type="button"
          class="segment typo-body-regular-small"
          :class="{ active: addMode === 'new' }"
          @click="addMode = 'new'"
        >
          New account
        </button>
      </div>

      <template v-if="addMode === 'existing'">
        <label class="field">
          <span class="typo-body-bold-small">Person</span>
          <select v-model="newMemberId" class="select typo-body-regular">
            <option v-for="member of candidates" :key="member.userId" :value="member.userId">
              {{ displayName(member.name) }} ({{ member.name }})
            </option>
          </select>
        </label>
      </template>
      <template v-else>
        <label class="field">
          <span class="typo-body-bold-small">Email</span>
          <UiInput v-model="newUserName" accent="brand" placeholder="name@company.example" />
        </label>
        <label class="field">
          <span class="typo-body-bold-small">Temporary password</span>
          <span class="password">
            <CopyValue :value="newUserPassword" mono block />
            <button type="button" class="regen" title="Generate another" @click="newUserPassword = generatePassword()">
              <PIcon :icon="faRotate" />
            </button>
          </span>
          <span class="typo-body-regular-small p-muted"
            >Share it with the person: they change it from their account.</span
          >
        </label>
        <label class="toggle typo-body-regular-small">
          <input v-model="newUserIsAdmin" type="checkbox" />
          Organization admin (manages people and every project)
        </label>
      </template>

      <div v-if="!(addMode === 'new' && newUserIsAdmin)" class="field">
        <span class="typo-body-bold-small">Role in {{ store.project.name }}</span>
        <div class="role-choices">
          <button
            v-for="(role, id) of PROJECT_ROLES"
            :key="id"
            type="button"
            class="role-choice"
            :class="{ selected: newMemberRole === id }"
            @click="newMemberRole = id"
          >
            <span class="role-icon" :class="id"><PIcon :icon="role.icon" /></span>
            <span class="typo-body-bold-small">{{ role.label }}</span>
          </button>
        </div>
        <span class="typo-body-regular-small p-muted">{{ PROJECT_ROLES[newMemberRole].description }}</span>
      </div>

      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="addOpen = false">Cancel</UiButton>
        <UiButton variant="primary" accent="brand" size="medium" :busy="adding" :disabled="!canAdd" @click="add()">
          {{ addMode === 'new' ? 'Create account' : 'Add to project' }}
        </UiButton>
      </template>
    </PModal>

    <PModal
      :open="resetResult !== undefined"
      title="Password reset"
      :icon="faKey"
      :description="`Share this temporary password with ${resetResult ? displayName(resetResult.name) : ''}. Their sessions and API keys were revoked.`"
      @close="resetResult = undefined"
    >
      <CopyValue v-if="resetResult" :value="resetResult.password" mono block />
      <template #footer>
        <UiButton variant="primary" accent="brand" size="medium" @click="resetResult = undefined">Done</UiButton>
      </template>
    </PModal>

    <PModal
      :open="removeTarget !== undefined"
      danger
      title="Remove from the organization?"
      :icon="faUserMinus"
      @close="removeTarget = undefined"
    >
      <p class="typo-body-regular">
        <strong>{{ removeTarget ? displayName(removeTarget.name) : '' }}</strong> loses access to every project of
        {{ store.organization.name }}, and their account is deleted.
      </p>
      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="removeTarget = undefined">Cancel</UiButton>
        <UiButton variant="primary" accent="danger" size="medium" @click="remove()">Remove</UiButton>
      </template>
    </PModal>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import Avatar from '@/components/ui/Avatar.vue'
import CopyValue from '@/components/ui/CopyValue.vue'
import PIcon from '@/components/ui/PIcon.vue'
import PMenu from '@/components/ui/PMenu.vue'
import PMenuItem from '@/components/ui/PMenuItem.vue'
import PModal from '@/components/ui/PModal.vue'
import PPanel from '@/components/ui/PPanel.vue'
import type { OrganizationMember, ProjectRole } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import { displayName } from '@/utils/people.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import {
  faBuildingShield,
  faChevronDown,
  faEllipsis,
  faEye,
  faKey,
  faLock,
  faRotate,
  faScrewdriverWrench,
  faUserGear,
  faUserMinus,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons'
import { computed, ref } from 'vue'

const store = usePortalStore()
const toasts = useToasts()

const PROJECT_ROLES: Record<ProjectRole, { label: string; description: string; icon: IconDefinition }> = {
  viewer: { label: 'Viewer', description: 'Sees instances, snapshots and costs.', icon: faEye },
  member: {
    label: 'Member',
    description: 'Creates and operates instances within the quota, takes snapshots.',
    icon: faScrewdriverWrench,
  },
  admin: {
    label: 'Admin',
    description: 'Also deletes instances and manages the members of the project.',
    icon: faUserGear,
  },
}

// organization admins are admins of every project without being direct members
const byName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => displayName(a.name).localeCompare(displayName(b.name)))
const organizationMembers = computed(() => byName(store.organizationMembers))

const rows = computed(() => {
  const direct = store.projectMembers.map(member => ({ ...member, inherited: false }))
  const inherited = store.organizationMembers
    .filter(member => member.role === 'admin' && !direct.some(row => row.userId === member.userId))
    .map(member => ({ userId: member.userId, name: member.name, role: 'admin' as const, inherited: true }))
  return [...inherited, ...byName(direct)]
})

const candidates = computed(() =>
  store.organizationMembers.filter(member => !rows.value.some(row => row.userId === member.userId))
)

async function setRole(userId: string, name: string, role: ProjectRole | null) {
  await store.setProjectMember(userId, role)
  toasts.success(
    role === null
      ? `${displayName(name)} removed from ${store.project.name}`
      : `${displayName(name)} is now ${PROJECT_ROLES[role].label.toLowerCase()}`
  )
}

// add people

const addOpen = ref(false)
const addMode = ref<'existing' | 'new'>('existing')
const adding = ref(false)
const newMemberId = ref<string>()
const newMemberRole = ref<ProjectRole>('member')
const newUserName = ref<string | number | undefined>('')
const newUserPassword = ref(generatePassword())
const newUserIsAdmin = ref(false)

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const values = crypto.getRandomValues(new Uint32Array(16))
  return Array.from(values, value => alphabet[value % alphabet.length])
    .join('')
    .replace(/(.{4})(?!$)/g, '$1-')
}

function openAdd() {
  addMode.value = candidates.value.length !== 0 || !store.canManageOrganization ? 'existing' : 'new'
  newMemberId.value = candidates.value[0]?.userId
  newMemberRole.value = 'member'
  newUserName.value = ''
  newUserPassword.value = generatePassword()
  newUserIsAdmin.value = false
  addOpen.value = true
}

const canAdd = computed(() =>
  addMode.value === 'existing'
    ? newMemberId.value !== undefined
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newUserName.value ?? ''))
)

async function add() {
  adding.value = true
  try {
    if (addMode.value === 'existing') {
      const member = candidates.value.find(item => item.userId === newMemberId.value)!
      await store.setProjectMember(member.userId, newMemberRole.value)
      toasts.success(
        `${displayName(member.name)} added`,
        `${PROJECT_ROLES[newMemberRole.value].label} of ${store.project.name}`
      )
      addOpen.value = false
    } else {
      const name = String(newUserName.value)
      const created = await store.createUser({
        name,
        password: newUserPassword.value,
        organizationRole: newUserIsAdmin.value ? 'admin' : 'member',
        projectRole: newUserIsAdmin.value ? undefined : newMemberRole.value,
      })
      if (created) {
        toasts.success(`Account created for ${displayName(name)}`, 'Share the temporary password with them.')
        addOpen.value = false
      }
    }
  } finally {
    adding.value = false
  }
}

// organization

const resetResult = ref<{ name: string; password: string }>()
async function resetPassword(userId: string, name: string) {
  const password = await store.resetMemberPassword(userId)
  if (password !== undefined) {
    resetResult.value = { name, password }
  }
}

const removeTarget = ref<OrganizationMember>()
async function remove() {
  const member = removeTarget.value!
  removeTarget.value = undefined
  await store.setOrganizationMember(member.userId, null)
  toasts.success(`${displayName(member.name)} removed from ${store.organization.name}`)
}
</script>

<style lang="postcss" scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32rem;
  gap: var(--p-gap);
  align-items: start;
}

.main {
  display: flex;
  flex-direction: column;
  gap: var(--p-gap);
  min-width: 0;
}

.person {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem 2.4rem;
}

.who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  color: var(--p-text);

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.you {
  margin-inline-start: 0.6rem;
  padding: 0 0.6rem;
  border-radius: 99rem;
  background-color: var(--p-subtle);
  color: var(--p-muted);
  font-size: 1.1rem;
  font-weight: 500;
}

.role-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1.2rem;
  border: var(--p-border);
  border-radius: 99rem;
  background-color: var(--p-surface);
  color: var(--p-text);
  white-space: nowrap;
  cursor: pointer;

  &:hover:not(.static, .inherited) {
    border-color: var(--color-brand-item-base);
  }

  &.static,
  &.inherited {
    cursor: default;
  }

  &.inherited,
  &.admin {
    border-color: transparent;
    background-color: var(--p-brand-soft);
    color: var(--color-brand-txt-base);
  }
}

.role-option {
  display: flex;
  flex-direction: column;
  white-space: normal;
  max-width: 28rem;
}

.menu-sep {
  height: 0.1rem;
  margin: 0.4rem 0;
  background-color: var(--color-neutral-border);
}

.kebab,
.kebab-placeholder {
  display: flex;
  flex-shrink: 0;
  width: 3.2rem;
  height: 3.2rem;
}

.kebab {
  align-items: center;
  justify-content: center;
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

.roles {
  position: sticky;
  top: 2.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.role-card {
  display: flex;
  gap: 1.2rem;
  padding: 1.4rem 1.6rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
}

.role-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.role-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: var(--p-radius-m);
  flex-shrink: 0;
  background-color: var(--p-subtle);
  color: var(--p-muted);

  &.member {
    background-color: color-mix(in srgb, var(--p-chart-2) 14%, var(--p-surface));
    color: var(--p-chart-2);
  }

  &.admin {
    background-color: var(--p-brand-soft);
    color: var(--color-brand-txt-base);
  }
}

.note {
  display: flex;
  gap: 0.8rem;
  align-items: baseline;
}

.segments {
  display: flex;
  padding: 0.3rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-subtle);
}

.segment {
  flex: 1;
  padding: 0.7rem 1.2rem;
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--p-text);
}

.select {
  padding: 0.9rem 1.2rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
}

.password {
  display: flex;
  gap: 0.8rem;
}

.regen {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-s);
  background-color: var(--p-surface);
  color: var(--p-muted);
  cursor: pointer;

  &:hover {
    color: var(--p-text);
  }
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--p-text);
}

.role-choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.8rem;
}

.role-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.2rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  cursor: pointer;

  &.selected {
    border-color: var(--color-brand-item-base);
    background-color: var(--p-brand-softer);
    box-shadow: 0 0 0 0.1rem var(--color-brand-item-base);
  }
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .roles {
    position: static;
  }
}

@media (max-width: 600px) {
  .person {
    flex-wrap: wrap;
    padding: 1.2rem 1.6rem;
  }

  .who {
    min-width: 16rem;
  }
}
</style>
