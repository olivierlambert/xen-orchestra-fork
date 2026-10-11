<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to
    :type="to ? undefined : 'button'"
    class="p-menu-item typo-body-regular-small"
    :class="{ danger, active }"
    :disabled
    role="menuitem"
  >
    <PIcon v-if="icon" :icon class="icon" />
    <span class="label"><slot /></span>
    <span v-if="hint" class="hint p-muted">{{ hint }}</span>
    <PIcon v-if="active" :icon="faCheck" class="check" />
  </component>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { RouterLink } from 'vue-router'

defineProps<{
  icon?: IconDefinition
  to?: string
  hint?: string
  danger?: boolean
  active?: boolean
  disabled?: boolean
}>()

defineSlots<{
  default(): any
}>()
</script>

<style lang="postcss" scoped>
.p-menu-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: none;
  border-radius: var(--p-radius-s);
  background: transparent;
  color: var(--p-text);
  text-align: start;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background-color: var(--p-subtle);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.danger {
    color: var(--color-danger-txt-base);
  }

  .icon {
    color: var(--p-muted);
  }

  &.danger .icon {
    color: inherit;
  }

  .label {
    flex: 1;
  }

  .check {
    color: var(--color-brand-txt-base);
  }
}
</style>
