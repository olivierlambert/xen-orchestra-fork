<template>
  <div class="page-content">
    <slot />
  </div>
</template>

<script lang="ts" setup>
defineSlots<{
  default(): any
}>()
</script>

<style lang="postcss" scoped>
.page-content {
  display: flex;
  flex-direction: column;
  gap: var(--p-gap);
  width: 100%;
  max-width: var(--p-content-width);
  margin-inline: auto;
  padding: 2.4rem var(--p-page-padding) 4.8rem;
}
</style>
