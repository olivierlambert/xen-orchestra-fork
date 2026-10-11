<template>
  <CoreLayout class="portal-layout">
    <template #header-start>
      <RouterLink class="brand" to="/dashboard">
        <VtsIcon name="fa:city" size="medium" class="brand-icon" />
        <span v-if="!uiStore.isSmall" class="typo-h4">{{ PROVIDER.name }}</span>
      </RouterLink>
      <UiButtonIcon
        accent="brand"
        size="medium"
        icon="fa:bars"
        :target-scale="1.8"
        @click="leftSidebar.toggleExpand()"
      />
      <ProjectSwitcher />
    </template>
    <template #header-end>
      <UiLink
        v-if="!uiStore.isSmall"
        size="medium"
        icon="fa:headset"
        :href="PROVIDER.supportUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        Support
      </UiLink>
      <div class="account">
        <span class="avatar typo-body-bold-small">{{ initials }}</span>
        <div class="account-text">
          <span class="typo-body-bold-small">{{ store.currentUser.name }}</span>
          <span class="typo-body-regular-small org">{{ store.organization.name }}</span>
        </div>
        <UiButtonIcon
          v-if="store.backend === 'xo'"
          v-tooltip="'Sign out'"
          accent="brand"
          size="medium"
          icon="fa:arrow-right-from-bracket"
          @click="store.logout()"
        />
      </div>
    </template>
    <template #left-sidebar>
      <VtsLayoutSidebar class="sidebar">
        <nav class="nav">
          <RouterLink
            v-for="item of navigation"
            :key="item.to"
            v-slot="{ href, navigate, isActive }"
            :to="item.to"
            custom
          >
            <a :href class="nav-item typo-body-regular" :class="{ active: isActive }" @click="navigate">
              <VtsIcon :name="item.icon" size="medium" />
              {{ item.label }}
            </a>
          </RouterLink>
        </nav>
        <template #footer>
          <div class="prototype-notice typo-body-regular-small">
            <VtsIcon name="fa:info-circle" size="small" />
            <template v-if="store.backend === 'xo'">
              Connected to Xen Orchestra. Networking, backups, billing and API keys are previews.
            </template>
            <template v-else>Prototype: all data is mocked</template>
          </div>
        </template>
      </VtsLayoutSidebar>
    </template>
    <template #content>
      <UiAlert v-if="store.lastError" accent="danger" close class="error" @close="store.lastError = undefined">
        {{ store.lastError }}
      </UiAlert>
      <slot />
    </template>
  </CoreLayout>
</template>

<script lang="ts" setup>
import ProjectSwitcher from '@/components/ProjectSwitcher.vue'
import { PROVIDER } from '@/mock/data.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import type { IconName } from '@core/icons'
import VtsIcon from '@core/components/icon/VtsIcon.vue'
import VtsLayoutSidebar from '@core/components/layout/VtsLayoutSidebar.vue'
import UiAlert from '@core/components/ui/alert/UiAlert.vue'
import UiButtonIcon from '@core/components/ui/button-icon/UiButtonIcon.vue'
import UiLink from '@core/components/ui/link/UiLink.vue'
import { vTooltip } from '@core/directives/tooltip.directive.ts'
import CoreLayout from '@core/layouts/CoreLayout.vue'
import { useLeftSidebarStore } from '@core/packages/sidebar'
import { useUiStore } from '@core/stores/ui.store.ts'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

defineSlots<{
  default(): any
}>()

const leftSidebar = useLeftSidebarStore()
const uiStore = useUiStore()
const store = usePortalStore()

// On small screens the sidebar overlays the content: close it after navigating
useRouter().afterEach(() => {
  if (uiStore.isSmall) {
    leftSidebar.toggleExpand(false)
  }
})

const initials = computed(() =>
  store.currentUser.name
    .split(/[\s@.]/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
)

const navigation: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'fa:display' },
  { to: '/instances', label: 'Instances', icon: 'fa:server' },
  { to: '/networks', label: 'Networking', icon: 'fa:network-wired' },
  { to: '/usage', label: 'Usage', icon: 'fa:file-csv' },
  { to: '/members', label: 'Members', icon: 'object:organization' },
  { to: '/access', label: 'API & SSH keys', icon: 'fa:lock' },
]
</script>

<style lang="postcss" scoped>
.portal-layout {
  .brand {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    text-decoration: none;
    color: var(--color-brand-txt-base);
  }

  .brand-icon {
    font-size: 2.4rem;
  }

  .account {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .account-text {
    display: flex;
    flex-direction: column;
    color: var(--color-neutral-txt-primary);
  }

  .org {
    color: var(--color-neutral-txt-secondary);
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    background-color: var(--color-brand-item-base);
    color: var(--color-brand-txt-item);
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.8rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem 1.2rem;
    border-radius: 0.4rem;
    text-decoration: none;
    color: var(--color-neutral-txt-primary);

    &:hover {
      background-color: var(--color-brand-background-hover);
    }

    &.active {
      background-color: var(--color-brand-background-selected);
      color: var(--color-brand-txt-base);
    }
  }

  .error {
    margin: 1.6rem 1.6rem 0;
  }

  .prototype-notice {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 1.6rem;
    color: var(--color-neutral-txt-secondary);
  }
}

@media (max-width: 640px) {
  .portal-layout .account-text {
    display: none;
  }
}
</style>
