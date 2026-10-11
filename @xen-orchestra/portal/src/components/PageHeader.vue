<template>
  <header class="page-header">
    <RouterLink v-if="back" :to="back.to" class="back typo-body-regular-small">
      <PIcon :icon="faArrowLeft" size="small" />
      {{ back.label }}
    </RouterLink>
    <div class="row">
      <div class="identity">
        <slot name="leading" />
        <div class="titles">
          <div class="title-line">
            <h1 class="title">{{ title }}</h1>
            <slot name="status" />
          </div>
          <p v-if="subtitle || slots.subtitle" class="subtitle typo-body-regular">
            <slot name="subtitle">{{ subtitle }}</slot>
          </p>
        </div>
      </div>
      <div v-if="slots.actions" class="actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'

defineProps<{
  title: string
  subtitle?: string
  back?: { to: string; label: string }
  /** @deprecated kept for the pages not redesigned yet */
  icon?: unknown
}>()

const slots = defineSlots<{
  leading?(): any
  status?(): any
  subtitle?(): any
  actions?(): any
}>()
</script>

<style lang="postcss" scoped>
.page-header {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  width: 100%;
  max-width: var(--p-content-width);
  margin-inline: auto;
  padding: 3.2rem var(--p-page-padding) 0;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  align-self: flex-start;
  color: var(--p-muted);
  text-decoration: none;

  &:hover {
    color: var(--color-brand-txt-base);
  }
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.4rem;
  flex-wrap: wrap;
}

.identity {
  display: flex;
  align-items: center;
  gap: 1.6rem;
  min-width: 0;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  flex-wrap: wrap;
}

.title {
  font-size: 2.6rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--p-text);
}

.subtitle {
  color: var(--p-muted);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .page-header {
    padding-top: 2rem;
  }

  .title {
    font-size: 2.2rem;
  }
}
</style>
