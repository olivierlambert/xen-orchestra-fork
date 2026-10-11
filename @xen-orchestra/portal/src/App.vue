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
import { useActiveElement, useMagicKeys, usePreferredDark, whenever } from '@vueuse/core'
import { logicAnd } from '@vueuse/math'
import { computed, watchEffect } from 'vue'

const uiStore = useUiStore()
const prefersDark = usePreferredDark()
const isDark = computed(() => uiStore.colorMode === 'dark' || (uiStore.colorMode === 'auto' && prefersDark.value))
const store = usePortalStore()

store.init()

// provider branding: name in the tab, the brand palette of XO 6 derived from the color of the provider
watchEffect(() => {
  document.title =
    store.status === 'ready' ? `${store.project?.name ?? 'Portal'} · ${store.provider.name}` : store.provider.name
  const { style } = document.documentElement
  const color = store.provider.color
  const dark = isDark.value
  const tokens: Record<string, string> = {
    '--color-brand-item-base': dark ? `color-mix(in srgb, #ffffff 12%, ${color})` : `${color}`,
    '--color-brand-txt-base': dark ? `color-mix(in srgb, #ffffff 35%, ${color})` : `${color}`,
    // text on brand buttons: white on dark brand colors
    '--color-brand-txt-item': color !== undefined && luminance(color) < 0.45 ? '#ffffff' : '#0b0d1a',
    '--color-brand-item-disabled': `color-mix(in srgb, ${dark ? '#000000' : '#ffffff'} 65%, ${color})`,
  }
  for (const [name, value] of Object.entries(tokens)) {
    if (color === undefined) {
      style.removeProperty(name)
    } else {
      style.setProperty(name, value)
    }
  }
})

/** relative luminance of a #rrggbb color, 0.5 when unknown */
function luminance(color: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim())
  if (match === null) {
    return 0.5
  }
  const [r, g, b] = match.slice(1).map(hex => {
    const c = parseInt(hex, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Same shortcut as XO 6 to preview both color modes
const activeElement = useActiveElement()
const { D } = useMagicKeys()
const canToggle = computed(
  () => activeElement.value == null || !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.value.tagName)
)
whenever(logicAnd(D, canToggle), () => (uiStore.colorMode = uiStore.colorMode === 'dark' ? 'light' : 'dark'))
</script>
