import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("Incus provisioning ops scripts", () => {
  it("gates worker startup with KVM readiness preflight", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts", "run-incus-worker.sh"), "utf8");

    expect(source).toContain("verify-kvm-readiness.sh");
    expect(source).toContain("--worker-preflight");
    expect(source).toContain("KVM_WORKER_SKIP_PREFLIGHT");
  });

  it("keeps readiness fail-closed for production dir storage and missing cron", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts", "verify-kvm-readiness.sh"), "utf8");

    expect(source).toContain("/dev/kvm");
    expect(source).toContain("incus storage show");
    expect(source).toContain("KVM_WORKER_ALLOW_DIR_STORAGE");
    expect(source).toContain("/etc/cron.d/uppoint-incus-provisioning");
  });

  it("keeps reconciliation dry-run by default and execute gated", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts", "reconcile-incus-provisioning.sh"), "utf8");

    expect(source).toContain("MODE=\"dry-run\"");
    expect(source).toContain("UPPOINT_ENABLE_KVM_RECONCILIATION_EXECUTE");
    expect(source).toContain("KVM_RECONCILE_DELETE_EMPTY_BRIDGES");
    expect(source).toContain("orphan Incus instance candidate");
  });

  it("reports provisioning health signals for queue age, locks, and OVS drift", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts", "check-incus-provisioning-health.sh"), "utf8");

    expect(source).toContain("oldest_pending_age_seconds");
    expect(source).toContain("stuck_locks");
    expect(source).toContain("ovs_stale_ports");
    expect(source).toContain("failed_events_last_hour");
  });
});
