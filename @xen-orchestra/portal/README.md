# Cloud portal (prototype)

Tenant-facing self-service portal for Xen Orchestra: what a hosting provider's customer sees. It's a separate app from XO 6 (which stays the admin/operator console). It uses the same `@xen-orchestra/web-core` components and talks to the same REST API.

```sh
yarn dev                                  # mock mode, http://localhost:5174
XO_URL=https://xo.example.org yarn dev    # live mode, proxies /rest to that Xen Orchestra
```

Press `D` to toggle dark mode.

## Two modes

- **Mock**: when no Xen Orchestra answers on `/rest/v0`, everything is simulated in the browser (`src/mock/`).
- **Live**: when one does, the portal shows its sign-in page and then uses the tenant model of xo-server (organizations, projects, generated project roles). Live data: projects, quota and usage, members, instances, power actions, snapshots, creating instances through `POST /projects/{id}/actions/create_vm`. Networking, backups, billing and API keys stay local previews, flagged as such in the UI, because the backend does not have them yet.

To try the live mode, an XO administrator creates an organization, a project with its scope and quota, and an organization admin:

```sh
B=https://xo.example.org/rest/v0; A="-u admin@admin.net:admin"
curl $A -H 'content-type: application/json' -d '{"name":"ACME Corp"}' $B/organizations
curl $A -H 'content-type: application/json' -d '{"organizationId":"<org>","name":"Web platform",
  "quota":{"instances":10,"vcpus":32,"memory":68719476736},
  "scope":{"pools":["<pool>"],"templates":["<template>"],"networks":["<network>"],"srs":["<sr>"]}}' $B/projects
curl $A -H 'content-type: application/json' -d '{"name":"camille@acme.example","password":"…","role":"admin"}' \
  $B/organizations/<org>/users
```

The organization admin then signs in to the portal and manages members from the Members page.

**Deployment note**: XO answers 401 with `WWW-Authenticate: Basic`, which makes browsers show their own login dialog. The dev proxy removes that header. A real deployment needs the same, or a change in the REST API (e.g. no challenge for requests that don't use Basic auth).

## Screens

| Page                           | What it shows                                                                     | Backend                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dashboard                      | Quotas, month-to-date spend, activity                                             | Quota and usage: live. Spend and activity: previews (usage records, audit)        |
| Instances                      | List, creation from offerings and the catalog, power actions                      | Live. Offerings are still a portal-side catalog                                   |
| Instance › Snapshots & backups | Snapshots, subscribe to admin-defined backup policies, restore in place or as new | Snapshots: live. Self-service backup policies and scoped restore: preview         |
| Instance › Console             | Placeholder                                                                       | Tenant-scoped console token (noVNC already in web-core)                           |
| Networking                     | Private networks, public IPs (1:1 NAT or port forwarding), firewall               | Networks of the project scope: live. **Virtual router appliance**: preview        |
| Usage                          | Per-resource consumption, CSV export                                              | Preview: usage records API for billing tools                                      |
| Members                        | Project roles, organization members, account creation                             | Live                                                                              |
| API & SSH keys                 | Project-scoped API keys, SSH keys for cloud-init                                  | Preview: tokens scoped to a project role. SSH keys added are injected at creation |

## Not covered yet

- Provider (admin) side: defining offerings, quotas, backup policies, pricing, branding. This belongs in XO 6; the REST API already has the organization and project endpoints.
- Invitation emails and password reset for accounts created by organization admins.
- i18n: strings are hard-coded in English for now.
