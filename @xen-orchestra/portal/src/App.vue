<template>
  <PortalLayout>
    <RouterView />
  </PortalLayout>
  <VtsTooltipList />
</template>

<script lang="ts" setup>
import PortalLayout from '@/layouts/PortalLayout.vue'
import VtsTooltipList from '@core/components/tooltip-list/VtsTooltipList.vue'
import { useUiStore } from '@core/stores/ui.store'
import { useActiveElement, useMagicKeys, whenever } from '@vueuse/core'
import { logicAnd } from '@vueuse/math'
import { computed } from 'vue'

const uiStore = useUiStore()

// Same shortcut as XO 6 to preview both color modes
const activeElement = useActiveElement()
const { D } = useMagicKeys()
const canToggle = computed(
  () => activeElement.value == null || !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.value.tagName)
)
whenever(logicAnd(D, canToggle), () => (uiStore.colorMode = uiStore.colorMode === 'dark' ? 'light' : 'dark'))
</script>
