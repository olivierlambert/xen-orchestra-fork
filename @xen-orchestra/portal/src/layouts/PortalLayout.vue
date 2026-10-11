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
          <span class="typo-body-bold-small">{{ currentUser.name }}</span>
          <span class="typo-body-regular-small org">{{ organization.name }}</span>
        </div>
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
            Prototype: all data is mocked
          </div>
        </template>
      </VtsLayoutSidebar>
    </template>
    <template #content>
      <slot />
    </template>
  </CoreLayout>
</template>

<script lang="ts" setup>
import ProjectSwitcher from '@/components/ProjectSwitcher.vue'
import { currentUser, organization, PROVIDER } from '@/mock/data.ts'
import type { IconName } from '@core/icons'
import VtsIcon from '@core/components/icon/VtsIcon.vue'
import VtsLayoutSidebar from '@core/components/layout/VtsLayoutSidebar.vue'
import UiButtonIcon from '@core/components/ui/button-icon/UiButtonIcon.vue'
import UiLink from '@core/components/ui/link/UiLink.vue'
import CoreLayout from '@core/layouts/CoreLayout.vue'
import { useLeftSidebarStore } from '@core/packages/sidebar'
import { useUiStore } from '@core/stores/ui.store.ts'
import { useRouter } from 'vue-router'

defineSlots<{
  default(): any
}>()

const leftSidebar = useLeftSidebarStore()
const uiStore = useUiStore()

// On small screens the sidebar overlays the content: close it after navigating
useRouter().afterEach(() => {
  if (uiStore.isSmall) {
    leftSidebar.toggleExpand(false)
  }
})

const initials = currentUser.name
  .split(' ')
  .map(part => part[0])
  .join('')

const navigation: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'fa:display' },
  { to: '/instances', label: 'Instances', icon: 'fa:server' },
  { to: '/networks', label: 'Networking', icon: 'fa:network-wired' },
  { to: '/usage', label: 'Usage', icon: 'fa:file-csv' },
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
