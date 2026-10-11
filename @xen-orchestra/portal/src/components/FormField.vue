<template>
  <div class="form-field">
    <label :for="$props.for" class="typo-form-label label">{{ label }}</label>
    <slot />
    <span v-if="info" class="typo-body-regular-small info">{{ info }}</span>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  label: string
  for?: string
  info?: string
}>()

defineSlots<{
  default(): any
}>()
</script>

<style lang="postcss" scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;

  .label {
    color: var(--color-neutral-txt-primary);
  }

  .info {
    color: var(--color-neutral-txt-secondary);
  }
}
</style>
