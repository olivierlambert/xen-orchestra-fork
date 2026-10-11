# Cloud portal (prototype)

Tenant-facing self-service portal for Xen Orchestra: what a hosting provider's customer sees. It's a separate app from XO 6 (which stays the admin/operator console, with the provider pages under Administration › Cloud). It uses the same `@xen-orchestra/web-core` components and talks to the same REST API.

```sh
yarn dev                                  # mock mode, http://localhost:5174
XO_URL=https://xo.example.org yarn dev    # live mode, proxies /rest and the consoles to that Xen Orchestra
```

Press `D` to toggle dark mode. See [ROADMAP.md](./ROADMAP.md) for what comes next.

## Two modes

- **Mock**: when no Xen Orchestra answers on `/rest/v0`, everything is simulated in the browser (`src/mock/`).
- **Live**: when one does, the portal shows its sign-in page and uses the tenant model of xo-server. Everything is live except the virtual router features of the Networking page (private networks with DHCP/NAT, floating IPs, port forwarding, firewall), which stay local previews flagged as such.

## Setting up a customer

In XO 6, **Administration › Cloud**:

1. **Offerings**: the instance sizes and their prices.
2. **IP pools**: public addresses, with gateway, prefix length and DNS so that XO configures them in the guests with cloud-init.
3. **Organizations**: create the customer, then a project with its quota and scope (pools, templates, networks, SRs, offerings, IP pools, backup jobs), then the first organization admin account.

Backup policies are smart backup jobs selecting VMs by a tag (`vms.tags`), created in XO as usual and listed in the project scope. Instances are subscribed from the portal.

The organization admin then signs in to the portal, creates the accounts of their team and gives them project roles.

## Deployment

The portal is a static app. Serve its build with xo-server as a public mount (it has its own sign-in page), and configure branding, prices and usage sampling:

```toml
[http.publicMounts]
'/portal' = '/path/to/@xen-orchestra/portal/dist'

[portal]
name = 'Nimbus Hosting'
logoUrl = '/portal/logo.svg'
supportUrl = 'https://nimbus.example/support'
color = '#0b7a75'
currency = 'EUR'

[portal.prices]
storagePerGiBMonth = 0.04
snapshotPerGiBMonth = 0.03
ipPerHour = 0.005

[projects]
# default: 1 hour
usageSamplingInterval = '1 hour'
```

The REST API does not send a Basic challenge to requests marked `X-Requested-With: XMLHttpRequest`, so browsers don't show their own login dialog over the portal.

## Screens

| Page                           | What it shows                                                                    | Backend                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Dashboard                      | Quotas, month-to-date spend, activity                                            | Live quota and usage; activity is the actions of this session            |
| Instances                      | List, creation from the provider offerings and images, power actions, public IPs | Live (`POST /projects/{id}/actions/create_vm`)                           |
| Instance › Snapshots & backups | Snapshots, subscription to backup policies, restore as a new instance            | Live                                                                     |
| Instance › Console             | noVNC console                                                                    | Live, project members can open the console of their instances            |
| Networking                     | Private networks, floating IPs, port forwarding, firewall                        | Networks of the project scope live, **virtual router** features preview  |
| Usage                          | Month to date per resource, CSV export                                           | Live, from the hourly usage records (`GET /projects/{id}/usage-records`) |
| Members                        | Project roles, organization members, accounts, password reset                    | Live                                                                     |
| API & SSH keys                 | API keys (XO tokens with the rights of the account), SSH keys for cloud-init     | Live (`/account/tokens`, `/account/ssh-keys`)                            |
| Account                        | Profile, password change                                                         | Live                                                                     |

## Not covered yet

- Invitation emails and self-service password reset: organization admins create accounts and reset passwords.
- Restoring a backup in place: restores create a new instance.
- i18n: strings are hard-coded in English for now.
