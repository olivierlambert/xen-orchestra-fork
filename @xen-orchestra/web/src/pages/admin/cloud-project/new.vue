<template>
  <UiHeadBar icon="fa:city">{{ t('cloud:new-project') }}</UiHeadBar>
  <CloudProjectForm :organization-id="organizationId" />
</template>

<script lang="ts" setup>
import CloudProjectForm from '@/modules/cloud/components/CloudProjectForm.vue'
import UiHeadBar from '@core/components/ui/head-bar/UiHeadBar.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()

const organizationId = computed(() => (route.query.organization as string | undefined) || undefined)
</script>
