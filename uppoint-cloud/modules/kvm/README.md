# KVM Module Boundary

This module is the provider boundary for hypervisor integrations.

Current scope in this repository state:

- Defines strict provider contracts for future KVM/libvirt adapters.
- Keeps orchestration out of direct hypervisor calls in app/routes.

Rules:

- Do not import `child_process`, `virsh`, `qemu`, or `libvirt` in app routes or dashboard modules.
- Provider adapters must be called only through `modules/instances/server/*` orchestration services.
- Tenant/resource-group authorization must be completed before any provider call.
