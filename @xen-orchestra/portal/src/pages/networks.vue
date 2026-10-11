<template>
  <PageHeader title="Networking" icon="fa:network-wired" />
  <PageContent>
    <PreviewNotice>
      Preview: the private networks below are the networks your provider made available to the project, and public IPs
      are given to instances at creation from the pools of the project. Virtual routers, floating IPs, port forwarding
      and firewall rules are not in Xen Orchestra yet: changes on this page stay in your browser.
    </PreviewNotice>
    <!-- PRIVATE NETWORKS -->
    <UiCard>
      <UiCardTitle>
        Private networks
        <template #info>{{ store.networks.length }}</template>
        <template #description>
          Isolated networks (SDN overlay). Each one has a managed virtual router for DHCP, DNS, outbound NAT and
          firewall.
        </template>
      </UiCardTitle>
      <VtsTable>
        <thead>
          <tr>
            <VtsHeaderCell>Name</VtsHeaderCell>
            <VtsHeaderCell>CIDR</VtsHeaderCell>
            <VtsHeaderCell>Gateway</VtsHeaderCell>
            <VtsHeaderCell>Instances</VtsHeaderCell>
            <VtsHeaderCell>Router</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="network of store.networks" :key="network.id">
            <VtsTextCell>{{ network.name }}</VtsTextCell>
            <VtsTextCell>{{ network.cidr }}</VtsTextCell>
            <VtsTextCell>{{ network.gateway }}</VtsTextCell>
            <VtsTextCell>
              {{ store.instances.filter(instance => instance.networkId === network.id).length }}
            </VtsTextCell>
            <UiTableCell>
              <UiTag :accent="network.routerState === 'running' ? 'success' : 'info'" variant="secondary">
                {{ network.routerState === 'running' ? 'Running' : 'Starting' }}
              </UiTag>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div class="inline-form">
        <FormField label="Name" for="net-name">
          <UiInput id="net-name" v-model="newNetwork.name" accent="brand" />
        </FormField>
        <FormField label="CIDR" for="net-cidr">
          <UiInput id="net-cidr" v-model="newNetwork.cidr" accent="brand" />
        </FormField>
        <UiButton
          variant="secondary"
          accent="brand"
          size="medium"
          left-icon="fa:plus"
          :disabled="!isNetworkValid"
          @click="createNetwork()"
        >
          Create network
        </UiButton>
      </div>
    </UiCard>

    <!-- PUBLIC IPS -->
    <UiCard>
      <UiCardTitle>
        Public IPs
        <template #info>{{ store.floatingIps.length }} / {{ store.quota.floatingIps }}</template>
        <template #description>
          Attach an IP to one instance (1:1 NAT), or keep it on the router and forward ports to several instances.
        </template>
      </UiCardTitle>
      <VtsTable :state="store.floatingIps.length === 0 ? { type: 'no-data', message: 'No public IP' } : undefined">
        <thead>
          <tr>
            <VtsHeaderCell>Address</VtsHeaderCell>
            <VtsHeaderCell>Attached to</VtsHeaderCell>
            <VtsHeaderCell>Port forwards</VtsHeaderCell>
            <VtsHeaderCell>Actions</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="ip of store.floatingIps" :key="ip.id">
            <VtsTextCell>{{ ip.address }}</VtsTextCell>
            <UiTableCell>
              <NativeSelect
                :model-value="ip.instanceId ?? ''"
                @update:model-value="value => store.attachFloatingIp(ip.id, value ? String(value) : undefined)"
              >
                <option value="">Router (port forwarding)</option>
                <option v-for="instance of store.instances" :key="instance.id" :value="instance.id">
                  {{ instance.name }} ({{ instance.privateIp }})
                </option>
              </NativeSelect>
            </UiTableCell>
            <VtsTextCell>{{ forwardsOf(ip.id).length }}</VtsTextCell>
            <UiTableCell>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                @click="store.releaseFloatingIp(ip.id)"
              >
                Release
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div>
        <UiButton
          variant="secondary"
          accent="brand"
          size="medium"
          left-icon="fa:plus"
          :disabled="store.floatingIps.length >= store.quota.floatingIps"
          @click="store.allocateFloatingIp()"
        >
          Allocate public IP
        </UiButton>
      </div>
    </UiCard>

    <!-- PORT FORWARDING -->
    <UiCard>
      <UiCardTitle>
        Port forwarding
        <template #info>{{ projectForwards.length }}</template>
      </UiCardTitle>
      <VtsTable :state="projectForwards.length === 0 ? { type: 'no-data', message: 'No port forward' } : undefined">
        <thead>
          <tr>
            <VtsHeaderCell>Public</VtsHeaderCell>
            <VtsHeaderCell>Protocol</VtsHeaderCell>
            <VtsHeaderCell>Instance</VtsHeaderCell>
            <VtsHeaderCell>Actions</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="forward of projectForwards" :key="forward.id">
            <VtsTextCell>{{ ipAddress(forward.floatingIpId) }}:{{ forward.publicPort }}</VtsTextCell>
            <VtsTextCell>{{ forward.protocol.toUpperCase() }}</VtsTextCell>
            <VtsLinkCell :to="`/instances/${forward.instanceId}`">
              {{ store.getInstance(forward.instanceId)?.name }}:{{ forward.privatePort }}
            </VtsLinkCell>
            <UiTableCell>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                @click="store.removePortForward(forward.id)"
              >
                Remove
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div v-if="routerIps.length > 0" class="inline-form">
        <FormField label="Public IP" for="pf-ip">
          <NativeSelect id="pf-ip" v-model="newForward.floatingIpId">
            <option v-for="ip of routerIps" :key="ip.id" :value="ip.id">{{ ip.address }}</option>
          </NativeSelect>
        </FormField>
        <FormField label="Protocol" for="pf-proto">
          <NativeSelect id="pf-proto" v-model="newForward.protocol">
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </NativeSelect>
        </FormField>
        <FormField label="Public port" for="pf-public">
          <UiInput id="pf-public" v-model="newForward.publicPort" accent="brand" type="number" />
        </FormField>
        <FormField label="Instance" for="pf-instance">
          <NativeSelect id="pf-instance" v-model="newForward.instanceId">
            <option v-for="instance of store.instances" :key="instance.id" :value="instance.id">
              {{ instance.name }}
            </option>
          </NativeSelect>
        </FormField>
        <FormField label="Private port" for="pf-private">
          <UiInput id="pf-private" v-model="newForward.privatePort" accent="brand" type="number" />
        </FormField>
        <UiButton
          variant="secondary"
          accent="brand"
          size="medium"
          left-icon="fa:plus"
          :disabled="!isForwardValid"
          @click="addForward()"
        >
          Add
        </UiButton>
      </div>
      <UiInfo v-else accent="info">Keep a public IP on the router to forward ports.</UiInfo>
      <UiInfo v-if="forwardConflict" accent="warning">This public port is already forwarded on this IP.</UiInfo>
    </UiCard>

    <!-- FIREWALL -->
    <UiCard>
      <UiCardTitle>
        Firewall
        <template #description>Inbound rules applied by the router, evaluated top to bottom.</template>
      </UiCardTitle>
      <TabList>
        <UiTabItem
          v-for="network of store.networks"
          :key="network.id"
          :active="firewallNetworkId === network.id"
          @click="firewallNetworkId = network.id"
        >
          {{ network.name }}
        </UiTabItem>
      </TabList>
      <VtsTable
        :state="
          networkRules.length === 0
            ? { type: 'no-data', message: 'No rule: all inbound traffic is blocked' }
            : undefined
        "
      >
        <thead>
          <tr>
            <VtsHeaderCell>Action</VtsHeaderCell>
            <VtsHeaderCell>Protocol</VtsHeaderCell>
            <VtsHeaderCell>Ports</VtsHeaderCell>
            <VtsHeaderCell>Source</VtsHeaderCell>
            <VtsHeaderCell>Actions</VtsHeaderCell>
          </tr>
        </thead>
        <tbody>
          <VtsRow v-for="rule of networkRules" :key="rule.id">
            <VtsStatusCell :status="rule.action === 'allow' ? 'allow' : 'drop'" />
            <VtsTextCell>{{ rule.protocol.toUpperCase() }}</VtsTextCell>
            <VtsTextCell>{{ rule.ports }}</VtsTextCell>
            <VtsTextCell>{{ rule.source }}</VtsTextCell>
            <UiTableCell>
              <UiButton
                variant="tertiary"
                accent="danger"
                size="small"
                left-icon="fa:trash"
                @click="store.removeFirewallRule(rule.id)"
              >
                Remove
              </UiButton>
            </UiTableCell>
          </VtsRow>
        </tbody>
      </VtsTable>
      <div class="inline-form">
        <FormField label="Action" for="fw-action">
          <NativeSelect id="fw-action" v-model="newRule.action">
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </NativeSelect>
        </FormField>
        <FormField label="Protocol" for="fw-proto">
          <NativeSelect id="fw-proto" v-model="newRule.protocol">
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="icmp">ICMP</option>
            <option value="any">Any</option>
          </NativeSelect>
        </FormField>
        <FormField label="Ports" for="fw-ports" info="e.g. 443 or 8000-8100">
          <UiInput id="fw-ports" v-model="newRule.ports" accent="brand" />
        </FormField>
        <FormField label="Source CIDR" for="fw-source">
          <UiInput id="fw-source" v-model="newRule.source" accent="brand" />
        </FormField>
        <UiButton variant="secondary" accent="brand" size="medium" left-icon="fa:plus" @click="addRule()">
          Add rule
        </UiButton>
      </div>
    </UiCard>
  </PageContent>
