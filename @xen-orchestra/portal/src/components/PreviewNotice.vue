<template>
  <UiAlert v-if="store.backend === 'xo'" accent="info">
    <slot>Preview: this feature is not in Xen Orchestra yet, changes stay in your browser.</slot>
  </UiAlert>
</template>

<script lang="ts" setup>
import { usePortalStore } from '@/stores/portal.store.ts'
import UiAlert from '@core/components/ui/alert/UiAlert.vue'

defineSlots<{
  default?(): any
}>()

const store = usePortalStore()
</script>
