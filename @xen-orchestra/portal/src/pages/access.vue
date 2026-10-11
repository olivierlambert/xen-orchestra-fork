<template>
  <PageHeader title="SSH & API keys" subtitle="Your personal keys: they work in every project you belong to." />
  <PageContent>
    <PPanel
      title="SSH keys"
      :count="store.sshKeys.length"
      description="Installed in new instances at first boot."
      flush
    >
      <template #actions>
        <UiButton variant="secondary" accent="brand" size="small" left-icon="fa:plus" @click="sshOpen = true">
          Add SSH key
        </UiButton>
      </template>
      <ul v-if="store.sshKeys.length !== 0" class="p-list">
        <li v-for="key of store.sshKeys" :key="key.id" class="key">
          <span class="key-icon"><PIcon :icon="faKey" /></span>
          <span class="key-text">
            <span class="typo-body-bold-small">{{ key.name }}</span>
            <span class="p-caption p-muted p-mono fingerprint">{{ key.fingerprint }}</span>
          </span>
          <span class="p-caption p-muted type">{{ keyType(key.publicKey) }}</span>
          <UiButton
            variant="tertiary"
            accent="danger"
            size="small"
            left-icon="fa:trash"
            @click="store.removeSshKey(key.id)"
          >
            Remove
          </UiButton>
        </li>
      </ul>
      <EmptyState
        v-else
        :icon="faKey"
        title="No SSH key yet"
        description="Add the public key of your computer to sign in to new instances without a password."
      >
        <UiButton variant="primary" accent="brand" size="small" left-icon="fa:plus" @click="sshOpen = true">
          Add SSH key
        </UiButton>
      </EmptyState>
    </PPanel>

    <PPanel title="API keys" :count="store.apiKeys.length" flush>
      <template #description> For scripts and Terraform. A key acts as you, with your roles in each project. </template>
      <template #actions>
        <UiButton variant="secondary" accent="brand" size="small" left-icon="fa:plus" @click="openApiKey()">
          Create API key
        </UiButton>
      </template>
      <ul v-if="store.apiKeys.length !== 0" class="p-list">
        <li v-for="key of store.apiKeys" :key="key.id" class="key">
          <span class="key-icon api"><PIcon :icon="faCode" /></span>
          <span class="key-text">
            <span class="typo-body-bold-small">{{ key.name }}</span>
            <span class="p-caption p-muted"
              ><span class="p-mono">{{ key.prefix }}…</span> · created
              <VtsRelativeTime v-if="key.createdAt" :date="key.createdAt"
            /></span>
          </span>
          <span class="p-caption p-muted type">
            <template v-if="key.lastUsedAt">Used <VtsRelativeTime :date="key.lastUsedAt" /></template>
            <template v-else>Never used</template>
          </span>
          <UiButton
            variant="tertiary"
            accent="danger"
            size="small"
            left-icon="fa:xmark"
            @click="store.revokeApiKey(key.id)"
          >
            Revoke
          </UiButton>
        </li>
      </ul>
      <EmptyState
        v-else
        :icon="faCode"
        title="No API key"
        description="Automate your instances with the API, the CLI or Terraform."
      />
      <template #footer>
        <span class="typo-body-regular-small">
          Example:
          <code class="p-mono snippet">curl -H "Authorization: Bearer $KEY" {{ apiBase }}/rest/v0/projects</code>
        </span>
      </template>
    </PPanel>

    <PModal
      :open="sshOpen"
      title="Add an SSH key"
      :icon="faKey"
      description="Paste the public part, usually ~/.ssh/id_ed25519.pub"
      @close="sshOpen = false"
    >
      <label class="field">
        <span class="typo-body-bold-small">Name</span>
        <UiInput v-model="sshName" accent="brand" placeholder="laptop" />
      </label>
      <label class="field">
        <span class="typo-body-bold-small">Public key</span>
        <textarea
          v-model="sshPublicKey"
          rows="4"
          class="textarea p-mono"
          placeholder="ssh-ed25519 AAAA… you@laptop"
          spellcheck="false"
        />
        <span v-if="sshPublicKey && !isSshKeyValid" class="typo-body-regular-small error"
          >This does not look like an OpenSSH public key.</span
        >
      </label>
      <template #footer>
        <UiButton variant="secondary" accent="brand" size="medium" @click="sshOpen = false">Cancel</UiButton>
        <UiButton
          variant="primary"
          accent="brand"
          size="medium"
          :disabled="!isSshKeyValid || !sshName"
          @click="addSshKey()"
        >
          Add key
        </UiButton>
      </template>
    </PModal>

    <PModal
      :open="apiOpen"
      :title="newSecret ? 'Your new API key' : 'Create an API key'"
      :icon="faCode"
      @close="apiOpen = false"
    >
      <template v-if="newSecret">
        <div class="secret-warning typo-body-regular-small">
          <PIcon :icon="faTriangleExclamation" size="small" />
          Copy it now: it is shown only once.
        </div>
        <CopyValue :value="newSecret" mono block />
      </template>
      <template v-else>
        <label class="field">
          <span class="typo-body-bold-small">Name</span>
          <UiInput v-model="keyName" accent="brand" placeholder="terraform" />
        </label>
        <label v-if="store.isLive" class="field">
          <span class="typo-body-bold-small">Your password</span>
          <UiInput v-model="keyPassword" accent="brand" type="password" />
          <span class="typo-body-regular-small p-muted">Confirms it is you before creating a long-lived key.</span>
        </label>
      </template>
      <template #footer>
        <template v-if="newSecret">
          <UiButton variant="primary" accent="brand" size="medium" @click="apiOpen = false">Done</UiButton>
        </template>
        <template v-else>
          <UiButton variant="secondary" accent="brand" size="medium" @click="apiOpen = false">Cancel</UiButton>
          <UiButton
            variant="primary"
            accent="brand"
            size="medium"
            :busy="creatingKey"
            :disabled="String(keyName ?? '').trim() === '' || (store.isLive && String(keyPassword ?? '') === '')"
            @click="createKey()"
          >
            Create key
          </UiButton>
        </template>
      </template>
    </PModal>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import CopyValue from '@/components/ui/CopyValue.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PIcon from '@/components/ui/PIcon.vue'
