<template>
  <VtsStateHero v-if="store.status === 'loading'" format="page" type="busy" size="large" />
  <LoginPage v-else-if="store.status === 'login'" />
  <PortalLayout v-else>
    <RouterView v-if="store.project !== undefined" />
    <VtsStateHero v-else format="page" type="no-data" size="large">
      You are not a member of any project yet. Ask an administrator of your organization to add you to one.
    </VtsStateHero>
  </PortalLayout>
  <VtsTooltipList />
</template>

<script lang="ts" setup>
import LoginPage from '@/components/LoginPage.vue'
import PortalLayout from '@/layouts/PortalLayout.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import VtsStateHero from '@core/components/state-hero/VtsStateHero.vue'
import VtsTooltipList from '@core/components/tooltip-list/VtsTooltipList.vue'
import { useUiStore } from '@core/stores/ui.store.ts'
import { useActiveElement, useMagicKeys, whenever } from '@vueuse/core'
import { logicAnd } from '@vueuse/math'
import { computed, watchEffect } from 'vue'

const uiStore = useUiStore()
const store = usePortalStore()

store.init()

// provider branding: name in the tab, brand color for links, buttons and the active navigation
watchEffect(() => {
  document.title = store.provider.name
  const { style } = document.documentElement
  for (const name of ['--color-brand-txt-base', '--color-brand-item-base']) {
    if (store.provider.color === undefined) {
      style.removeProperty(name)
    } else {
      style.setProperty(name, store.provider.color)
    }
  }
})

// Same shortcut as XO 6 to preview both color modes
const activeElement = useActiveElement()
const { D } = useMagicKeys()
const canToggle = computed(
  () => activeElement.value == null || !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.value.tagName)
)
whenever(logicAnd(D, canToggle), () => (uiStore.colorMode = uiStore.colorMode === 'dark' ? 'light' : 'dark'))
</script>
