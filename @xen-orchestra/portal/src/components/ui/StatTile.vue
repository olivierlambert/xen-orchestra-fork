<template>
  <component :is="to ? RouterLink : 'div'" :to class="stat-tile" :class="{ link: to, tone }">
    <div class="top">
      <span class="label typo-body-regular-small">{{ label }}</span>
      <span v-if="icon" class="icon"><PIcon :icon /></span>
    </div>
    <div class="value-row">
      <span class="value p-num">{{ value }}</span>
      <span v-if="unit" class="unit typo-body-regular p-num">{{ unit }}</span>
    </div>
    <div v-if="slots.default" class="extra"><slot /></div>
    <span v-if="hint || slots.hint" class="hint typo-body-regular-small"
      ><slot name="hint">{{ hint }}</slot></span
    >
  </component>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import { RouterLink } from 'vue-router'

defineProps<{
  label: string
  value: string | number
  unit?: string
  hint?: string
  icon?: IconDefinition
  to?: string
  tone?: 'warning'
}>()

const slots = defineSlots<{
  default?(): any
  hint?(): any
}>()
</script>

<style lang="postcss" scoped>
.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 0;
  padding: 2rem 2.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-l);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation);
  color: var(--p-text);
  text-decoration: none;
  transition:
    border-color 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
  animation: p-fade-up 0.25s ease-out both;

  &.link:hover {
    border-color: color-mix(in srgb, var(--color-brand-item-base) 45%, var(--color-neutral-border));
    box-shadow: var(--p-elevation-high);
    transform: translateY(-0.1rem);
  }
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.label {
  color: var(--p-muted);
  font-weight: 500;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: var(--p-radius-m);
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);

  .warning & {
    background-color: color-mix(in srgb, var(--color-warning-item-base) 14%, var(--p-surface));
    color: var(--color-warning-txt-base);
  }
}

.value-row {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.value {
  font-size: 3.2rem;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.unit {
  color: var(--p-muted);
}

.extra {
  min-height: 3.2rem;
}

.hint {
  color: var(--p-muted);
}
</style>
