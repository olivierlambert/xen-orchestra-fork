<template>
  <main class="login-page">
    <UiCard class="card">
      <div class="brand">
        <img v-if="store.provider.logoUrl" :src="store.provider.logoUrl" alt="" class="brand-logo" />
        <VtsIcon v-else name="fa:city" size="medium" class="brand-icon" />
        <span class="typo-h3">{{ store.provider.name }}</span>
      </div>
      <form class="form" @submit.prevent @keyup.enter="canSubmit && submit()">
        <FormField label="Email" for="login-name">
          <UiInput id="login-name" v-model="name" accent="brand" />
        </FormField>
        <FormField label="Password" for="login-password">
          <UiInput id="login-password" v-model="password" accent="brand" type="password" />
        </FormField>
        <UiInfo v-if="error" accent="danger" wrap>{{ error }}</UiInfo>
        <UiButton variant="primary" accent="brand" size="medium" :busy="busy" :disabled="!canSubmit" @click="submit()">
          Sign in
        </UiButton>
      </form>
    </UiCard>
  </main>
</template>

<script lang="ts" setup>
import { XoApiError } from '@/api/xo.ts'
import FormField from '@/components/FormField.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import VtsIcon from '@core/components/icon/VtsIcon.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import { computed, ref } from 'vue'

const store = usePortalStore()

const name = ref<string | number | undefined>('')
const password = ref<string | number | undefined>('')
const busy = ref(false)
const error = ref<string>()

const canSubmit = computed(() => String(name.value ?? '') !== '' && String(password.value ?? '') !== '' && !busy.value)

async function submit() {
  busy.value = true
  error.value = undefined
  try {
    await store.login(String(name.value), String(password.value))
  } catch (err) {
    error.value = err instanceof XoApiError && err.status === 401 ? 'Wrong email or password' : (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<style lang="postcss" scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.6rem;
  background-color: var(--color-neutral-background-secondary);
}

.card {
  width: 100%;
  max-width: 40rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--color-brand-txt-base);
}

.brand-logo {
  height: 3.2rem;
}

.brand-icon {
  font-size: 2.4rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}
</style>
