<template>
  <PageHeader title="Account" subtitle="Your profile and password" />
  <PageContent>
    <div class="layout">
      <PPanel>
        <div class="profile">
          <Avatar :name="store.currentUser.name" size="large" />
          <div class="profile-text">
            <span class="typo-h5">{{ displayName(store.currentUser.name) }}</span>
            <span class="typo-body-regular p-muted">{{ store.currentUser.name }}</span>
          </div>
        </div>
        <dl class="facts">
          <div>
            <dt>Organization</dt>
            <dd>{{ store.organization.name }}</dd>
          </div>
          <div>
            <dt>Organization role</dt>
            <dd>{{ store.canManageOrganization ? 'Admin' : 'Member' }}</dd>
          </div>
          <div v-if="store.organization.costCenter">
            <dt>Cost center</dt>
            <dd class="p-mono">{{ store.organization.costCenter }}</dd>
          </div>
          <div>
            <dt>Projects</dt>
            <dd>{{ store.projects.map(project => project.name).join(', ') }}</dd>
          </div>
        </dl>
      </PPanel>

      <PPanel title="Change password" description="Signs you out of your other sessions and revokes your API keys.">
        <form class="form" @submit.prevent="canSubmit && submit()">
          <label class="field">
            <span class="typo-body-bold-small">Current password</span>
            <UiInput v-model="oldPassword" accent="brand" type="password" autocomplete="current-password" />
          </label>
          <label class="field">
            <span class="typo-body-bold-small">New password</span>
            <UiInput v-model="newPassword" accent="brand" type="password" autocomplete="new-password" />
            <span class="strength" :class="strength.level">
              <i v-for="index in 4" :key="index" :class="{ on: index <= strength.score }" />
            </span>
            <span class="typo-body-regular-small p-muted">{{ strength.label }}</span>
          </label>
          <label class="field">
            <span class="typo-body-bold-small">Confirm new password</span>
            <UiInput
              v-model="confirmPassword"
              :accent="mismatch ? 'danger' : 'brand'"
              type="password"
              autocomplete="new-password"
            />
            <span v-if="mismatch" class="typo-body-regular-small error">The passwords differ</span>
          </label>
          <div>
            <UiButton
              variant="primary"
              accent="brand"
              size="medium"
              :busy="busy"
              :disabled="!canSubmit"
              @click="submit()"
            >
              Change password
            </UiButton>
          </div>
        </form>
      </PPanel>
    </div>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import Avatar from '@/components/ui/Avatar.vue'
import PPanel from '@/components/ui/PPanel.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import { displayName } from '@/utils/people.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import { computed, ref } from 'vue'

const store = usePortalStore()
const toasts = useToasts()

const oldPassword = ref<string | number | undefined>('')
const newPassword = ref<string | number | undefined>('')
const confirmPassword = ref<string | number | undefined>('')
const busy = ref(false)

const mismatch = computed(
  () => String(confirmPassword.value ?? '') !== '' && String(newPassword.value) !== String(confirmPassword.value)
)

const strength = computed(() => {
  const value = String(newPassword.value ?? '')
  if (value.length === 0) {
    return { score: 0, level: '', label: 'At least 8 characters' }
  }
  if (value.length < 8) {
    return { score: 1, level: 'weak', label: 'Too short: at least 8 characters' }
  }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter(pattern => pattern.test(value)).length
  const score = Math.min(4, (value.length >= 14 ? 2 : 1) + Math.max(0, variety - 1))
  return {
    score,
    level: score <= 2 ? 'fair' : 'good',
    label: score <= 2 ? 'Fair: a longer passphrase is stronger' : 'Strong',
  }
})

const canSubmit = computed(
  () =>
    String(oldPassword.value ?? '') !== '' &&
    String(newPassword.value ?? '').length >= 8 &&
    String(newPassword.value) === String(confirmPassword.value) &&
    !busy.value
)

async function submit() {
  busy.value = true
  try {
    if (await store.changePassword(String(oldPassword.value), String(newPassword.value))) {
      toasts.success('Password changed', 'Your other sessions and API keys were revoked.')
      oldPassword.value = newPassword.value = confirmPassword.value = ''
    }
  } finally {
    busy.value = false
  }
}
</script>

<style lang="postcss" scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: var(--p-gap);
  align-items: start;
}

.profile {
  display: flex;
  align-items: center;
  gap: 1.6rem;
  color: var(--p-text);
}

.profile-text {
  display: flex;
  flex-direction: column;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding-top: 1.6rem;
  border-block-start: var(--p-border);

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

.form {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--p-text);
}

.strength {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;

  i {
    height: 0.4rem;
    border-radius: 99rem;
    background-color: var(--p-subtle);
  }

  &.weak i.on {
    background-color: var(--color-danger-item-base);
  }

  &.fair i.on {
    background-color: var(--color-warning-item-base);
  }

  &.good i.on {
    background-color: var(--color-success-item-base);
  }
}

.error {
  color: var(--color-danger-txt-base);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
