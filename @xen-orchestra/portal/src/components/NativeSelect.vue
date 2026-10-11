<template>
  <select v-model="model" class="native-select typo-body-regular">
    <slot />
  </select>
</template>

<script lang="ts" setup>
// Plain select styled like UiInput, simpler than VtsSelect for the prototype
const model = defineModel<string | number | undefined>()

defineSlots<{
  default(): any
}>()
</script>

<style lang="postcss" scoped>
.native-select {
  height: 4rem;
  padding-inline: 1.2rem;
  border: 0.1rem solid var(--color-neutral-border);
  border-radius: 0.4rem;
  background-color: var(--color-neutral-background-primary);
  color: var(--color-neutral-txt-primary);
  cursor: pointer;

  &:hover {
    border-color: var(--color-brand-item-hover);
  }

  &:focus {
    outline: none;
    border-color: var(--color-brand-item-base);
  }
}
</style>
