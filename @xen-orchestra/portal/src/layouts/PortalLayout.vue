<template>
  <div class="portal-layout" :class="{ 'nav-open': navOpen }">
    <!-- mobile top bar -->
    <header class="mobile-bar">
      <button type="button" class="icon-button" aria-label="Open navigation" @click="navOpen = true">
        <PIcon :icon="faBars" size="large" />
      </button>
      <RouterLink to="/dashboard" class="brand">
        <img v-if="store.provider.logoUrl" :src="store.provider.logoUrl" alt="" class="brand-logo" />
        <span v-else class="brand-mark"><PIcon :icon="faCloud" /></span>
        <span class="brand-name">{{ store.provider.name }}</span>
      </RouterLink>
      <RouterLink to="/account" aria-label="Account"><Avatar :name="store.currentUser.name" size="small" /></RouterLink>
    </header>

    <div class="scrim" @click="navOpen = false" />

    <aside class="sidebar">
      <RouterLink to="/dashboard" class="brand">
        <img v-if="store.provider.logoUrl" :src="store.provider.logoUrl" alt="" class="brand-logo" />
        <span v-else class="brand-mark"><PIcon :icon="faCloud" /></span>
        <span class="brand-name">{{ store.provider.name }}</span>
      </RouterLink>

      <ProjectSwitcher />

      <nav class="nav">
        <template v-for="group of navigation" :key="group.label">
          <span class="p-eyebrow group">{{ group.label }}</span>
          <RouterLink
            v-for="item of group.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
          >
            <PIcon :icon="item.icon" />
            <span>{{ item.label }}</span>
            <span v-if="item.badge" class="badge p-num">{{ item.badge }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="sidebar-foot">
        <a
          v-if="store.provider.supportUrl"
          :href="store.provider.supportUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="nav-item"
        >
          <PIcon :icon="faLifeRing" />
          <span>Help & support</span>
          <PIcon :icon="faArrowUpRightFromSquare" size="small" class="external" />
        </a>
        <PMenu class="account-menu">
          <template #trigger>
            <button type="button" class="account">
              <Avatar :name="store.currentUser.name" />
              <span class="account-text">
                <span class="typo-body-bold-small">{{ displayName(store.currentUser.name) }}</span>
                <span class="p-caption p-muted email">{{ store.currentUser.name }}</span>
              </span>
              <PIcon :icon="faEllipsisVertical" class="p-muted" />
            </button>
          </template>
          <PMenuItem :icon="faUser" to="/account">Account settings</PMenuItem>
          <PMenuItem :icon="isDark ? faSun : faMoon" @click="toggleTheme()">
            {{ isDark ? 'Light theme' : 'Dark theme' }}
          </PMenuItem>
          <PMenuItem v-if="store.isLive" :icon="faArrowRightFromBracket" @click="store.logout()">Sign out</PMenuItem>
        </PMenu>
      </div>
    </aside>

    <main class="main">
      <div v-if="store.organizationSuspended" class="banner">
        <PIcon :icon="faCircleExclamation" />
        <span>
          <strong>{{ store.organization.name }} is suspended.</strong> Instances are stopped and cannot be managed.
          Contact {{ store.provider.name }} to restore the service.
        </span>
      </div>
      <slot />
    </main>
    <ToastStack />
  </div>
</template>

<script lang="ts" setup>
import ProjectSwitcher from '@/components/ProjectSwitcher.vue'
import Avatar from '@/components/ui/Avatar.vue'
import PIcon from '@/components/ui/PIcon.vue'
import PMenu from '@/components/ui/PMenu.vue'
import PMenuItem from '@/components/ui/PMenuItem.vue'
import ToastStack from '@/components/ui/ToastStack.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import { displayName } from '@/utils/people.ts'
import { useUiStore } from '@core/stores/ui.store.ts'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import {
  faArrowRightFromBracket,
  faArrowUpRightFromSquare,
  faBars,
  faChartPie,
  faCircleExclamation,
  faCloud,
  faEllipsisVertical,
  faGaugeHigh,
  faKey,
  faLifeRing,
  faMoon,
  faNetworkWired,
  faServer,
  faSun,
  faUser,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { usePreferredDark } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

defineSlots<{
  default(): any
}>()

const store = usePortalStore()
const uiStore = useUiStore()
const toasts = useToasts()
const route = useRoute()

const navOpen = ref(false)
useRouter().afterEach(() => (navOpen.value = false))

const prefersDark = usePreferredDark()
const isDark = computed(() => uiStore.colorMode === 'dark' || (uiStore.colorMode === 'auto' && prefersDark.value))
const toggleTheme = () => (uiStore.colorMode = isDark.value ? 'light' : 'dark')

// errors of the actions are shown as notifications
watch(
  () => store.lastError,
  error => {
    if (error !== undefined) {
      toasts.danger('Something went wrong', error)
      store.lastError = undefined
    }
  }
)

const navigation = computed<
  { label: string; items: { to: string; label: string; icon: IconDefinition; badge?: number }[] }[]
>(() => [
  {
    label: 'Project',
    items: [
      { to: '/dashboard', label: 'Overview', icon: faGaugeHigh },
      { to: '/instances', label: 'Instances', icon: faServer, badge: store.instances.length || undefined },
      { to: '/networks', label: 'Networking', icon: faNetworkWired },
      { to: '/usage', label: store.showsCosts ? 'Usage & costs' : 'Usage', icon: faChartPie },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/members', label: 'Members', icon: faUsers },
      { to: '/access', label: 'SSH & API keys', icon: faKey },
    ],
  },
])

const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`)
</script>

<style lang="postcss" scoped>
.portal-layout {
  --sidebar-width: 26rem;
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
  background-color: var(--p-canvas);
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  height: 100vh;
  padding: 2rem 1.6rem 1.6rem;
  border-inline-end: var(--p-border);
  background-color: var(--p-surface);
  overflow-y: auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-inline: 0.4rem;
  color: var(--p-text);
  text-decoration: none;
}

.brand-logo {
  height: 2.8rem;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: var(--p-radius-m);
  background: linear-gradient(
    135deg,
    var(--color-brand-item-base),
    color-mix(in srgb, var(--color-brand-item-base) 55%, #000)
  );
  color: #fff;
}

.brand-name {
  font-size: 1.8rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
}

.group {
  padding: 1.6rem 1rem 0.6rem;

  &:first-child {
    padding-top: 0;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 0.9rem 1rem;
  border-radius: var(--p-radius-m);
  color: var(--p-muted);
  font-size: 1.4rem;
  font-weight: 500;
  text-decoration: none;
  transition:
    background-color 0.12s,
    color 0.12s;

  &:hover {
    background-color: var(--p-subtle);
    color: var(--p-text);
  }

  &.active {
    background-color: var(--p-brand-soft);
    color: var(--color-brand-txt-base);
  }

  .badge {
    margin-inline-start: auto;
    padding: 0 0.7rem;
    border-radius: 99rem;
    background-color: var(--p-subtle);
    color: var(--p-muted);
    font-size: 1.2rem;
  }

  &.active .badge {
    background-color: var(--p-surface);
    color: var(--color-brand-txt-base);
  }

  .external {
    margin-inline-start: auto;
    opacity: 0.6;
  }
}

.sidebar-foot {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-top: 1.2rem;
  border-block-start: var(--p-border);
}

.account-menu :deep(.panel) {
  top: auto;
  bottom: calc(100% + 0.6rem);
  width: 100%;
}

.account {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.8rem;
  border: none;
  border-radius: var(--p-radius-m);
  background: transparent;
  color: var(--p-text);
  cursor: pointer;
  text-align: start;

  &:hover {
    background-color: var(--p-subtle);
  }
}

.account-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;

  .email {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.main {
  min-width: 0;
}

.banner {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem var(--p-page-padding);
  background-color: color-mix(in srgb, var(--color-warning-item-base) 16%, var(--p-surface));
  color: var(--p-text);
  border-block-end: 0.1rem solid color-mix(in srgb, var(--color-warning-item-base) 40%, transparent);
}

.mobile-bar,
.scrim {
  display: none;
}

@media (max-width: 960px) {
  .portal-layout {
    grid-template-columns: 1fr;
  }

  .mobile-bar {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem 1.6rem;
    border-block-end: var(--p-border);
    background-color: color-mix(in srgb, var(--p-surface) 90%, transparent);
    backdrop-filter: blur(8px);

    .brand {
      flex: 1;
    }

    .brand-name {
      font-size: 1.6rem;
    }
  }

  .icon-button {
    display: flex;
    padding: 0.6rem;
    border: none;
    background: transparent;
    color: var(--p-text);
    cursor: pointer;
  }

  .sidebar {
    position: fixed;
    z-index: 90;
    inset: 0 auto 0 0;
    width: min(30rem, 85vw);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .scrim {
    position: fixed;
    z-index: 80;
    inset: 0;
    display: block;
    background-color: rgba(10, 14, 30, 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .nav-open {
    .sidebar {
      transform: none;
    }

    .scrim {
      opacity: 1;
      pointer-events: auto;
    }
  }
}
</style>
