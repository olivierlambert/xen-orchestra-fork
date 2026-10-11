<template>
  <PMenu class="project-switcher">
    <template #trigger="{ open }">
      <button type="button" class="current" :aria-expanded="open">
        <span class="mark">{{ store.organization.name.slice(0, 1) }}</span>
        <span class="names">
          <span class="org p-caption">{{ store.organization.name }}</span>
          <span class="project typo-body-bold-small">{{ store.project?.name ?? 'No project' }}</span>
        </span>
        <PIcon :icon="faChevronDown" size="small" class="chevron" :class="{ open }" />
      </button>
    </template>
    <div class="menu-head p-eyebrow">Projects</div>
    <PMenuItem
      v-for="project of store.projects"
      :key="project.id"
      :icon="faLayerGroup"
      :active="project.id === store.currentProjectId"
      :hint="ROLE_LABELS[project.role]"
      @click="select(project.id)"
    >
      {{ project.name }}
    </PMenuItem>
  </PMenu>
</template>

<script lang="ts" setup>
import PIcon from '@/components/ui/PIcon.vue'
import PMenu from '@/components/ui/PMenu.vue'
import PMenuItem from '@/components/ui/PMenuItem.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { faChevronDown, faLayerGroup } from '@fortawesome/free-solid-svg-icons'
import { useRouter } from 'vue-router'

const store = usePortalStore()
const router = useRouter()

const ROLE_LABELS = { viewer: 'Viewer', member: 'Member', admin: 'Admin' } as const

function select(id: string) {
  if (id !== store.currentProjectId) {
    store.currentProjectId = id
    router.push('/dashboard')
  }
}
</script>

<style lang="postcss" scoped>
.project-switcher {
  width: 100%;

  :deep(.panel) {
    width: 100%;
  }
}

.current {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  cursor: pointer;
  text-align: start;

  &:hover {
    border-color: color-mix(in srgb, var(--color-brand-item-base) 45%, var(--color-neutral-border));
  }
}

.mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: var(--p-radius-s);
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}

.names {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.org {
  color: var(--p-muted);
}

.chevron {
  color: var(--p-muted);
  transition: transform 0.15s;

  &.open {
    transform: rotate(180deg);
  }
}

.menu-head {
  padding: 0.6rem 1rem;
}
</style>