import PModal from '@/components/ui/PModal.vue'
import PPanel from '@/components/ui/PPanel.vue'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import VtsRelativeTime from '@core/components/relative-time/VtsRelativeTime.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import { faCode, faKey, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { computed, ref } from 'vue'

const store = usePortalStore()
const toasts = useToasts()

// the address of the portal; on a development address, the site of the provider reads better in examples
const apiBase = computed(() => {
  if (!/^(localhost|127\.|\[::1\])/.test(location.hostname) || store.provider.supportUrl === undefined) {
    return location.origin
  }
  return new URL(store.provider.supportUrl).origin
})

const keyType = (publicKey: string | undefined) => {
  const type = publicKey?.split(' ')[0] ?? ''
  return type.replace('ssh-', '').replace('ecdsa-sha2-', 'ECDSA ').toUpperCase()
}

// SSH keys

const sshOpen = ref(false)
const sshName = ref<string | number | undefined>('')
const sshPublicKey = ref('')

const isSshKeyValid = computed(() =>
  /^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp\d+) [A-Za-z0-9+/=]+/.test(sshPublicKey.value.trim())
)

async function addSshKey() {
  const name = String(sshName.value).trim()
  await store.addSshKey(name, sshPublicKey.value.trim())
  toasts.success('SSH key added', `${name} is installed in new instances.`)
  sshOpen.value = false
  sshName.value = ''
  sshPublicKey.value = ''
}

// API keys

const apiOpen = ref(false)
const keyName = ref<string | number | undefined>('')
const keyPassword = ref<string | number | undefined>('')
const newSecret = ref<string>()
const creatingKey = ref(false)

function openApiKey() {
  keyName.value = ''
  keyPassword.value = ''
  newSecret.value = undefined
  apiOpen.value = true
}

async function createKey() {
  creatingKey.value = true
  try {
    newSecret.value = await store.createApiKey(
      String(keyName.value).trim(),
      'project-admin',
      String(keyPassword.value ?? '')
    )
  } finally {
    creatingKey.value = false
  }
}
</script>

<style lang="postcss" scoped>
.key {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem 2.4rem;
  flex-wrap: wrap;
}

.key-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: var(--p-radius-m);
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);
  flex-shrink: 0;

  &.api {
    background-color: color-mix(in srgb, var(--p-chart-2) 14%, var(--p-surface));
    color: var(--p-chart-2);
  }
}

.key-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 20rem;
  color: var(--p-text);
}

.fingerprint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type {
  min-width: 10rem;
}

.snippet {
  padding: 0.2rem 0.6rem;
  border-radius: var(--p-radius-s);
  background-color: var(--p-subtle);
  color: var(--p-text);
  overflow-wrap: anywhere;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--p-text);
}

.textarea {
  padding: 1rem 1.2rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  resize: vertical;
  outline: none;

  &:focus {
    border-color: var(--color-brand-item-base);
    box-shadow: 0 0 0 0.3rem color-mix(in srgb, var(--color-brand-item-base) 18%, transparent);
  }
}

.error {
  color: var(--color-danger-txt-base);
}

.secret-warning {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 1.2rem;
  border-radius: var(--p-radius-m);
  background-color: color-mix(in srgb, var(--color-warning-item-base) 14%, var(--p-surface));
  color: var(--color-warning-txt-base);
}
</style>
