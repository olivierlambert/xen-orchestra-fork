<template>
  <main class="login-page">
    <section class="brand-side">
      <div class="brand">
        <img v-if="store.provider.logoUrl" :src="store.provider.logoUrl" alt="" class="brand-logo" />
        <span v-else class="brand-mark"><PIcon :icon="faCloud" size="large" /></span>
        <span class="brand-name">{{ store.provider.name }}</span>
      </div>
      <div class="pitch">
        <h1 class="headline">Your infrastructure,<br />one click away.</h1>
        <ul class="points typo-body-regular">
          <li><PIcon :icon="faBolt" /> Instances ready in about a minute</li>
          <li><PIcon :icon="faShieldHalved" /> Backups and snapshots built in</li>
          <li>
            <PIcon :icon="faChartPie" /> {{ store.provider.billing === 'none' ? 'Usage' : 'Costs' }} you can follow by
            the hour
          </li>
        </ul>
      </div>
      <span class="footnote p-caption">
        <a v-if="store.provider.supportUrl" :href="store.provider.supportUrl" target="_blank" rel="noopener noreferrer"
          >Help & support</a
        >
      </span>
    </section>

    <section class="form-side">
      <form class="form" @submit.prevent="canSubmit && submit()">
        <div class="mobile-brand">
          <span class="brand-mark"><PIcon :icon="faCloud" /></span>
          <span class="brand-name">{{ store.provider.name }}</span>
        </div>
        <div class="titles">
          <h2 class="typo-h3">Sign in</h2>
          <p class="typo-body-regular p-muted">Welcome back. Use the email of your account.</p>
        </div>
        <label class="field">
          <span class="typo-body-bold-small">Email</span>
          <input
            v-model="name"
            type="email"
            autocomplete="username"
            class="input typo-body-regular"
            placeholder="you@company.example"
            autofocus
          />
        </label>
        <label class="field">
          <span class="typo-body-bold-small">Password</span>
          <span class="password">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              class="input typo-body-regular"
            />
            <button
              type="button"
              class="reveal"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <PIcon :icon="showPassword ? faEyeSlash : faEye" />
            </button>
          </span>
        </label>
        <div v-if="error" class="error typo-body-regular-small" role="alert">
          <PIcon :icon="faCircleExclamation" size="small" />
          {{ error }}
        </div>
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          class="submit"
          :busy
          :disabled="!canSubmit"
          @click="submit()"
        >
          Sign in
        </UiButton>
        <p class="typo-body-regular-small p-muted help">
          Forgot your password? Ask an administrator of your organization to reset it.
        </p>
      </form>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { XoApiError } from '@/api/xo.ts'
import PIcon from '@/components/ui/PIcon.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import {
  faBolt,
  faChartPie,
  faCircleExclamation,
  faCloud,
  faEye,
  faEyeSlash,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons'
import { computed, ref } from 'vue'

const store = usePortalStore()

const name = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref<string>()

const canSubmit = computed(() => name.value !== '' && password.value !== '' && !busy.value)

async function submit() {
  busy.value = true
  error.value = undefined
  try {
    await store.login(name.value.trim(), password.value)
  } catch (err) {
    error.value =
      err instanceof XoApiError && err.status === 401
        ? 'Wrong email or password.'
        : err instanceof XoApiError && err.status === 429
          ? 'Too many attempts. Wait a moment and try again.'
          : (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<style lang="postcss" scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  min-height: 100vh;
  background-color: var(--p-surface);
}

.brand-side {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4rem 5.6rem;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(
      60rem 40rem at 85% 10%,
      color-mix(in srgb, var(--color-brand-item-base) 55%, #fff 0%),
      transparent 70%
    ),
    radial-gradient(
      50rem 50rem at 0% 100%,
      color-mix(in srgb, var(--color-brand-item-base) 70%, #000),
      transparent 70%
    ),
    linear-gradient(
      150deg,
      color-mix(in srgb, var(--color-brand-item-base) 85%, #000),
      color-mix(in srgb, var(--color-brand-item-base) 35%, #050816)
    );

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.12) 0.1rem, transparent 0.1rem);
    background-size: 2.4rem 2.4rem;
    mask-image: linear-gradient(180deg, transparent, #000 40%, transparent);
    pointer-events: none;
  }
}

.brand,
.mobile-brand {
  display: flex;
  align-items: center;
  gap: 1.2rem;
}

.brand-logo {
  height: 3.6rem;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: var(--p-radius-m);
  background-color: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 0 0 0.1rem rgba(255, 255, 255, 0.25);
}

.brand-name {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.pitch {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 3.2rem;
}

.headline {
  font-size: 4.4rem;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.035em;
}

.points {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  list-style: none;
  color: rgba(255, 255, 255, 0.88);

  li {
    display: flex;
    align-items: center;
    gap: 1.2rem;
  }
}

.footnote {
  position: relative;
  z-index: 1;

  a {
    color: rgba(255, 255, 255, 0.8);
  }
}

.form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3.2rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 100%;
  max-width: 40rem;
  color: var(--p-text);
}

.mobile-brand {
  display: none;
  color: var(--p-text);

  .brand-mark {
    background-color: var(--color-brand-item-base);
    color: var(--color-brand-txt-item);
    box-shadow: none;
  }
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.input {
  width: 100%;
  padding: 1.1rem 1.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  outline: none;
  transition:
    border-color 0.12s,
    box-shadow 0.12s;

  &:focus {
    border-color: var(--color-brand-item-base);
    box-shadow: 0 0 0 0.3rem color-mix(in srgb, var(--color-brand-item-base) 18%, transparent);
  }
}

.password {
  position: relative;

  .input {
    padding-inline-end: 4.4rem;
  }
}

.reveal {
  position: absolute;
  top: 50%;
  right: 0.8rem;
  display: flex;
  padding: 0.6rem;
  border: none;
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;
  transform: translateY(-50%);
}

.error {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 1.2rem;
  border-radius: var(--p-radius-m);
  background-color: color-mix(in srgb, var(--color-danger-item-base) 10%, var(--p-surface));
  color: var(--color-danger-txt-base);
}

.submit {
  width: 100%;
  justify-content: center;
}

.help {
  text-align: center;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-side {
    display: none;
  }

  .mobile-brand {
    display: flex;
  }
}
</style>
