<template>
  <span class="os-badge" :class="[os, size]" :title="label" aria-hidden="true">{{ initials }}</span>
</template>

<script lang="ts" setup>
import type { TemplateOs } from '@/mock/types.ts'
import { computed } from 'vue'

const { os } = defineProps<{
  os: TemplateOs
  size?: 'small' | 'large'
}>()

const LABELS: Record<TemplateOs, [string, string]> = {
  debian: ['Debian', 'deb'],
  ubuntu: ['Ubuntu', 'ubu'],
  rocky: ['Rocky Linux', 'rky'],
  alma: ['AlmaLinux', 'alm'],
  windows: ['Windows Server', 'win'],
}

const label = computed(() => LABELS[os]?.[0] ?? os)
const initials = computed(() => LABELS[os]?.[1] ?? os.slice(0, 2))
</script>

<style lang="postcss" scoped>
.os-badge {
  --tone: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: var(--p-radius-m);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tone) 18%, transparent),
    color-mix(in srgb, var(--tone) 8%, transparent)
  );
  box-shadow: inset 0 0 0 0.1rem color-mix(in srgb, var(--tone) 25%, transparent);
  color: color-mix(in srgb, var(--tone) 85%, var(--p-text));
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.02em;

  &.small {
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--p-radius-s);
    font-size: 1.1rem;
  }

  &.large {
    width: 4.8rem;
    height: 4.8rem;
    font-size: 1.6rem;
  }

  &.debian {
    --tone: #d70a53;
  }

  &.ubuntu {
    --tone: #e95420;
  }

  &.rocky {
    --tone: #10b981;
  }

  &.alma {
    --tone: #0f4266;
  }

  &.windows {
    --tone: #0078d4;
  }
}
</style>
