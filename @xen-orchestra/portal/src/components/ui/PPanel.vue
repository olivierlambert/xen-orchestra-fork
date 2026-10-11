<template>
  <section class="p-panel" :class="{ flush, accent }">
    <header v-if="title || slots.header || slots.actions" class="head">
      <div class="titles">
        <slot name="header">
          <h2 class="title typo-h6">
            {{ title }}
            <span v-if="count !== undefined" class="count typo-body-bold-small">{{ count }}</span>
          </h2>
          <p v-if="description || slots.description" class="description typo-body-regular-small">
            <slot name="description">{{ description }}</slot>
          </p>
        </slot>
      </div>
      <div v-if="slots.actions" class="actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="body">
      <slot />
    </div>
    <footer v-if="slots.footer" class="foot">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script lang="ts" setup>
defineProps<{
  title?: string
  description?: string
  count?: number | string
  /** content touches the edges (lists, tables) */
  flush?: boolean
  accent?: boolean
}>()

const slots = defineSlots<{
  default?(): any
  header?(): any
  description?(): any
  actions?(): any
  footer?(): any
}>()
</script>

<style lang="postcss" scoped>
.p-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: var(--p-border);
  border-radius: var(--p-radius-l);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation);
  animation: p-fade-up 0.25s ease-out both;

  &.accent {
    border-color: color-mix(in srgb, var(--color-brand-item-base) 35%, var(--color-neutral-border));
  }
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.6rem;
  padding: 2rem 2.4rem 0;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.title {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--p-text);
}

.count {
  padding: 0.1rem 0.8rem;
  border-radius: 99rem;
  background-color: var(--p-subtle);
  color: var(--p-muted);
}

.description {
  color: var(--p-muted);
  max-width: 72rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-shrink: 0;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  padding: 2rem 2.4rem 2.4rem;
}

.flush .body {
  padding: 1.6rem 0 0.4rem;
}

.foot {
  padding: 1.2rem 2.4rem;
  border-block-start: var(--p-border);
  color: var(--p-muted);
}

@media (max-width: 768px) {
  .head {
    padding: 1.6rem 1.6rem 0;
    flex-wrap: wrap;
  }

  .body {
    padding: 1.6rem;
  }
}
</style>
