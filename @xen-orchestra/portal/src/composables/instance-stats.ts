import { xo } from '@/api/xo.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useIntervalFn } from '@vueuse/core'
import { ref, watch, type Ref } from 'vue'

type XoStats = {
  interval: number
  stats: {
    cpuUsage?: number[]
    memory?: number[]
    memoryFree?: number[]
    vifs?: { rx?: Record<string, number[]>; tx?: Record<string, number[]> }
    xvds?: { r?: Record<string, number[]>; w?: Record<string, number[]> }
  }
}

export type InstanceStats = {
  /** 0..1 */
  cpu: number[]
  /** bytes */
  memoryUsed: number[]
  memoryTotal: number
  /** bytes per second */
  networkIn: number[]
  networkOut: number[]
  diskRead: number[]
  diskWrite: number[]
}

const sumSeries = (series: Record<string, number[]> | undefined) => {
  const all = Object.values(series ?? {})
  const length = Math.max(0, ...all.map(values => values.length))
  return Array.from({ length }, (_, index) => all.reduce((sum, values) => sum + (values[index] ?? 0), 0))
}

/** Last 10 minutes of an instance, refreshed every 5 seconds while it runs (synthetic in mock mode) */
export function useInstanceStats(instanceId: Ref<string | undefined>, running: Ref<boolean>) {
  const store = usePortalStore()
  const stats = ref<InstanceStats>()

  async function refresh() {
    const id = instanceId.value
    if (id === undefined || !running.value) {
      stats.value = undefined
      return
    }
    if (!store.isLive) {
      const wave = (base: number, amplitude: number) =>
        Array.from({ length: 120 }, (_, index) =>
          Math.max(0, base + amplitude * Math.sin((Date.now() / 5000 + index) / 6) + Math.random() * amplitude * 0.4)
        )
      stats.value = {
        cpu: wave(0.18, 0.08),
        memoryUsed: wave(1.4e9, 0.2e9),
        memoryTotal: 4e9,
        networkIn: wave(40e3, 20e3),
        networkOut: wave(12e3, 6e3),
        diskRead: wave(2e3, 2e3),
        diskWrite: wave(30e3, 20e3),
      }
      return
    }
    try {
      const { stats: raw } = await xo.get<XoStats>(`/vms/${id}/stats?granularity=seconds`)
      if (id !== instanceId.value) {
        return
      }
      const memory = raw.memory ?? []
      stats.value = {
        // 0..1, XO may report odd values while a guest boots
        cpu: (raw.cpuUsage ?? []).map(value => Math.min(1, Math.max(0, value))),
        memoryUsed: memory.map((total, index) => Math.max(0, total - (raw.memoryFree?.[index] ?? 0))),
        memoryTotal: memory[memory.length - 1] ?? 0,
        networkIn: sumSeries(raw.vifs?.rx),
        networkOut: sumSeries(raw.vifs?.tx),
        diskRead: sumSeries(raw.xvds?.r),
        diskWrite: sumSeries(raw.xvds?.w),
      }
    } catch {
      // stats are a bonus: keep the last values
    }
  }

  useIntervalFn(refresh, 5000)
  watch([instanceId, running], refresh, { immediate: true })

  return stats
}

export function formatRate(bytesPerSecond: number) {
  const units = ['B/s', 'kB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export function formatBytes(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
