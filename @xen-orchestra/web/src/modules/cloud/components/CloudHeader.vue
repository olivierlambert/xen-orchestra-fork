<template>
  <UiHeadBar icon="fa:city">
    {{ t('cloud') }}
  </UiHeadBar>
  <TabList>
    <RouterLink v-for="tab of tabs" :key="tab.name" v-slot="{ isActive, href }" :to="{ name: tab.name }" custom>
      <UiTabItem :active="isActive" :href tag="a">
        {{ t(tab.labelKey) }}
      </UiTabItem>
    </RouterLink>
  </TabList>
</template>

<script lang="ts" setup>
import TabList from '@core/components/tab-list/TabList.vue'
import UiHeadBar from '@core/components/ui/head-bar/UiHeadBar.vue'
import UiTabItem from '@core/components/ui/tab-item/UiTabItem.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const tabs = [
  { name: '/admin/cloud/organizations', labelKey: 'organizations' },
  { name: '/admin/cloud/offerings', labelKey: 'offerings' },
  { name: '/admin/cloud/ip-pools', labelKey: 'ip-pools' },
] as const
</script>