</template>

<script lang="ts" setup>
import FormField from '@/components/FormField.vue'
import NativeSelect from '@/components/NativeSelect.vue'
import PageContent from '@/components/PageContent.vue'
import PageHeader from '@/components/PageHeader.vue'
import PreviewNotice from '@/components/PreviewNotice.vue'
import type { FirewallRule, Protocol } from '@/mock/types.ts'
import { usePortalStore } from '@/stores/portal.store.ts'
import TabList from '@core/components/tab-list/TabList.vue'
import VtsHeaderCell from '@core/components/table/cells/VtsHeaderCell.vue'
import VtsLinkCell from '@core/components/table/cells/VtsLinkCell.vue'
import VtsStatusCell from '@core/components/table/cells/VtsStatusCell.vue'
import VtsTextCell from '@core/components/table/cells/VtsTextCell.vue'
import VtsRow from '@core/components/table/VtsRow.vue'
import VtsTable from '@core/components/table/VtsTable.vue'
import UiButton from '@core/components/ui/button/UiButton.vue'
import UiCard from '@core/components/ui/card/UiCard.vue'
import UiCardTitle from '@core/components/ui/card-title/UiCardTitle.vue'
import UiInfo from '@core/components/ui/info/UiInfo.vue'
import UiInput from '@core/components/ui/input/UiInput.vue'
import UiTabItem from '@core/components/ui/tab-item/UiTabItem.vue'
import UiTableCell from '@core/components/ui/table-cell/UiTableCell.vue'
import UiTag from '@core/components/ui/tag/UiTag.vue'
import { computed, reactive, ref, watch } from 'vue'

