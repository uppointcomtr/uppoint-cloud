# KVM Module Boundary

This module is the provider boundary for hypervisor integrations.

Current scope in this repository state:

- Defines strict provider contracts for Incus-first worker orchestration.
- Keeps orchestration out of direct hypervisor calls in app/routes.
- App control-plane talks to workers only through signed internal routes:
  - `POST /api/internal/instances/provisioning/claim`
  - `POST /api/internal/instances/provisioning/report`

Rules:

- Do not import `child_process`, `virsh`, `qemu`, or `libvirt` in app routes or dashboard modules.
- Provider adapters must be called only through repository/services + internal worker protocol.
- Tenant/resource-group authorization must be completed before any provider call.
