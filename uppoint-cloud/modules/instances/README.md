# Instances Module Boundary

This module is the reserved server boundary for future VPS/KVM instance lifecycle work.

Current scope in this repository state:

- Defines domain contracts for instance provisioning/runtime state.
- Defines tenant authorization boundary helper for instance-scoped server entry points.

Out of scope right now:

- Hypervisor integration (`libvirt`, `qemu`, SSH, cloud-init).
- Provisioning workflow implementation.
- User-facing instance CRUD routes/pages.

Security requirement for future implementation:

- Every instance read/mutation must call `assertInstanceTenantAccess(...)` (or stricter role checks) on the server path before any provider/database operation.
