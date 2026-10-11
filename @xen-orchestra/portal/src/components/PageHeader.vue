<template>
  <UiHeadBar :icon>
    {{ title }}
    <template v-if="slots.status" #status>
      <slot name="status" />
    </template>
    <template v-if="slots.actions" #actions>
      <slot name="actions" />
    </template>
  </UiHeadBar>
</template>

<script lang="ts" setup>
import type { IconName } from '@core/icons'
import UiHeadBar from '@core/components/ui/head-bar/UiHeadBar.vue'

defineProps<{
  title: string
  icon?: IconName
}>()

const slots = defineSlots<{
  status?(): any
  actions?(): any
}>()
</script>
