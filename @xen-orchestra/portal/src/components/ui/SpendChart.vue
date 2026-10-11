<template>
  <div class="spend-chart">
    <div class="plot">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="svg" role="img" :aria-label="ariaLabel">
        <defs>
          <linearGradient :id="`grad-${uid}`" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--color-brand-item-base)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--color-brand-item-base)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line v-for="tick of ticks" :key="tick.value" x1="0" :x2="W" :y1="tick.y" :y2="tick.y" class="grid" />
        <line x1="0" :x2="W" :y1="H" :y2="H" class="base" />
        <path v-if="areaPath" :d="areaPath" :fill="`url(#grad-${uid})`" />
        <path v-if="linePath" :d="linePath" class="line" />
        <path v-if="forecastPath" :d="forecastPath" class="forecast" />
      </svg>
      <span
        v-for="tick of ticks"
        :key="tick.value"
        class="tick p-caption p-muted p-num"
        :style="{ top: `${(tick.y / H) * 100}%` }"
      >
        {{ tick.label }}
      </span>
      <span v-if="last" class="marker" :style="{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }" />
      <span
        v-if="last"
        class="today p-caption p-num"
        :style="{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }"
      >
        {{ format(points[points.length - 1]) }}
      </span>
    </div>
    <div class="axis p-caption p-muted">
      <span v-for="label of xLabels" :key="label.x" :style="{ left: `${(label.x / W) * 100}%` }">{{ label.text }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { formatMoney } from '@/utils/format.ts'
import { computed, useId } from 'vue'

const {
  points,
  daysInMonth,
  forecast,
  format = formatMoney,
} = defineProps<{
  /** cumulative value (spend, vCPU-hours…) at the end of each day of the month so far */
  points: number[]
  daysInMonth: number
  /** projected total at the end of the month */
  forecast?: number
  format?: (value: number) => string
}>()

const uid = useId()
const W = 600
const H = 200
const PAD_TOP = 12

// a round scale just above the projection: 75, 80, 100…
const max = computed(() => {
  const top = Math.max(forecast ?? 0, ...points, 1) * 1.05
  const step = 10 ** Math.floor(Math.log10(top)) / 4
  return Math.ceil(top / step) * step
})

const x = (day: number) => (day / daysInMonth) * W
const y = (value: number) => H - (value / max.value) * (H - PAD_TOP)

const coords = computed(() => [{ x: 0, y: H }, ...points.map((value, index) => ({ x: x(index + 1), y: y(value) }))])
const linePath = computed(() =>
  points.length === 0
    ? undefined
    : coords.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
)
const areaPath = computed(() =>
  linePath.value === undefined ? undefined : `${linePath.value} L${x(points.length)},${H} L0,${H} Z`
)
const last = computed(() => (points.length === 0 ? undefined : coords.value[coords.value.length - 1]))
const forecastPath = computed(() =>
  forecast === undefined || last.value === undefined
    ? undefined
    : `M${last.value.x},${last.value.y} L${W},${y(forecast)}`
)

const ticks = computed(() =>
  [0.5, 1].map(ratio => ({ value: ratio, y: y(max.value * ratio), label: format(max.value * ratio) }))
)

const xLabels = computed(() => {
  const month = new Date().toLocaleString('en', { month: 'short' })
  return [1, 8, 15, 22, daysInMonth].map(day => ({ x: x(day - (day === 1 ? 1 : 0)), text: `${month} ${day}` }))
})

const ariaLabel = computed(
  () =>
    `This month: ${format(points[points.length - 1] ?? 0)}${forecast === undefined ? '' : `, about ${format(forecast)} by the end of the month`}`
)
</script>

<style lang="postcss" scoped>
.spend-chart {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  flex: 1;
  min-height: 20rem;
}

.plot {
  position: relative;
  flex: 1;
  min-height: 16rem;
}

.svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.grid {
  stroke: var(--color-neutral-border);
  stroke-dasharray: 3 4;
  vector-effect: non-scaling-stroke;
}

.base {
  stroke: var(--color-neutral-border);
  vector-effect: non-scaling-stroke;
}

.line {
  fill: none;
  stroke: var(--color-brand-item-base);
  stroke-width: 2.5;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.forecast {
  fill: none;
  stroke: var(--color-brand-item-base);
  stroke-width: 2;
  stroke-dasharray: 5 6;
  opacity: 0.5;
  vector-effect: non-scaling-stroke;
}

.tick {
  position: absolute;
  left: 0;
  transform: translateY(-130%);
}

.marker {
  position: absolute;
  width: 1.2rem;
  height: 1.2rem;
  border: 0.25rem solid var(--color-brand-item-base);
  border-radius: 50%;
  background-color: var(--p-surface);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 0.4rem color-mix(in srgb, var(--color-brand-item-base) 18%, transparent);
}

.today {
  position: absolute;
  padding: 0.2rem 0.8rem;
  border-radius: var(--p-radius-s);
  background-color: var(--p-text);
  color: var(--p-surface);
  font-weight: 600;
  transform: translate(-50%, -190%);
  white-space: nowrap;
}

.axis {
  position: relative;
  height: 1.6rem;

  span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;

    &:first-child {
      transform: none;
    }

    &:last-child {
      transform: translateX(-100%);
    }
  }
}
</style>
