<template>
  <PageHeader
    title="Create an instance"
    subtitle="Ready in about a minute, with your SSH key already installed."
    :back="{ to: '/instances', label: 'Instances' }"
  />
  <PageContent>
    <div class="layout">
      <div class="steps">
        <!-- IMAGE -->
        <section class="step">
          <header class="step-head">
            <span class="step-number">1</span>
            <div>
              <h2 class="typo-h6">Image</h2>
              <p class="typo-body-regular-small p-muted">Operating systems provided by {{ store.provider.name }}</p>
            </div>
          </header>
          <div v-if="store.templates.length !== 0" class="cards images">
            <button
              v-for="item of store.templates"
              :key="item.id"
              type="button"
              class="choice"
              :class="{ selected: templateId === item.id }"
              @click="templateId = item.id"
            >
              <OsBadge :os="item.os" />
              <span class="choice-text">
                <span class="typo-body-bold">{{ item.name }} {{ item.version }}</span>
                <span class="typo-body-regular-small p-muted">{{
                  item.cloudInit ? 'Cloud image · SSH key login' : 'Password in the console'
                }}</span>
              </span>
              <PIcon v-if="templateId === item.id" :icon="faCircleCheck" class="check" />
            </button>
          </div>
          <EmptyState
            v-else
            compact
            :icon="faCompactDisc"
            title="No image available"
            :description="`Ask ${store.provider.name} to publish images for this project.`"
          />
        </section>

        <!-- SIZE -->
        <section class="step">
          <header class="step-head">
            <span class="step-number">2</span>
            <div>
              <h2 class="typo-h6">Size</h2>
              <p class="typo-body-regular-small p-muted">
                {{
                  store.showsCosts
                    ? 'Billed per hour while it exists, system disk included'
                    : 'System disk included, counted in the project quota'
                }}
              </p>
            </div>
            <div v-if="families.length > 1" class="segments">
              <button
                v-for="family of families"
                :key="family.id"
                type="button"
                class="segment typo-body-regular-small"
                :class="{ active: selectedFamily === family.id }"
                @click="selectedFamily = family.id"
              >
                {{ family.label }}
              </button>
            </div>
          </header>
          <div class="sizes" :class="{ 'no-cost': !store.showsCosts }" role="radiogroup">
            <div class="size-row size-head p-eyebrow">
              <span />
              <span>Plan</span>
              <span>vCPU</span>
              <span>Memory</span>
              <span>Disk</span>
              <span v-if="store.showsCosts" class="right">Price</span>
            </div>
            <button
              v-for="item of familyOfferings"
              :key="item.id"
              type="button"
              role="radio"
              class="size-row size"
              :class="{ selected: offeringId === item.id }"
              :aria-checked="offeringId === item.id"
              :disabled="!fitsQuota(item)"
              @click="offeringId = item.id"
            >
              <span class="radio" />
              <span class="typo-body-bold">
                {{ item.name }}
                <span v-if="!fitsQuota(item)" class="over typo-body-regular-small">over quota</span>
              </span>
              <span class="p-num">{{ item.vcpus }}</span>
              <span class="p-num">{{ item.memoryGiB }} GiB</span>
              <span class="p-num">{{ item.diskGiB }} GiB</span>
              <span v-if="store.showsCosts" class="right price">
                <span class="typo-body-bold p-num"
                  >{{ formatMoney(item.pricePerHour * 730) }}<span class="p-muted">/mo</span></span
                >
                <span class="p-caption p-muted p-num">{{ formatHourlyPrice(item.pricePerHour) }}</span>
              </span>
            </button>
          </div>
        </section>

        <!-- NETWORK & STORAGE -->
        <section class="step">
          <header class="step-head">
            <span class="step-number">3</span>
            <div>
              <h2 class="typo-h6">Network & storage</h2>
              <p class="typo-body-regular-small p-muted">Where the instance connects, and extra space for data</p>
            </div>
          </header>
          <div class="cards">
            <button
              v-for="item of store.networks"
              :key="item.id"
              type="button"
              class="choice"
              :class="{ selected: networkId === item.id }"
              @click="networkId = item.id"
            >
              <span class="choice-icon" :class="{ public: item.publicIpv4 }"
                ><PIcon :icon="item.publicIpv4 ? faGlobe : faLock"
              /></span>
              <span class="choice-text">
                <span class="typo-body-bold">{{ item.name }}</span>
                <span class="typo-body-regular-small p-muted">{{
                  item.description || (item.cidr ? `${item.cidr}, DHCP` : 'Private addressing')
                }}</span>
                <span v-if="item.publicIpv4" class="chip typo-body-regular-small">
                  Public IPv4<template v-if="store.showsCosts">
                    · {{ formatMoney(store.provider.prices.ipPerHour * 730) }}/mo</template
                  >
                </span>
              </span>
              <PIcon v-if="networkId === item.id" :icon="faCircleCheck" class="check" />
            </button>
          </div>
          <div class="storage">
            <span class="typo-body-bold-small">Additional data disk</span>
            <div class="chips">
              <button
                v-for="size of [0, 20, 50, 100, 250]"
                :key="size"
                type="button"
                class="size-chip typo-body-regular-small"
                :class="{ active: extraDisk === size }"
                :disabled="size > storageLeft"
                @click="extraDiskGiB = size"
              >
                {{ size === 0 ? 'None' : `+${size} GiB` }}
              </button>
            </div>
            <span class="typo-body-regular-small p-muted">
              <template v-if="store.showsCosts"
                >{{ formatMoney(store.provider.prices.storagePerGiBMonth) }} per GiB per month</template
              >
              <template v-if="store.showsCosts && Number.isFinite(storageLeft)"> · </template>
              <template v-if="Number.isFinite(storageLeft)">{{ storageLeft }} GiB left in the project quota</template>
            </span>
          </div>
        </section>

        <!-- ACCESS -->
        <section class="step">
          <header class="step-head">
            <span class="step-number">4</span>
            <div>
              <h2 class="typo-h6">SSH keys</h2>
              <p class="typo-body-regular-small p-muted">Installed at first boot for the default user</p>
            </div>
            <RouterLink to="/access" class="p-link typo-body-regular-small">Add a key</RouterLink>
          </header>
          <div v-if="template?.cloudInit && store.sshKeys.length !== 0" class="cards">
            <label
              v-for="key of store.sshKeys"
              :key="key.id"
              class="choice"
              :class="{ selected: sshKeyIds.includes(key.id) }"
            >
              <input v-model="sshKeyIds" type="checkbox" :value="key.id" class="p-sr-only" />
              <span class="choice-icon"><PIcon :icon="faKey" /></span>
              <span class="choice-text">
                <span class="typo-body-bold">{{ key.name }}</span>
                <span class="p-caption p-muted p-mono fingerprint">{{ key.fingerprint }}</span>
              </span>
              <span class="checkbox"><PIcon v-if="sshKeyIds.includes(key.id)" :icon="faCheck" size="small" /></span>
            </label>
          </div>
          <EmptyState
            v-else-if="template?.cloudInit"
            compact
            :icon="faKey"
            title="No SSH key in your account"
            description="Add one to sign in without a password, or use the web console."
          />
          <p v-else class="typo-body-regular-small p-muted">
            The administrator password is generated and shown in the console.
          </p>
        </section>

        <!-- BACKUPS -->
        <section class="step">
          <header class="step-head">
            <span class="step-number">5</span>
            <div>
              <h2 class="typo-h6">Backups</h2>
              <p class="typo-body-regular-small p-muted">
                Copies kept by {{ store.provider.name }}, away from the instance. Change it anytime.
              </p>
            </div>
          </header>
          <div class="cards compact">
            <button
              type="button"
              class="choice"
              :class="{ selected: backupPolicyId === undefined }"
              @click="backupPolicyId = undefined"
            >
              <span class="choice-icon muted"><PIcon :icon="faBan" /></span>
              <span class="choice-text">
                <span class="typo-body-bold">No backups</span>
                <span class="typo-body-regular-small p-muted">Snapshots only</span>
              </span>
              <PIcon v-if="backupPolicyId === undefined" :icon="faCircleCheck" class="check" />
            </button>
            <button
              v-for="policy of store.backupPolicies"
              :key="policy.id"
              type="button"
              class="choice"
              :class="{ selected: backupPolicyId === policy.id }"
              @click="backupPolicyId = policy.id"
            >
              <span class="choice-icon ok"><PIcon :icon="faShieldHalved" /></span>
              <span class="choice-text">
                <span class="typo-body-bold">{{ policy.name }}</span>
                <span class="typo-body-regular-small p-muted">{{ policy.description }}</span>
              </span>
              <PIcon v-if="backupPolicyId === policy.id" :icon="faCircleCheck" class="check" />
            </button>
          </div>
        </section>
      </div>

      <!-- SUMMARY -->
      <aside class="summary">
        <div class="summary-card">
          <label class="name-field">
            <span class="p-eyebrow">Instance name</span>
            <input v-model="name" class="name-input typo-body-bold" spellcheck="false" autocomplete="off" />
            <span class="typo-body-regular-small" :class="nameValid ? 'p-muted' : 'error'">
              {{ nameValid ? 'Also the hostname of the instance' : 'Lowercase letters, digits and hyphens' }}
            </span>
          </label>

          <dl v-if="store.showsCosts" class="lines">
            <div>
              <dt>
                {{ offering.name }}
                <span class="p-muted">· {{ offering.vcpus }} vCPU · {{ offering.memoryGiB }} GiB</span>
              </dt>
              <dd class="p-num">{{ formatMoney(offering.pricePerHour * 730) }}</dd>
            </div>
            <div v-if="extraDisk > 0">
              <dt>
                Data disk <span class="p-muted">· {{ extraDisk }} GiB</span>
              </dt>
              <dd class="p-num">{{ formatMoney(extraDisk * store.provider.prices.storagePerGiBMonth) }}</dd>
            </div>
            <div v-if="selectedNetwork?.publicIpv4">
              <dt>Public IPv4</dt>
              <dd class="p-num">{{ formatMoney(store.provider.prices.ipPerHour * 730) }}</dd>
            </div>
            <div v-if="backupPolicyId">
              <dt>{{ store.getBackupPolicy(backupPolicyId)?.name }}</dt>
              <dd class="p-muted">per GiB stored</dd>
            </div>
          </dl>

          <dl v-else class="lines">
            <div>
              <dt>{{ offering.name }}</dt>
              <dd class="p-num">{{ offering.vcpus }} vCPU · {{ offering.memoryGiB }} GiB</dd>
            </div>
            <div>
              <dt>Disks</dt>
              <dd class="p-num">{{ offering.diskGiB + extraDisk }} GiB</dd>
            </div>
            <div v-if="selectedNetwork">
              <dt>Network</dt>
              <dd>{{ selectedNetwork.name }}</dd>
            </div>
          </dl>

          <div v-if="store.showsCosts" class="total">
            <span class="p-muted typo-body-regular-small">{{
              store.billingMode === 'showback' ? 'Estimated internal cost' : 'Estimated'
            }}</span>
            <span class="total-value p-num">{{ formatMoney(monthlyTotal) }}<span class="per">/month</span></span>
            <span class="p-caption p-muted p-num">{{ formatHourlyPrice(monthlyTotal / 730) }}, billed per hour</span>
          </div>

          <div class="impact">
            <span class="p-eyebrow">Project quota after creation</span>
            <QuotaMeter
              label="Instances"
              :current="store.usage.instances"
              :pending="1"
              :total="store.quota.instances"
            />
            <QuotaMeter
              v-if="selectedNetwork?.publicIpv4"
              label="Public IPv4"
              :current="store.usage.floatingIps"
              :pending="1"
              :total="store.quota.floatingIps"
            />
            <QuotaMeter
              label="vCPU"
              :current="store.usage.vcpus"
              :pending="offering.vcpus"
              :total="store.quota.vcpus"
            />
            <QuotaMeter
              label="Memory"
              :current="store.usage.memoryGiB"
              :pending="offering.memoryGiB"
              :total="store.quota.memoryGiB"
              unit="GiB"
            />
            <QuotaMeter
              label="Storage"
              :current="store.usage.storageGiB"
              :pending="offering.diskGiB + extraDisk"
              :total="store.quota.storageGiB"
              unit="GiB"
            />
          </div>

          <div v-if="quotaError" class="error-box typo-body-regular-small">
            <PIcon :icon="faTriangleExclamation" size="small" />
            {{ quotaError }}
          </div>
          <div v-else-if="store.project.role === 'viewer'" class="error-box typo-body-regular-small">
            <PIcon :icon="faLock" size="small" />
            Viewers cannot create instances in {{ store.project.name }}.
          </div>

          <UiButton
            variant="primary"
            accent="brand"
            size="medium"
            class="create"
            :busy="creating"
            :disabled="!canCreate"
            left-icon="fa:plus"
            @click="create()"
          >
            {{ creating ? 'Creating…' : 'Create instance' }}
          </UiButton>
        </div>
      </aside>
    </div>
  </PageContent>
