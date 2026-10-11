# Cloud portal roadmap

Where the tenant model and the portal stand, and what comes after the MVP.

## MVP scope (this branch, done)

**Must have**, to sign and run a first paying customer:

- Provider admin pages in XO 6: organizations, projects (quota, scope), first organization admin, usage per customer
- Offerings (instance sizes and prices) defined by the provider, cloud-init images
- Instance console for project members
- Public IPs from provider IP pools, assigned at creation (no virtual router)
- Usage records: hourly samples per project, API and CSV
- Account basics: password change and reset, no browser login dialog, failed login throttling, organization suspension
- Deployment: portal served by xo-server, provider branding

**Should have**:

- Self-service backups: subscribe instances to provider-defined policies, restore as a new instance
- API keys backed by XO authentication tokens
- Live updates through XO events instead of polling
- Project ownership on network interfaces and disk attachments, cleanup of deleted users

Validated end to end on a lab pool (API suites and portal UI), including a real backup and restore, console,
suspension, usage records, live updates through events, and cloud-init on a Hub template (public IP configured in the
guest, SSH key of the account). A security review of tenant isolation, accounts and quotas was addressed.

## Later

### Networking

- **Virtual router appliance** per private network, managed by XO next to the SDN controller: DHCP, DNS, source NAT, floating IPs (1:1 NAT), port forwarding, firewall rules. This is what turns "delegated virtualization" into a cloud, and the largest piece of new engineering. The portal already has its screens as previews.
- VPC-style multi-tier networks with ACLs between tiers
- Security groups (per-instance firewall rules)
- Reverse DNS for public IPs
- Site-to-site and client VPN

### Services

- Load balancer as a service, with SSL offload
- Autoscaling groups
- Tenant-scoped Kubernetes clusters (the Hub recipe and the cloud controller manager exist, not tenant-scoped)
- Object storage

### Tenancy

- Customers create their own projects within an organization-wide quota
- Nested organizations for resellers
- Per-project roles defined by the provider, beyond viewer, member and admin
- API keys restricted to a subset of the user's rights (today a token has all the rights of its user)

### Billing

- Snapshot space billed by actual footprint: the data a snapshot chain keeps alive on thin storage, which needs a rule to share the base copy of a chain between its snapshots
- Power-state history to bill running time instead of allocation
- Native integrations with WHMCS, HostBill, Blesta (today: usage API and CSV)
- Prepaid credit and spending limits

### Portal

- Translations (strings are hard-coded in English)
- Instance metrics (CPU, memory, disk, network) from XO stats
- Instance resize within offerings, with quota checks
- Custom images uploaded by customers, and ISO attach (the browser virtual media work)
- Audit log per project, from the XO audit plugin
- Invitation emails and SSO per organization (SAML/OIDC providers per customer)
