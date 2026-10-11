<template>
  <PageHeader title="Account" icon="fa:circle-user" />
  <PageContent>
    <div class="columns">
      <UiCard>
        <UiCardTitle>Profile</UiCardTitle>
        <dl class="details typo-body-regular">
          <dt>Email</dt>
          <dd>{{ store.currentUser.name }}</dd>
          <dt>Organization</dt>
          <dd>{{ store.organization.name }}</dd>
          <dt>Role</dt>
          <dd>{{ store.organizationRole === 'admin' ? 'Organization admin' : 'Member' }}</dd>
        </dl>
        <RouterLink to="/access" class="typo-body-regular-small">API and SSH keys</RouterLink>
      </UiCard>

      <UiCard>
        <UiCardTitle>
          Change password
          <template #description>At least 8 characters</template>
        </UiCardTitle>
        <div class="form">
          <FormField label="Current password" for="old-password">
            <UiInput id="old-password" v-model="oldPassword" accent="brand" type="password" />
          </FormField>
          <FormField label="New password" for="new-password">
            <UiInput id="new-password" v-model="newPassword" accent="brand" type="password" />
          </FormField>
          <FormField label="Confirm the new password" for="confirm-password">
            <UiInput id="confirm-password" v-model="confirmPassword" accent="brand" type="password" />
          </FormField>
          <UiInfo v-if="mismatch" accent="danger">The new passwords do not match</UiInfo>
          <UiInfo v-if="changed" accent="success">Password changed</UiInfo>
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
        </div>
      </UiCard>
    </div>
  </PageContent>
</template>

<script lang="ts" setup>
import FormField from '@/components/FormField.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import { computed, ref } from 'vue'

const store = usePortalStore()

const oldPassword = ref<string | number | undefined>('')
const newPassword = ref<string | number | undefined>('')
const confirmPassword = ref<string | number | undefined>('')
const busy = ref(false)
const changed = ref(false)

const mismatch = computed(
  () => String(confirmPassword.value ?? '') !== '' && String(newPassword.value) !== String(confirmPassword.value)
)

const canSubmit = computed(
  () =>
    String(oldPassword.value ?? '') !== '' &&
    String(newPassword.value ?? '').length >= 8 &&
    String(newPassword.value) === String(confirmPassword.value) &&
    !busy.value
)

async function submit() {
  busy.value = true
  changed.value = false
  try {
    if (await store.changePassword(String(oldPassword.value), String(newPassword.value))) {
      changed.value = true
      oldPassword.value = newPassword.value = confirmPassword.value = ''
    }
  } finally {
    busy.value = false
  }
}
</script>

<style lang="postcss" scoped>
.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(36rem, 1fr));
  gap: 1.6rem;
  align-items: start;
}

.details {
  display: grid;
  grid-template-columns: 12rem 1fr;
  gap: 1rem 1.6rem;
  color: var(--color-neutral-txt-primary);

  dt {
    color: var(--color-neutral-txt-secondary);
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  max-width: 40rem;
}
</style>
