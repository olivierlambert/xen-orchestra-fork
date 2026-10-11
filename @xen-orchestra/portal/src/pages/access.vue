<template>
  <PageHeader title="API & SSH keys" icon="fa:lock" />
  <PageContent>
    <UiCard>
      <UiCardTitle>
        API keys
        <template #info>{{ store.apiKeys.length }}</template>
        <template #description>
          For Terraform, Ansible, the CLI or your own scripts.
          {{
            store.isLive
              ? 'A key has the rights of your account: your roles in the projects of your organization.'
              : 'A key is limited to this organization and to its role.'
          }}
        </template>
      </UiCardTitle>
      <UiCard v-if="newSecret" class="secret">
        <UiInfo accent="success" wrap>Copy this key now, it won't be shown again.</UiInfo>
        <div class="secret-value">
          <code class="typo-body-regular">{{ newSecret }}</code>
          <UiButton variant="secondary" accent="brand" size="small" left-icon="fa:copy" @click="copy(newSecret)">
            {{ copied ? 'Copied' : 'Copy' }}
          </UiButton>
          <UiButton variant="tertiary" accent="brand" size="small" @click="newSecret = undefined">Done</UiButton>
        </div>
      </UiCard>
      <VtsTable :state="store.apiKeys.length === 0 ? { type: 'no-data', message: 'No API key' } : undefined">
        <thead>
          <tr>
            <VtsHeaderCell>Name</VtsHeaderCell>
            <VtsHeaderCell>Key</VtsHeaderCell>
            <VtsHeaderCell v-if="!store.isLive">Role</VtsHeaderCell>
            <VtsHeaderCell>Created</VtsHeaderCell>
            <VtsHeaderCell>Last used</VtsHeaderCell>
            <VtsHeaderCell>Actions</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="key of store.apiKeys" :key="key.id">
            <VtsTextCell>{{ key.name }}</VtsTextCell>
            <VtsTextCell>{{ key.prefix }}…</VtsTextCell>
            <VtsTextCell v-if="!store.isLive">{{ ROLES[key.role] }}</VtsTextCell>
            <VtsTextCell>{{ formatDate(key.createdAt) }}</VtsTextCell>
            <UiTableCell>
              <VtsRelativeTime v-if="key.lastUsedAt" :date="key.lastUsedAt" />
              <template v-else>Never</template>
            </UiTableCell>
            <UiTableCell>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                @click="store.revokeApiKey(key.id)"
              >
                Revoke
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div class="inline-form">
        <FormField label="Name" for="key-name">
          <UiInput id="key-name" v-model="keyName" accent="brand" />
        </FormField>
        <FormField v-if="store.isLive" label="Your password" for="key-password">
          <UiInput id="key-password" v-model="keyPassword" accent="brand" type="password" />
        </FormField>
        <FormField v-if="!store.isLive" label="Role" for="key-role">
          <NativeSelect id="key-role" v-model="keyRole">
            <option v-for="(label, role) of ROLES" :key="role" :value="role">{{ label }}</option>
          </NativeSelect>
        </FormField>
        <UiButton
          variant="secondary"
          accent="brand"
          size="medium"
          left-icon="fa:plus"
          :disabled="String(keyName ?? '').trim() === '' || (store.isLive && String(keyPassword ?? '') === '')"
          @click="createKey()"
        >
          Create API key
        </UiButton>
      </div>
    </UiCard>

    <UiCard>
      <UiCardTitle>
        SSH keys
        <template #info>{{ store.sshKeys.length }}</template>
        <template #description>Injected into new Linux instances with cloud-init.</template>
      </UiCardTitle>
      <VtsTable :state="store.sshKeys.length === 0 ? { type: 'no-data', message: 'No SSH key' } : undefined">
        <thead>
          <tr>
            <VtsHeaderCell>Name</VtsHeaderCell>
            <VtsHeaderCell>Fingerprint</VtsHeaderCell>
            <VtsHeaderCell>Added</VtsHeaderCell>
            <VtsHeaderCell>Actions</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="key of store.sshKeys" :key="key.id">
            <VtsTextCell>{{ key.name }}</VtsTextCell>
            <VtsTextCell>{{ key.fingerprint }}</VtsTextCell>
            <VtsTextCell>{{ key.createdAt ? formatDate(key.createdAt) : '-' }}</VtsTextCell>
            <UiTableCell>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                @click="store.removeSshKey(key.id)"
              >
                Remove
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div class="ssh-form">
        <FormField label="Name" for="ssh-name">
          <UiInput id="ssh-name" v-model="sshName" accent="brand" />
        </FormField>
        <FormField label="Public key" for="ssh-key">
          <UiTextarea id="ssh-key" v-model="sshPublicKey" accent="brand" />
        </FormField>
        <div>
          <UiButton
            variant="secondary"
            accent="brand"
            size="medium"
            left-icon="fa:plus"
            :disabled="!isSshKeyValid"
            @click="addSshKey()"
          >
            Add SSH key
          </UiButton>
        </div>
      </div>
    </UiCard>
  </PageContent>
</template>

<script lang="ts" setup>
import FormField from '@/components/FormField.vue'
import NativeSelect from '@/components/NativeSelect.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import type { ApiKey } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { formatDate } from '@/utils/format.ts'
import VtsRelativeTime from '@core/components/relative-time/VtsRelativeTime.vue'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import UiTextarea from '@core/components/ui/text-area/UiTextarea.vue'
import { useClipboard } from '@vueuse/core'
import { computed, ref } from 'vue'

const store = usePortalStore()
const { copy, copied } = useClipboard()

const ROLES: Record<ApiKey['role'], string> = {
  'project-admin': 'Project admin',
  'project-member': 'Project member',
  'read-only': 'Read only',
}

const keyName = ref<string | number | undefined>('')
const keyPassword = ref<string | number | undefined>('')
const keyRole = ref<string | number | undefined>('project-member')
const newSecret = ref<string>()

async function createKey() {
  newSecret.value = await store.createApiKey(
    String(keyName.value).trim(),
    keyRole.value as ApiKey['role'],
    String(keyPassword.value ?? '')
  )
  keyName.value = ''
  keyPassword.value = ''
}

const sshName = ref<string | number | undefined>('')
const sshPublicKey = ref('')

const isSshKeyValid = computed(
  () =>
    String(sshName.value ?? '').trim() !== '' &&
    /^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp\d+) [A-Za-z0-9+/=]+/.test(sshPublicKey.value.trim())
)

async function addSshKey() {
  await store.addSshKey(String(sshName.value).trim(), sshPublicKey.value.trim())
  sshName.value = ''
  sshPublicKey.value = ''
}
</script>

<style lang="postcss" scoped>
.inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1.2rem;

  > * {
    min-width: 16rem;
  }
}

.ssh-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  max-width: 64rem;
}

.secret {
  background-color: var(--color-success-background-selected);
}

.secret-value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.2rem;

  code {
    word-break: break-all;
    color: var(--color-neutral-txt-primary);
  }
}
</style>
