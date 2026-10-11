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
  gap: 1.6rem;
  padding: 1.6rem;
  width: 100%;
  max-width: 140rem;
}
</style>
