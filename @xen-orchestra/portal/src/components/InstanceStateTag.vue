<template>
  <UiTag :accent variant="secondary">{{ label }}</UiTag>
</template>

<script lang="ts" setup>
import type { InstanceState } from '@/mock/types.ts'
import UiTag, { type TagAccent } from '@core/components/ui/tag/UiTag.vue'
import { computed } from 'vue'

const { state } = defineProps<{
  state: InstanceState
}>()

const STATES: Record<InstanceState, { label: string; accent: TagAccent }> = {
  creating: { label: 'Creating', accent: 'info' },
  restoring: { label: 'Restoring', accent: 'info' },
  running: { label: 'Running', accent: 'success' },
  paused: { label: 'Paused', accent: 'warning' },
  halted: { label: 'Stopped', accent: 'muted' },
}

const accent = computed(() => STATES[state].accent)
const label = computed(() => STATES[state].label)
</script>
