<template>
  <svg class="p-icon" :class="size" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true" focusable="false">
    <path v-for="(d, index) of paths" :key="index" :d fill="currentColor" />
  </svg>
</template>

<script lang="ts" setup>
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import { computed } from 'vue'

const { icon } = defineProps<{
  icon: IconDefinition
  size?: 'small' | 'medium' | 'large'
}>()

const width = computed(() => icon.icon[0])
const height = computed(() => icon.icon[1])
const paths = computed(() => {
  const data = icon.icon[4]
  return Array.isArray(data) ? data : [data]
})
</script>

<style lang="postcss" scoped>
.p-icon {
  flex-shrink: 0;
  width: 1.4rem;
  height: 1.4rem;

  &.small {
    width: 1.2rem;
    height: 1.2rem;
  }

  &.large {
    width: 1.8rem;
    height: 1.8rem;
  }
}
</style>
