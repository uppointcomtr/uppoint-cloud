package network

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"

	"uppoint-cloud/workers/incus/internal/controlplane"
	"uppoint-cloud/workers/incus/internal/executil"
)

type Preparer struct {
	runner       executil.Runner
	bridgePrefix string
	vlanStart    int
	vlanEnd      int
}

type Preparation struct {
	VLANTag       int
	BridgeName    string
	OVSNetworkName string
}

func NewPreparer(runner executil.Runner, bridgePrefix string, vlanStart int, vlanEnd int) *Preparer {
	return &Preparer{
		runner:       runner,
		bridgePrefix: strings.TrimSpace(bridgePrefix),
		vlanStart:    vlanStart,
		vlanEnd:      vlanEnd,
	}
}

func (p *Preparer) Prepare(ctx context.Context, job controlplane.ClaimedJob) (Preparation, error) {
	plan := p.Plan(job)

	if _, err := p.runner.Run(ctx, "ovs-vsctl", "--may-exist", "add-br", plan.BridgeName); err != nil {
		return Preparation{}, fmt.Errorf("create bridge %s: %w", plan.BridgeName, err)
	}

	if _, err := p.runner.Run(
		ctx,
		"ovs-vsctl",
		"--may-exist",
		"add-port",
		plan.BridgeName,
		plan.OVSNetworkName,
		"tag="+fmt.Sprintf("%d", plan.VLANTag),
	); err != nil {
		return Preparation{}, fmt.Errorf("attach vlan port %s: %w", plan.OVSNetworkName, err)
	}

	return plan, nil
}

func (p *Preparer) Plan(job controlplane.ClaimedJob) Preparation {
	vlanTag := deterministicVLANTag(job.TenantID, job.ResourceGroupID, p.vlanStart, p.vlanEnd)
	resourceSuffix := shortSlug(job.ResourceGroupID, 8)
	networkSuffix := shortSlug(job.Network.NetworkID, 8)

	bridgeName := fmt.Sprintf("%s-%s", p.bridgePrefix, resourceSuffix)
	ovsNetworkName := fmt.Sprintf("%s-%s-v%d", p.bridgePrefix, networkSuffix, vlanTag)

	return Preparation{
		VLANTag:       vlanTag,
		BridgeName:    bridgeName,
		OVSNetworkName: ovsNetworkName,
	}
}

func deterministicVLANTag(tenantID string, resourceGroupID string, start int, end int) int {
	rangeWidth := end - start + 1
	if rangeWidth <= 0 {
		return start
	}

	digest := sha256.Sum256([]byte(tenantID + ":" + resourceGroupID))
	seed := int(digest[0])<<8 | int(digest[1])
	return start + (seed % rangeWidth)
}

func shortSlug(value string, max int) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = strings.ReplaceAll(normalized, "_", "-")
	normalized = strings.ReplaceAll(normalized, ".", "-")
	normalized = strings.ReplaceAll(normalized, ":", "-")
	if len(normalized) > max {
		return normalized[:max]
	}
	if normalized == "" {
		return "default"
	}
	return normalized
}
