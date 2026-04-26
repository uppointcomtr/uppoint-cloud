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
  - upload tenant-authorized local ISO test images
  - submit idempotent instance provisioning requests

Out of scope right now:

- Hypervisor integration (`libvirt`, `qemu`, SSH, cloud-init).
- Asynchronous provider worker that executes provisioning on host infrastructure.
- Full instance runtime CRUD lifecycle (power, snapshot, console, resize, delete).

Security requirement for future implementation:

- Every instance read/mutation must call `assertInstanceTenantAccess(...)` (or stricter role checks) on the server path before any provider/database operation.
- ISO uploads must stay local to the server, validate `.iso` input, and remain tenant-authorized before any disk write.
