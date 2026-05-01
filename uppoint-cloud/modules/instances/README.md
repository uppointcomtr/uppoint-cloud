# Instances Module Boundary

This module is the reserved server boundary for future VPS/KVM instance lifecycle work.

Current scope in this repository state:

- Defines domain contracts for instance provisioning/runtime state.
- Defines tenant authorization boundary helper for instance-scoped server entry points.
- Defines tenant-isolated control-plane persistence for:
  - resource groups
  - virtual networks
  - firewall policies/rules
  - cloud instances
  - provisioning jobs/events
- Exposes a protected dashboard wizard surface at:
  - `/[locale]/dashboard/modules/instances/new`
  - create resource group with default network/firewall
  - select only operator-approved images from `modules/instances/image-catalog/`
  - submit idempotent instance provisioning requests
- Provides signed internal Incus worker orchestration:
  - claim/report control-plane routes
  - worker-side OVS bridge preparation with Incus NIC VLAN attachment
  - collision-resistant provider instance naming
  - root disk sizing from `diskGb`
  - dry-run reconciliation and readiness/health scripts
- Defines an explicit instance operation state-machine contract in
  `modules/instances/domain/operation-state-machine.ts` for create, reinstall,
  delete, power, reboot, and resize operations.

Out of scope right now:

- User-driven image uploads are disabled. The provisioning wizard only shows operator-approved image manifests from `modules/instances/image-catalog/`.
- Full instance runtime CRUD lifecycle (power, snapshot, console, resize, delete).
- Multi-host scheduling, host inventory, placement/drain, tenant quota enforcement, public IPAM, and provider reconciliation loops beyond the current single-host Incus worker.

Security requirement for future implementation:

- Every instance read/mutation must call `assertInstanceTenantAccess(...)` (or stricter role checks) on the server path before any provider/database operation.
- Image catalog changes must be made by operators in `modules/instances/image-catalog/`; users must not receive a frontend or API upload path.
