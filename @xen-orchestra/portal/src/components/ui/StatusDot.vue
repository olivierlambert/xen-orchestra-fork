<template>
  <span class="status-dot typo-body-regular-small" :class="tone">
    <span class="dot" />
    <span v-if="!dotOnly">{{ label }}</span>
  </span>
</template>

<script lang="ts" setup>
import type { InstanceState } from '@/mock/types.ts'
import { computed } from 'vue'

const { state } = defineProps<{
  state: InstanceState
  dotOnly?: boolean
}>()

const STATES: Record<InstanceState, { label: string; tone: string }> = {
  creating: { label: 'Creating', tone: 'busy' },
  restoring: { label: 'Restoring', tone: 'busy' },
  running: { label: 'Running', tone: 'up' },
  paused: { label: 'Paused', tone: 'warn' },
  halted: { label: 'Stopped', tone: 'down' },
}

const tone = computed(() => STATES[state].tone)
const label = computed(() => STATES[state].label)
</script>

<style lang="postcss" scoped>
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--p-text);
  white-space: nowrap;
}

.dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.up .dot {
  color: var(--color-success-item-base);
  animation: p-pulse 2.4s infinite;
}

.busy .dot {
  color: var(--color-info-item-base);
  animation: p-pulse 1.2s infinite;
}

.warn .dot {
  color: var(--color-warning-item-base);
}

.down .dot {
  color: var(--color-neutral-txt-secondary);
  opacity: 0.6;
}
</style>