</template>

<script lang="ts" setup>
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import OsBadge from '@/components/ui/OsBadge.vue'
import PIcon from '@/components/ui/PIcon.vue'
import QuotaMeter from '@/components/ui/QuotaMeter.vue'
import type { Offering } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import { useToasts } from '@/stores/toasts.store.ts'
import { formatHourlyPrice, formatMoney } from '@/utils/format.ts'
import UiButton from '@core/components/ui/button/UiButton.vue'
import {
  faBan,
  faCheck,
  faCircleCheck,
  faCompactDisc,
  faGlobe,
  faKey,
  faLock,
  faShieldHalved,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const store = usePortalStore()
const toasts = useToasts()
const router = useRouter()

const FAMILIES: { id: Offering['family']; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'compute', label: 'CPU' },
  { id: 'memory', label: 'Memory' },
]

// only the families the provider sells
const families = computed(() => FAMILIES.filter(family => store.offerings.some(item => item.family === family.id)))

const templateId = ref(store.templates[0]?.id)
const selectedFamily = ref<Offering['family']>('general')
const offeringId = ref(store.offerings[0]?.id)
const networkId = ref(store.networks[0]?.id)
const extraDiskGiB = ref(0)
const sshKeyIds = ref(store.sshKeys.map(key => key.id))
const backupPolicyId = ref<string | undefined>(store.backupPolicies[0]?.id)
const name = ref(suggestName())
const creating = ref(false)

