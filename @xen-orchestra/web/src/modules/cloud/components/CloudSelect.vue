<template>
  <select v-model="model" class="cloud-select typo-body-regular">
    <slot />
  </select>
</template>

<script lang="ts" setup generic="T extends string | number | undefined">
// Plain select styled like UiInput, for short static lists
const model = defineModel<T>()

defineSlots<{
  default(): any
}>()
</script>

<style lang="postcss" scoped>
.cloud-select {
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
    outline: 0.1rem solid var(--color-brand-item-base);
  }
}
</style>
