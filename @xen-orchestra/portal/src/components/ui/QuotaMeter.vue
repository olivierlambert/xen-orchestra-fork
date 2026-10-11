<template>
  <div class="quota-meter" :class="level">
    <div class="row typo-body-regular-small">
      <span class="label">{{ label }}</span>
      <span class="values p-num">
        <strong>{{ format(current + pending) }}</strong>
        <template v-if="limited"> / {{ format(total) }}</template>
        <template v-else> · no limit</template>
        <template v-if="unit">{{ `\u00a0${unit}` }}</template>
      </span>
    </div>
    <div v-if="limited" class="track">
      <div class="fill" :style="{ width: `${Math.min(100, ratio * 100)}%` }" />
      <div
        v-if="pending > 0"
        class="pending"
        :style="{
          left: `${Math.min(100, ratio * 100)}%`,
          width: `${Math.min(100 - ratio * 100, (pending / total) * 100)}%`,
        }"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const {
  current,
  total,
  pending = 0,
} = defineProps<{
  label: string
  current: number
  total: number
  unit?: string
  /** what an action in progress would add (e.g. the instance being configured) */
  pending?: number
}>()

const limited = computed(() => Number.isFinite(total))
const ratio = computed(() => (limited.value && total > 0 ? current / total : 0))
const level = computed(() => {
  const after = limited.value && total > 0 ? (current + pending) / total : 0
  return after > 1 ? 'over' : after >= 0.85 ? 'high' : undefined
})

const format = (value: number) => (Number.isInteger(value) ? value : value.toFixed(1))
</script>

<style lang="postcss" scoped>
.quota-meter {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 1.2rem;
  color: var(--p-muted);

  strong {
    color: var(--p-text);
    font-weight: 600;
  }
}

.track {
  position: relative;
  height: 0.6rem;
  border-radius: 99rem;
  background-color: var(--p-subtle);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 99rem;
  background-color: var(--color-brand-item-base);
  transition: width 0.4s ease;
}

.pending {
  position: absolute;
  top: 0;
  height: 100%;
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--color-brand-item-base) 55%, transparent) 0 0.4rem,
    color-mix(in srgb, var(--color-brand-item-base) 25%, transparent) 0.4rem 0.8rem
  );
  transition: width 0.3s ease;
}

.high .fill {
  background-color: var(--color-warning-item-base);
}

.over {
  .fill,
  .pending {
    background: var(--color-danger-item-base);
  }

  .row strong {
    color: var(--color-danger-txt-base);
  }
}
</style>
