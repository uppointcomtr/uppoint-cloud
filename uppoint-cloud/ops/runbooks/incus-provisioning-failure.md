# Incus Provisioning Failure Runbook

Use this when instance provisioning is pending, stuck, failed, or Incus/OVS drift is detected.

## Detection

- `npm run verify:kvm-readiness`
- `npm run verify:kvm-health`
- Logs:
  - `/var/log/uppoint-cloud/incus-provisioning-worker.log`
  - `/var/log/uppoint-cloud/incus-provisioning-health.log`
  - `/var/log/openvswitch/ovsdb-server.log`
  - `/var/log/openvswitch/ovs-vswitchd.log`

## Immediate Containment

1. Stop repeat attempts if the same provider error is consuming max attempts.
2. Keep DB job history intact; prefer terminal cancellation over hard delete.
3. Run reconciliation in dry-run mode before any host mutation.

## Diagnosis

```bash
cd /opt/uppoint-cloud
npm run verify:kvm-readiness
npm run verify:kvm-health
scripts/reconcile-incus-provisioning.sh
incus list --format=csv -c ns46tS
ovs-vsctl show
tail -n 120 /var/log/uppoint-cloud/incus-provisioning-worker.log
```

Check:

- `/dev/kvm` exists.
- Incus and Open vSwitch are reachable.
- Worker cron is installed.
- Storage policy is explicit.
- OVS stale ports are zero.
- DB job lock is not stale.

## Recovery

1. Clean stale OVS drift only with:

```bash
UPPOINT_ENABLE_KVM_RECONCILIATION_EXECUTE=true scripts/reconcile-incus-provisioning.sh --execute
```

2. Remove only confirmed orphan Incus instances that have no DB provider ref.
3. Re-run the worker once.
4. Confirm job status, provider ref, and VM state.

## Verification

```bash
npm run verify:kvm-readiness
npm run verify:kvm-health
npm run worker:incus
```

Expected result: no pending/stuck jobs, no stale OVS ports, and no due job after the worker pass.
