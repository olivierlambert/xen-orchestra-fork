# Cloud portal (prototype)

Tenant-facing self-service portal for Xen Orchestra: what a hosting provider's customer sees. It's a separate app from XO 6 (which stays the admin/operator console). It uses the same `@xen-orchestra/web-core` components and will talk to the same REST API.

**Everything is mocked**: `src/mock/` holds the data and `src/stores/portal.store.ts` stands in for the future tenant-scoped REST API, with fake latency. No xo-server is needed.

```sh
yarn dev   # http://localhost:5174
```

Press `D` to toggle dark mode.

## Screens

| Page                           | What it shows                                                                     | Backend work it needs                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dashboard                      | Quotas, month-to-date spend, activity                                             | Tenant/project model, quotas (resource sets generalized), audit per project       |
| Instances                      | List, creation from offerings and the catalog, power actions                      | Offerings (instance sizes), per-tenant catalog, RBAC scoped to project            |
| Instance › Snapshots & backups | Snapshots, subscribe to admin-defined backup policies, restore in place or as new | Self-service backup policies, scoped restore                                      |
| Instance › Console             | Placeholder                                                                       | Tenant-scoped console token (noVNC already in web-core)                           |
| Networking                     | Private networks, public IPs (1:1 NAT or port forwarding), firewall               | SDN controller + **virtual router appliance** (DHCP, NAT, floating IPs, firewall) |
| Usage                          | Per-resource consumption, CSV export                                              | Usage records API for billing tools                                               |
| API & SSH keys                 | Project-scoped API keys, SSH keys for cloud-init                                  | Tokens scoped to tenant/role, SSH key store                                       |

## Not covered yet

- Organization/project/member management (inviting users, roles)
- Provider (admin) side: defining offerings, quotas, backup policies, pricing, branding. This belongs in XO 6.
- i18n: strings are hard-coded in English for now.
