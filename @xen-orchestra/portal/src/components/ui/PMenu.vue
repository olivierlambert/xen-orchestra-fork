<template>
  <div ref="root" class="p-menu" @keydown.escape="open = false">
    <div class="trigger" @click="open = !open">
      <slot name="trigger" :open />
    </div>
    <Transition name="pop">
      <div v-if="open" class="panel" :class="align" role="menu" @click="closeOnClick && (open = false)">
        <slot :close="() => (open = false)" />
      </div>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { onClickOutside } from '@vueuse/core'
import { ref, useTemplateRef } from 'vue'

const { closeOnClick = true } = defineProps<{
  align?: 'start' | 'end'
  closeOnClick?: boolean
}>()

defineSlots<{
  trigger(props: { open: boolean }): any
  default(props: { close: () => void }): any
}>()

const open = ref(false)
onClickOutside(useTemplateRef('root'), () => (open.value = false))
</script>

<style lang="postcss" scoped>
.p-menu {
  position: relative;
}

.panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 0.6rem);
  left: 0;
  min-width: 22rem;
  padding: 0.6rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation-high);

  &.end {
    left: auto;
    right: 0;
  }
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem) scale(0.98);
}
</style>
