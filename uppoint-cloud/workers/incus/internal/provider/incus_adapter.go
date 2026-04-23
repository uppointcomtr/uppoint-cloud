package provider

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"uppoint-cloud/workers/incus/internal/controlplane"
	"uppoint-cloud/workers/incus/internal/executil"
	"uppoint-cloud/workers/incus/internal/network"
)

type Adapter struct {
	runner executil.Runner
}

func NewAdapter(runner executil.Runner) *Adapter {
	return &Adapter{runner: runner}
}

func (a *Adapter) EnsureInstance(ctx context.Context, job controlplane.ClaimedJob, prep network.Preparation) (string, string, error) {
	instanceName := sanitizeInstanceName(job.Instance.Name, job.Instance.InstanceID)
	cloudInit := buildCloudInit(job)

	if _, err := a.runner.Run(ctx, "incus", "info", instanceName); err != nil {
		if _, err := a.runner.Run(ctx, "incus", "launch", job.Instance.ImageCode, instanceName, "--vm"); err != nil {
			return "", "", fmt.Errorf("launch instance %s: %w", instanceName, err)
		}
	}

	if _, err := a.runner.Run(ctx, "incus", "config", "set", instanceName, "limits.cpu", strconv.Itoa(job.Instance.CPUCores)); err != nil {
		return "", "", fmt.Errorf("set cpu limit: %w", err)
	}

	if _, err := a.runner.Run(ctx, "incus", "config", "set", instanceName, "limits.memory", fmt.Sprintf("%dMB", job.Instance.MemoryMB)); err != nil {
		return "", "", fmt.Errorf("set memory limit: %w", err)
	}

	if _, err := a.runner.Run(ctx, "incus", "config", "set", instanceName, "user.user-data", cloudInit); err != nil {
		return "", "", fmt.Errorf("set cloud-init user-data: %w", err)
	}

	if _, err := a.runner.Run(
		ctx,
		"incus",
		"config",
		"device",
		"add",
		instanceName,
		"eth0",
		"nic",
		"nictype=bridged",
		"parent="+prep.BridgeName,
		"name=eth0",
	); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "already exists") {
			return "", "", fmt.Errorf("attach nic: %w", err)
		}
	}

	if _, err := a.runner.Run(ctx, "incus", "start", instanceName); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "already running") {
			return "", "", fmt.Errorf("start instance: %w", err)
		}
	}

	providerRef := "incus/" + instanceName
	providerMessage := fmt.Sprintf("bridge=%s vlan=%d", prep.BridgeName, prep.VLANTag)
	return providerRef, providerMessage, nil
}

func sanitizeInstanceName(preferred string, fallback string) string {
	candidate := strings.ToLower(strings.TrimSpace(preferred))
	if candidate == "" {
		candidate = strings.ToLower(strings.TrimSpace(fallback))
	}
	if candidate == "" {
		return "vm-default"
	}

	replacer := strings.NewReplacer(
		"_", "-",
		" ", "-",
		"/", "-",
		".", "-",
		":", "-",
	)
	candidate = replacer.Replace(candidate)
	if len(candidate) > 63 {
		candidate = candidate[:63]
	}
	return candidate
}

func buildCloudInit(job controlplane.ClaimedJob) string {
	var builder strings.Builder
	builder.WriteString("#cloud-config\n")
	builder.WriteString("users:\n")
	builder.WriteString("  - name: ")
	builder.WriteString(job.Instance.AdminUsername)
	builder.WriteString("\n")
	builder.WriteString("    sudo: ALL=(ALL) NOPASSWD:ALL\n")
	builder.WriteString("    shell: /bin/bash\n")
	builder.WriteString("ssh_pwauth: false\n")

	if job.Instance.SSHPublicKey != nil && strings.TrimSpace(*job.Instance.SSHPublicKey) != "" {
		builder.WriteString("ssh_authorized_keys:\n")
		builder.WriteString("  - ")
		builder.WriteString(strings.TrimSpace(*job.Instance.SSHPublicKey))
		builder.WriteString("\n")
	}

	return builder.String()
}
