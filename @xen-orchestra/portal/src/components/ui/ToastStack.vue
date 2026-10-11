<template>
  <div class="toast-stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast of toasts.items" :key="toast.id" class="toast" :class="toast.tone">
        <PIcon :icon="ICONS[toast.tone]" class="icon" />
        <div class="text">
          <span class="typo-body-bold-small">{{ toast.title }}</span>
          <span v-if="toast.description" class="typo-body-regular-small p-muted">{{ toast.description }}</span>
        </div>
        <button type="button" class="close" aria-label="Dismiss" @click="toasts.dismiss(toast.id)">
          <PIcon :icon="faXmark" size="small" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import { useToasts } from '@/stores/toasts.store.ts'
import { faCircleCheck, faCircleInfo, faCircleXmark, faXmark } from '@fortawesome/free-solid-svg-icons'

const toasts = useToasts()

const ICONS = { success: faCircleCheck, info: faCircleInfo, danger: faCircleXmark }
</script>

<style lang="postcss" scoped>
.toast-stack {
  position: fixed;
  z-index: 200;
  right: 2.4rem;
  bottom: 2.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  width: min(38rem, calc(100vw - 3.2rem));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 1.2rem;
  padding: 1.4rem 1.6rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation-high);
  color: var(--p-text);

  &.success .icon {
    color: var(--color-success-txt-base);
  }

  &.info .icon {
    color: var(--color-info-txt-base);
  }

  &.danger .icon {
    color: var(--color-danger-txt-base);
  }
}

.icon {
  margin-top: 0.2rem;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}

.close {
  display: flex;
  padding: 0.4rem;
  border: none;
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(2rem);
}
</style>