const store = usePortalStore()

const isPort = (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 65536

// Networks

const newNetwork = reactive<{ name: string | number | undefined; cidr: string | number | undefined }>({
  name: '',
  cidr: '10.30.0.0/24',
})

const isNetworkValid = computed(
  () =>
    /^[a-z0-9][a-z0-9-]*$/.test(String(newNetwork.name ?? '')) &&
    /^\d+\.\d+\.\d+\.0\/(1[6-9]|2[0-4])$/.test(String(newNetwork.cidr ?? ''))
)

async function createNetwork() {
  await store.createNetwork({ name: String(newNetwork.name), cidr: String(newNetwork.cidr) })
  newNetwork.name = ''
}

// Public IPs and port forwarding

const ipAddress = (id: string) => store.floatingIps.find(ip => ip.id === id)?.address
const forwardsOf = (ipId: string) => store.portForwards.filter(forward => forward.floatingIpId === ipId)

const routerIps = computed(() => store.floatingIps.filter(ip => ip.instanceId === undefined))
const projectForwards = computed(() => store.floatingIps.flatMap(ip => forwardsOf(ip.id)))

const newForward = reactive<{
  floatingIpId: string | number | undefined
  protocol: string | number | undefined
  publicPort: string | number | undefined
  instanceId: string | number | undefined
  privatePort: string | number | undefined
}>({
  floatingIpId: undefined,
  protocol: 'tcp',
  publicPort: 8080,
  instanceId: undefined,
  privatePort: 80,
})

watch(
  [routerIps, () => store.instances],
  ([ips, instances]) => {
    if (!ips.some(ip => ip.id === newForward.floatingIpId)) {
      newForward.floatingIpId = ips[0]?.id
    }
    if (!instances.some(instance => instance.id === newForward.instanceId)) {
      newForward.instanceId = instances[0]?.id
    }
  },
  { immediate: true }
)

const forwardConflict = computed(() =>
  store.portForwards.some(
    forward =>
      forward.floatingIpId === newForward.floatingIpId &&
      forward.protocol === newForward.protocol &&
      forward.publicPort === Number(newForward.publicPort)
  )
)

const isForwardValid = computed(
  () =>
    newForward.floatingIpId !== undefined &&
    newForward.instanceId !== undefined &&
    isPort(newForward.publicPort) &&
    isPort(newForward.privatePort) &&
    !forwardConflict.value
)

function addForward() {
  store.addPortForward({
    floatingIpId: String(newForward.floatingIpId),
    protocol: newForward.protocol as Protocol,
    publicPort: Number(newForward.publicPort),
    instanceId: String(newForward.instanceId),
    privatePort: Number(newForward.privatePort),
  })
}

// Firewall

const firewallNetworkId = ref(store.networks[0]?.id)

watch(
  () => store.networks,
  networks => {
    if (!networks.some(network => network.id === firewallNetworkId.value)) {
      firewallNetworkId.value = networks[0]?.id
    }
  }
)

const networkRules = computed(() => store.firewallRules.filter(rule => rule.networkId === firewallNetworkId.value))

const newRule = reactive<{
  action: string | number | undefined
  protocol: string | number | undefined
  ports: string | number | undefined
  source: string | number | undefined
}>({
  action: 'allow',
  protocol: 'tcp',
  ports: '443',
  source: '0.0.0.0/0',
})

function addRule() {
  if (firewallNetworkId.value === undefined) {
    return
  }
  store.addFirewallRule({
    networkId: firewallNetworkId.value,
    action: newRule.action as FirewallRule['action'],
    protocol: newRule.protocol as FirewallRule['protocol'],
    ports: newRule.protocol === 'icmp' || newRule.protocol === 'any' ? '*' : String(newRule.ports),
    source: String(newRule.source),
  })
}
</script>

<style lang="postcss" scoped>
.inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1.2rem;

  > * {
    min-width: 14rem;
  }
}
</style>
