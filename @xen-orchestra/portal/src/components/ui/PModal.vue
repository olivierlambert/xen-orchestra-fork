<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="backdrop" @mousedown.self="emit('close')" @keydown.escape="emit('close')">
        <div class="dialog" :class="{ danger }" role="dialog" aria-modal="true" :aria-label="title">
          <header class="head">
            <span v-if="icon" class="icon"><PIcon :icon size="large" /></span>
            <div class="titles">
              <h2 class="typo-h5">{{ title }}</h2>
              <p v-if="description" class="typo-body-regular-small p-muted">{{ description }}</p>
            </div>
            <button type="button" class="close" aria-label="Close" @click="emit('close')">
              <PIcon :icon="faXmark" />
            </button>
          </header>
          <div class="body"><slot /></div>
          <footer v-if="slots.footer" class="foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { onKeyStroke } from '@vueuse/core'

const { open } = defineProps<{
  open: boolean
  title: string
  description?: string
  icon?: IconDefinition
  danger?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const slots = defineSlots<{
  default(): any
  footer?(): any
}>()

onKeyStroke('Escape', () => open && emit('close'))
</script>

<style lang="postcss" scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.6rem;
  background-color: rgba(10, 14, 30, 0.45);
  backdrop-filter: blur(2px);
}

.dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 52rem;
  max-height: calc(100vh - 3.2rem);
  border: var(--p-border);
  border-radius: var(--p-radius-l);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation-high);
  overflow: auto;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 1.6rem;
  padding: 2.4rem 2.4rem 0;
  color: var(--p-text);
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);
  flex-shrink: 0;

  .danger & {
    background-color: color-mix(in srgb, var(--color-danger-item-base) 14%, var(--p-surface));
    color: var(--color-danger-txt-base);
  }
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
}

.close {
  display: flex;
  padding: 0.6rem;
  border: none;
  border-radius: var(--p-radius-s);
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;

  &:hover {
    background-color: var(--p-subtle);
  }
}

.body {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  padding: 2rem 2.4rem 2.4rem;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  padding: 1.6rem 2.4rem;
  border-block-start: var(--p-border);
  background-color: color-mix(in srgb, var(--p-subtle) 50%, var(--p-surface));
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;

  .dialog {
    transition: transform 0.15s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .dialog {
    transform: translateY(0.8rem) scale(0.98);
  }
}
</style>
