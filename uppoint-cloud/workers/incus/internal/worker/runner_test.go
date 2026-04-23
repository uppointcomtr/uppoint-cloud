package worker

import (
	"context"
	"errors"
	"testing"

	"uppoint-cloud/workers/incus/internal/controlplane"
	"uppoint-cloud/workers/incus/internal/network"
)

type fakeControlPlane struct {
	claimedJobs    []controlplane.ClaimedJob
	reports        []controlplane.ReportRequest
	claimErr       error
	reportErr      error
}

func (f *fakeControlPlane) Claim(_ context.Context, _ controlplane.ClaimRequest) ([]controlplane.ClaimedJob, error) {
	if f.claimErr != nil {
		return nil, f.claimErr
	}
	return f.claimedJobs, nil
}

func (f *fakeControlPlane) Report(_ context.Context, payload controlplane.ReportRequest) (*controlplane.ReportResult, error) {
	if f.reportErr != nil {
		return nil, f.reportErr
	}
	f.reports = append(f.reports, payload)
	return &controlplane.ReportResult{JobID: payload.JobID, State: "running"}, nil
}

type fakeNetworkPreparer struct {
	prep network.Preparation
	err  error
}

func (f *fakeNetworkPreparer) Prepare(_ context.Context, _ controlplane.ClaimedJob) (network.Preparation, error) {
	if f.err != nil {
		return network.Preparation{}, f.err
	}
	return f.prep, nil
}

type fakeProvider struct {
	providerRef string
	message     string
	err         error
}

func (f *fakeProvider) EnsureInstance(_ context.Context, _ controlplane.ClaimedJob, _ network.Preparation) (string, string, error) {
	if f.err != nil {
		return "", "", f.err
	}
	return f.providerRef, f.message, nil
}

func TestRunOnceReportsSuccessLifecycle(t *testing.T) {
	cp := &fakeControlPlane{
		claimedJobs: []controlplane.ClaimedJob{{
			JobID: "job_1",
			Network: controlplane.ClaimedNetwork{NetworkID: "net_1"},
			Instance: controlplane.ClaimedInstance{InstanceID: "instance_1", Name: "vm-one"},
		}},
	}
	netPrep := &fakeNetworkPreparer{prep: network.Preparation{VLANTag: 2101, BridgeName: "upkvm-rg-1", OVSNetworkName: "upkvm-net-1-v2101"}}
	provider := &fakeProvider{providerRef: "incus/vm-one", message: "ok"}

	runner := NewRunner(cp, netPrep, provider, "worker-1", 10, 180)
	if err := runner.RunOnce(context.Background()); err != nil {
		t.Fatalf("run once failed: %v", err)
	}

	if len(cp.reports) != 3 {
		t.Fatalf("expected 3 report calls, got %d", len(cp.reports))
	}
	if cp.reports[0].EventType != "network_prepared" {
		t.Fatalf("first event should be network_prepared")
	}
	if cp.reports[1].EventType != "instance_created" {
		t.Fatalf("second event should be instance_created")
	}
	if cp.reports[2].EventType != "provisioning_completed" {
		t.Fatalf("third event should be provisioning_completed")
	}
}

func TestRunOnceReportsFailure(t *testing.T) {
	cp := &fakeControlPlane{
		claimedJobs: []controlplane.ClaimedJob{{
			JobID: "job_1",
			Network: controlplane.ClaimedNetwork{NetworkID: "net_1"},
			Instance: controlplane.ClaimedInstance{InstanceID: "instance_1", Name: "vm-one"},
		}},
	}
	netPrep := &fakeNetworkPreparer{err: errors.New("ovs error")}
	provider := &fakeProvider{}

	runner := NewRunner(cp, netPrep, provider, "worker-1", 10, 180)
	_ = runner.RunOnce(context.Background())

	if len(cp.reports) != 1 {
		t.Fatalf("expected 1 failure report call, got %d", len(cp.reports))
	}
	if cp.reports[0].EventType != "provisioning_failed" {
		t.Fatalf("expected provisioning_failed report")
	}
}
