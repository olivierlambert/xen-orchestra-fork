<template>
  <button type="button" class="select-card" :class="{ selected, disabled }" :disabled :aria-pressed="selected">
    <slot />
  </button>
</template>

<script lang="ts" setup>
defineProps<{
  selected: boolean
  disabled?: boolean
}>()

defineSlots<{
  default(): any
}>()
</script>

<style lang="postcss" scoped>
.select-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 1.2rem 1.6rem;
  border: 0.1rem solid var(--color-neutral-border);
  border-radius: 0.8rem;
  background-color: var(--color-neutral-background-primary);
  color: var(--color-neutral-txt-primary);
  text-align: start;
  cursor: pointer;

  &:hover {
    border-color: var(--color-brand-item-hover);
  }

  &.selected {
    border-color: var(--color-brand-item-base);
    background-color: var(--color-brand-background-selected);
    box-shadow: 0 0 0 0.1rem var(--color-brand-item-base);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
</style>
