package worker

import (
	"context"
	"fmt"
	"log"

	"uppoint-cloud/workers/incus/internal/controlplane"
	"uppoint-cloud/workers/incus/internal/network"
)

type ControlPlane interface {
	Claim(ctx context.Context, payload controlplane.ClaimRequest) ([]controlplane.ClaimedJob, error)
	Report(ctx context.Context, payload controlplane.ReportRequest) (*controlplane.ReportResult, error)
}

type NetworkPreparer interface {
	Prepare(ctx context.Context, job controlplane.ClaimedJob) (network.Preparation, error)
}

type InstanceProvider interface {
	EnsureInstance(ctx context.Context, job controlplane.ClaimedJob, prep network.Preparation) (string, string, error)
}

type Runner struct {
	controlPlane     ControlPlane
	networkPreparer  NetworkPreparer
	instanceProvider InstanceProvider
	workerID         string
	batchSize        int
	lockStaleSeconds int
}

func NewRunner(
	controlPlane ControlPlane,
	networkPreparer NetworkPreparer,
	instanceProvider InstanceProvider,
	workerID string,
	batchSize int,
	lockStaleSeconds int,
) *Runner {
	return &Runner{
		controlPlane:     controlPlane,
		networkPreparer:  networkPreparer,
		instanceProvider: instanceProvider,
		workerID:         workerID,
		batchSize:        batchSize,
		lockStaleSeconds: lockStaleSeconds,
	}
}

func (r *Runner) RunOnce(ctx context.Context) error {
	jobs, err := r.controlPlane.Claim(ctx, controlplane.ClaimRequest{
		WorkerID:         r.workerID,
		BatchSize:        r.batchSize,
		LockStaleSeconds: r.lockStaleSeconds,
	})
	if err != nil {
		return fmt.Errorf("claim provisioning jobs: %w", err)
	}

	if len(jobs) == 0 {
		log.Printf("incus-worker: no due provisioning job found")
		return nil
	}

	for _, job := range jobs {
		if err := r.processJob(ctx, job); err != nil {
			log.Printf("incus-worker: job=%s failed: %v", job.JobID, err)
		}
	}

	return nil
}

func (r *Runner) processJob(ctx context.Context, job controlplane.ClaimedJob) error {
	prep, err := r.networkPreparer.Prepare(ctx, job)
	if err != nil {
		return r.reportFailure(ctx, job, "NETWORK_PREPARATION_FAILED", err)
	}

	if _, err := r.controlPlane.Report(ctx, controlplane.ReportRequest{
		WorkerID:  r.workerID,
		JobID:     job.JobID,
		EventType: "network_prepared",
		NetworkPreparation: &controlplane.ReportNetworkPreparation{
			VLANTag:       prep.VLANTag,
			BridgeName:    prep.BridgeName,
			OVSNetworkName: prep.OVSNetworkName,
		},
		Metadata: map[string]any{
			"step": "network",
		},
	}); err != nil {
		return fmt.Errorf("report network prepared: %w", err)
	}

	providerRef, providerMessage, err := r.instanceProvider.EnsureInstance(ctx, job, prep)
	if err != nil {
		return r.reportFailure(ctx, job, "INCUS_CREATE_OR_START_FAILED", err)
	}

	if _, err := r.controlPlane.Report(ctx, controlplane.ReportRequest{
		WorkerID:        r.workerID,
		JobID:           job.JobID,
		EventType:       "instance_created",
		ProviderRef:     strPtr(providerRef),
		ProviderMessage: strPtr(providerMessage),
		Metadata: map[string]any{
			"step": "instance",
		},
	}); err != nil {
		return fmt.Errorf("report instance created: %w", err)
	}

	if _, err := r.controlPlane.Report(ctx, controlplane.ReportRequest{
		WorkerID:        r.workerID,
		JobID:           job.JobID,
		EventType:       "provisioning_completed",
		ProviderRef:     strPtr(providerRef),
		ProviderMessage: strPtr(providerMessage),
		Metadata: map[string]any{
			"step": "completed",
		},
	}); err != nil {
		return fmt.Errorf("report provisioning completed: %w", err)
	}

	log.Printf("incus-worker: job=%s completed providerRef=%s", job.JobID, providerRef)
	return nil
}

func (r *Runner) reportFailure(ctx context.Context, job controlplane.ClaimedJob, code string, cause error) error {
	message := cause.Error()
	_, reportErr := r.controlPlane.Report(ctx, controlplane.ReportRequest{
		WorkerID:     r.workerID,
		JobID:        job.JobID,
		EventType:    "provisioning_failed",
		ErrorCode:    strPtr(code),
		ErrorMessage: strPtr(message),
		Metadata: map[string]any{
			"step": "failed",
		},
	})
	if reportErr != nil {
		return fmt.Errorf("%s: %w (report error: %v)", code, cause, reportErr)
	}
	return fmt.Errorf("%s: %w", code, cause)
}

func strPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