/** next free name in the most used series of the project, e.g. web-03 after web-01 and web-02 */
function suggestName() {
  const taken = new Set(store.instances.map(instance => instance.name))
  const series = new Map<string, number>()
  for (const name of taken) {
    const prefix = /^(.*?)-?\d+$/.exec(name)?.[1]
    if (prefix) {
      series.set(prefix, (series.get(prefix) ?? 0) + 1)
    }
  }
  const prefix = [...series].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'instance'
  for (let i = 1; ; i++) {
    const candidate = `${prefix}-${String(i).padStart(2, '0')}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

const template = computed(() => (templateId.value === undefined ? undefined : store.getTemplate(templateId.value)))
const selectedNetwork = computed(() => (networkId.value === undefined ? undefined : store.getNetwork(networkId.value)))

// the live templates, networks, offerings and keys arrive after the page may have been opened
watch(
  () => [store.templates, store.networks, store.offerings] as const,
  ([templates, networks, offerings]) => {
    if (!templates.some(item => item.id === templateId.value)) {
      templateId.value = templates[0]?.id
    }
    if (!networks.some(item => item.id === networkId.value)) {
      networkId.value = networks[0]?.id
    }
    if (!offerings.some(item => item.id === offeringId.value)) {
      offeringId.value = offerings[0]?.id
      selectedFamily.value = offerings[0]?.family ?? 'general'
    }
  },
  { immediate: true }
)
watch(
  () => store.sshKeys,
  keys => {
    if (sshKeyIds.value.length === 0) {
      sshKeyIds.value = keys.map(key => key.id)
    }
  }
)
watch(
  () => store.backupPolicies,
  policies => {
    if (backupPolicyId.value === undefined && policies.length !== 0) {
      backupPolicyId.value = policies[0].id
    }
  },
  { once: true }
)

const offering = computed(() => store.getOffering(offeringId.value!))
const familyOfferings = computed(() => store.offerings.filter(offering => offering.family === selectedFamily.value))
const extraDisk = computed(() => Math.max(0, Number(extraDiskGiB.value) || 0))
const storageLeft = computed(() => store.quota.storageGiB - store.usage.storageGiB - (offering.value?.diskGiB ?? 0))

const monthlyTotal = computed(
  () =>
    offering.value.pricePerHour * 730 +
    extraDisk.value * store.provider.prices.storagePerGiBMonth +
    (selectedNetwork.value?.publicIpv4 ? store.provider.prices.ipPerHour * 730 : 0)
)

function fitsQuota(offering: Offering) {
  const { usage, quota } = store
  return usage.vcpus + offering.vcpus <= quota.vcpus && usage.memoryGiB + offering.memoryGiB <= quota.memoryGiB
}

const quotaError = computed(() => {
  const { usage, quota } = store
  if (usage.instances >= quota.instances) {
    return `The project has reached its ${quota.instances} instances. Delete one or ask ${store.provider.name} for more.`
  }
  if (!fitsQuota(offering.value)) {
    return 'This size exceeds the vCPU or memory quota of the project.'
  }
  if (usage.storageGiB + offering.value.diskGiB + extraDisk.value > quota.storageGiB) {
    return 'Not enough storage quota left for these disks.'
  }
  if (selectedNetwork.value?.publicIpv4 && usage.floatingIps >= quota.floatingIps) {
    return `All the public IPv4 of the project are used (${quota.floatingIps}). Pick the private network or ask ${store.provider.name}.`
  }
  return undefined
})

const nameValid = computed(() => /^[a-z0-9][a-z0-9-]{0,62}$/.test(name.value))

const canCreate = computed(
  () =>
    quotaError.value === undefined &&
    store.project.role !== 'viewer' &&
    templateId.value !== undefined &&
    networkId.value !== undefined &&
    nameValid.value &&
    !creating.value
)

async function create() {
  creating.value = true
  try {
    const instance = await store.createInstance({
      name: name.value,
      offeringId: offeringId.value,
      templateId: templateId.value!,
      networkId: networkId.value!,
      extraDiskGiB: extraDisk.value,
      backupPolicyId: backupPolicyId.value,
      sshKeyIds: template.value?.cloudInit ? sshKeyIds.value : [],
    })
    if (instance !== undefined) {
      toasts.success(`${instance.name} is booting`, 'It reports its address in a few seconds.')
      await router.push(`/instances/${instance.id}`)
    }
  } finally {
    creating.value = false
  }
}
</script>

<style lang="postcss" scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38rem;
  gap: var(--p-gap);
  align-items: start;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--p-gap);
  min-width: 0;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  padding: 2.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-l);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation);
  animation: p-fade-up 0.25s ease-out both;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  color: var(--p-text);

  > div:not(.segments) {
    flex: 1;
  }
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);
  font-weight: 700;
  flex-shrink: 0;
}

.segments {
  display: flex;
  padding: 0.3rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-subtle);
}

.segment {
  padding: 0.5rem 1.2rem;
  border: none;
  border-radius: var(--p-radius-s);
  background: transparent;
  color: var(--p-muted);
  cursor: pointer;

  &.active {
    background-color: var(--p-surface);
    color: var(--p-text);
    box-shadow: var(--p-elevation);
    font-weight: 600;
  }
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
  gap: 1.2rem;

  &.compact {
    grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
  }
}

.choice {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 1.2rem;
  padding: 1.6rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  text-align: start;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background-color 0.12s,
    box-shadow 0.12s;

  &:hover {
    border-color: color-mix(in srgb, var(--color-brand-item-base) 50%, var(--color-neutral-border));
  }

  &.selected {
    border-color: var(--color-brand-item-base);
    background-color: var(--p-brand-softer);
    box-shadow: 0 0 0 0.1rem var(--color-brand-item-base);
  }

  &:focus-within {
    outline: none;
  }
}

.choice-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}

.choice-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: var(--p-radius-m);
  background-color: var(--p-subtle);
  color: var(--p-muted);
  flex-shrink: 0;

  &.public {
    background-color: var(--p-brand-soft);
    color: var(--color-brand-txt-base);
  }

  &.ok {
    background-color: color-mix(in srgb, var(--color-success-item-base) 14%, var(--p-surface));
    color: var(--color-success-txt-base);
  }
}

.check {
  color: var(--color-brand-txt-base);
}

.checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 0.2rem solid var(--color-neutral-border);
  border-radius: 0.4rem;
  color: #fff;
  flex-shrink: 0;

  .selected & {
    border-color: var(--color-brand-item-base);
    background-color: var(--color-brand-item-base);
    color: var(--color-brand-txt-item);
  }
}

.fingerprint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip {
  align-self: flex-start;
  margin-top: 0.6rem;
  padding: 0.2rem 0.8rem;
  border-radius: 99rem;
  background-color: var(--p-brand-soft);
  color: var(--color-brand-txt-base);
}

.sizes {
  display: flex;
  flex-direction: column;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  overflow: hidden;
}

.size-row {
  display: grid;
  grid-template-columns: 2.4rem minmax(12rem, 1.4fr) 0.6fr 0.8fr 0.8fr minmax(10rem, 1fr);
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem 1.6rem;
  color: var(--p-text);
  text-align: start;
}

.no-cost .size-row {
  grid-template-columns: 2.4rem minmax(12rem, 1.4fr) 0.6fr 0.8fr 0.8fr;
}

.size-head {
  padding-block: 1rem;
  background-color: var(--p-subtle);
}

.size {
  border: none;
  border-block-start: var(--p-border);
  background-color: var(--p-surface);
  cursor: pointer;
  transition: background-color 0.12s;

  &:hover:not(:disabled) {
    background-color: var(--p-brand-softer);
  }

  &.selected {
    background-color: var(--p-brand-soft);
  }

  &:disabled {
    cursor: not-allowed;
    color: var(--p-muted);
  }
}

.radio {
  width: 1.8rem;
  height: 1.8rem;
  border: 0.2rem solid var(--color-neutral-border);
  border-radius: 50%;

  .selected & {
    border: 0.5rem solid var(--color-brand-item-base);
  }
}

.over {
  margin-inline-start: 0.6rem;
  color: var(--color-danger-txt-base);
  font-weight: 400;
}

.right {
  justify-self: end;
  text-align: end;
}

.price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.storage {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-top: 0.8rem;
  color: var(--p-text);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.size-chip {
  padding: 0.6rem 1.4rem;
  border: var(--p-border);
  border-radius: 99rem;
  background-color: var(--p-surface);
  color: var(--p-text);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--color-brand-item-base);
  }

  &.active {
    border-color: var(--color-brand-item-base);
    background-color: var(--color-brand-item-base);
    color: var(--color-brand-txt-item);
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.summary {
  position: sticky;
  top: 2.4rem;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2.4rem;
  border: var(--p-border);
  border-radius: var(--p-radius-l);
  background-color: var(--p-surface);
  box-shadow: var(--p-elevation-high);
}

.name-field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.name-input {
  width: 100%;
  padding: 0.8rem 1.2rem;
  border: var(--p-border);
  border-radius: var(--p-radius-m);
  background-color: var(--p-surface);
  color: var(--p-text);
  outline: none;

  &:focus {
    border-color: var(--color-brand-item-base);
    box-shadow: 0 0 0 0.3rem color-mix(in srgb, var(--color-brand-item-base) 18%, transparent);
  }
}

.error {
  color: var(--color-danger-txt-base);
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-block: 1.6rem;
  border-block: var(--p-border);

  > div {
    display: flex;
    justify-content: space-between;
    gap: 1.2rem;
    font-size: 1.4rem;
    color: var(--p-text);
  }

  dd {
    white-space: nowrap;
  }
}

.total {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.total-value {
  font-size: 3.2rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--p-text);

  .per {
    font-size: 1.6rem;
    font-weight: 400;
    color: var(--p-muted);
  }
}

.impact {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.error-box {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1.2rem;
  border-radius: var(--p-radius-m);
  background-color: color-mix(in srgb, var(--color-danger-item-base) 10%, var(--p-surface));
  color: var(--color-danger-txt-base);

  svg {
    margin-top: 0.3rem;
  }
}

.create {
  width: 100%;
  justify-content: center;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .summary {
    position: static;
  }
}

@media (max-width: 640px) {
  .step {
    padding: 1.6rem;
  }

  .step-head {
    flex-wrap: wrap;
  }

  .size-row {
    grid-template-columns: 2.4rem 1fr 0.5fr auto;

    > :nth-child(4),
    > :nth-child(5) {
      display: none;
    }
  }
}
</style>
