<template>
  <RouterView v-slot="{ Component }">
    <CloudHeader />
    <component :is="Component" />
  </RouterView>
</template>

<script lang="ts" setup>
import CloudHeader from '@/modules/cloud/components/CloudHeader.vue'
import { useDefaultTab } from '@core/composables/default-tab.composable.ts'

useDefaultTab('/admin/cloud', 'organizations')
</script>
