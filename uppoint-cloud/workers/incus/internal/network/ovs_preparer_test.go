package network

import (
	"context"
	"testing"

	"uppoint-cloud/workers/incus/internal/controlplane"
)

type fakeRunner struct {
	calls [][]string
}

func (f *fakeRunner) Run(_ context.Context, command string, args ...string) (string, error) {
	call := append([]string{command}, args...)
	f.calls = append(f.calls, call)
	return "", nil
}

func TestPreparerPlanIsDeterministic(t *testing.T) {
	runner := &fakeRunner{}
	preparer := NewPreparer(runner, "upkvm", 2000, 2999)
	job := controlplane.ClaimedJob{
		TenantID:        "tenant_1",
		ResourceGroupID: "rg_1",
		Network: controlplane.ClaimedNetwork{
			NetworkID: "net_1",
		},
	}

	first := preparer.Plan(job)
	second := preparer.Plan(job)

	if first.VLANTag != second.VLANTag {
		t.Fatalf("expected deterministic vlan tag, got %d and %d", first.VLANTag, second.VLANTag)
	}
	if first.BridgeName != second.BridgeName || first.OVSNetworkName != second.OVSNetworkName {
		t.Fatalf("expected deterministic naming")
	}
}

func TestPreparerRunsIdempotentOVSCommands(t *testing.T) {
	runner := &fakeRunner{}
	preparer := NewPreparer(runner, "upkvm", 2000, 2999)
	job := controlplane.ClaimedJob{
		TenantID:        "tenant_1",
		ResourceGroupID: "rg_1",
		Network: controlplane.ClaimedNetwork{NetworkID: "net_1"},
	}

	if _, err := preparer.Prepare(context.Background(), job); err != nil {
		t.Fatalf("prepare returned error: %v", err)
	}

	if len(runner.calls) != 2 {
		t.Fatalf("expected 2 ovs commands, got %d", len(runner.calls))
	}
	if runner.calls[0][0] != "ovs-vsctl" || runner.calls[0][1] != "--may-exist" {
		t.Fatalf("expected idempotent add-br command")
	}
	if runner.calls[1][0] != "ovs-vsctl" || runner.calls[1][1] != "--may-exist" {
		t.Fatalf("expected idempotent add-port command")
	}
}
