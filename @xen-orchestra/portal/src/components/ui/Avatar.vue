<template>
  <span class="avatar" :class="size" :style="{ '--hue': hue }" aria-hidden="true">{{ initials }}</span>
</template>

<script lang="ts" setup>
import { initialsOf } from '@/utils/people.ts'
import { computed } from 'vue'

const { name } = defineProps<{
  name: string
  size?: 'small' | 'large'
}>()

const initials = computed(() => initialsOf(name))
const hue = computed(() => [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7))
</script>

<style lang="postcss" scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  background-color: hsl(var(--hue) 70% 92%);
  color: hsl(var(--hue) 55% 32%);
  font-size: 1.2rem;
  font-weight: 600;

  &.small {
    width: 2.4rem;
    height: 2.4rem;
    font-size: 1rem;
  }

  &.large {
    width: 4.8rem;
    height: 4.8rem;
    font-size: 1.6rem;
  }
}

:root.dark .avatar {
  background-color: hsl(var(--hue) 35% 26%);
  color: hsl(var(--hue) 80% 86%);
}
</style>
