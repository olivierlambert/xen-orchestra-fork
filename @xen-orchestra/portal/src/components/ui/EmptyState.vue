<template>
  <div class="empty-state" :class="{ compact }">
    <span class="art"><PIcon :icon size="large" /></span>
    <div class="text">
      <p class="typo-body-bold title">{{ title }}</p>
      <p v-if="description" class="typo-body-regular-small p-muted">{{ description }}</p>
    </div>
    <div v-if="slots.default" class="actions"><slot /></div>
  </div>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'

defineProps<{
  icon: IconDefinition
  title: string
  description?: string
  compact?: boolean
}>()

const slots = defineSlots<{
  default?(): any
}>()
</script>

<style lang="postcss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  padding: 4rem 2.4rem;
  text-align: center;

  &.compact {
    flex-direction: row;
    padding: 1.6rem 0;
    text-align: start;
  }
}

.art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.8rem;
  height: 4.8rem;
  border-radius: 50%;
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);
  flex-shrink: 0;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: 44rem;
}

.title {
  color: var(--p-text);
}

.actions {
  display: flex;
  gap: 0.8rem;
}
</style>
