<template>
  <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="sparkline" :class="tone" aria-hidden="true">
    <path v-if="area" :d="area" class="area" />
    <path v-if="line" :d="line" class="line" />
  </svg>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const { values, max } = defineProps<{
  values: number[]
  /** fixed scale, e.g. 1 for ratios */
  max?: number
  tone?: 'teal' | 'amber' | 'violet'
}>()

const W = 300
const H = 60

const points = computed(() => {
  const top = max ?? Math.max(...values, 1e-9)
  const step = values.length > 1 ? W / (values.length - 1) : W
  return values.map((value, index) => [index * step, H - Math.min(1, value / top) * (H - 4) - 2])
})

const line = computed(() =>
  points.value.length < 2
    ? undefined
    : points.value.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
)
const area = computed(() => (line.value === undefined ? undefined : `${line.value} L${W},${H} L0,${H} Z`))
</script>

<style lang="postcss" scoped>
.sparkline {
  --tone: var(--color-brand-item-base);
  display: block;
  width: 100%;
  height: 100%;

  &.teal {
    --tone: var(--p-chart-2);
  }

  &.amber {
    --tone: var(--p-chart-3);
  }

  &.violet {
    --tone: var(--p-chart-4);
  }
}

.line {
  fill: none;
  stroke: var(--tone);
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.area {
  fill: color-mix(in srgb, var(--tone) 14%, transparent);
}
</style>
