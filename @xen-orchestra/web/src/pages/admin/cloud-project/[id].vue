<template>
  <UiHeadBar icon="fa:city">{{ t('cloud:edit-project') }}</UiHeadBar>
  <CloudProjectForm :project-id="route.params.id" />
</template>

<script lang="ts" setup>
import CloudProjectForm from '@/modules/cloud/components/CloudProjectForm.vue'
import UiHeadBar from '@core/components/ui/head-bar/UiHeadBar.vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute('/admin/cloud-project/[id]')
</script>
