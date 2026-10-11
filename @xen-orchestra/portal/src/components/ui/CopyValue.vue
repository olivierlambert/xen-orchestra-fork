<template>
  <button
    type="button"
    class="copy-value"
    :class="{ copied, block }"
    :title="copied ? 'Copied' : `Copy ${value}`"
    @click.stop.prevent="copy()"
  >
    <span class="value" :class="{ 'p-mono': mono }"
      ><slot>{{ value }}</slot></span
    >
    <PIcon :icon="copied ? faCheck : faCopy" size="small" class="icon" />
  </button>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import { faCopy } from '@fortawesome/free-regular-svg-icons'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { ref } from 'vue'

const { value } = defineProps<{
  value: string
  mono?: boolean
  block?: boolean
}>()

defineSlots<{
  default?(): any
}>()

const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // insecure context (plain http on another host): fall back to a selection
    const area = document.createElement('textarea')
    area.value = value
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<style lang="postcss" scoped>
.copy-value {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  max-width: 100%;
  padding: 0.2rem 0.6rem;
  margin: -0.2rem -0.6rem;
  border: none;
  border-radius: var(--p-radius-s);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: start;

  &.block {
    display: flex;
    width: 100%;
    justify-content: space-between;
    margin: 0;
    padding: 1rem 1.2rem;
    border: var(--p-border);
    background-color: var(--p-subtle);
  }

  .value {
    white-space: nowrap;
  }

  &.block .value {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .icon {
    opacity: 0;
    color: var(--p-muted);
    transition: opacity 0.15s;
  }

  &.block .icon,
  &:hover .icon,
  &:focus-visible .icon {
    opacity: 1;
  }

  &:hover {
    background-color: var(--p-subtle);
  }

  &.copied .icon {
    opacity: 1;
    color: var(--color-success-txt-base);
  }
}
</style>
