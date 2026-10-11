<template>
  <label class="project-switcher">
    <VtsIcon name="fa:layer-group" size="medium" />
    <span class="sr-only">Project</span>
    <select v-model="store.currentProjectId" class="select typo-body-bold">
      <option v-for="project of projects" :key="project.id" :value="project.id">{{ project.name }}</option>
    </select>
  </label>
</template>

<script lang="ts" setup>
import { projects } from '@/mock/data.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import VtsIcon from '@core/components/icon/VtsIcon.vue'

const store = usePortalStore()
</script>

<style lang="postcss" scoped>
.project-switcher {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.4rem 0.8rem;
  border: 0.1rem solid var(--color-neutral-border);
  border-radius: 0.4rem;
  background-color: var(--color-neutral-background-primary);
  color: var(--color-neutral-txt-secondary);

  .select {
    border: none;
    background: transparent;
    color: var(--color-neutral-txt-primary);
    cursor: pointer;
    outline: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}
</style>
