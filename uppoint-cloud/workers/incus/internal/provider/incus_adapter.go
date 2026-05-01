package provider

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	instanceName := buildInstanceName(job.Instance.Name, job.Instance.InstanceID)
	imageSource := resolveImageSource(job.Instance.ImageCode)
	cloudInit := buildCloudInit(job)

	if _, err := a.runner.Run(ctx, "incus", "info", instanceName); err != nil {
		if _, err := a.runner.Run(ctx, "incus", "init", imageSource, instanceName, "--vm"); err != nil {
			return "", "", fmt.Errorf("init instance %s: %w", instanceName, err)
		}
	}

	if _, err := a.runner.Run(ctx, "incus", "config", "device", "override", instanceName, "root", fmt.Sprintf("size=%dGiB", job.Instance.DiskGB)); err != nil {
		return "", "", fmt.Errorf("set root disk size: %w", err)
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
		"vlan="+strconv.Itoa(prep.VLANTag),
	); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "already exists") {
			return "", "", fmt.Errorf("attach nic: %w", err)
		}
	}

	if _, err := a.runner.Run(ctx, "incus", "config", "device", "set", instanceName, "eth0", "parent", prep.BridgeName); err != nil {
		return "", "", fmt.Errorf("set nic parent: %w", err)
	}

	if _, err := a.runner.Run(ctx, "incus", "config", "device", "set", instanceName, "eth0", "vlan", strconv.Itoa(prep.VLANTag)); err != nil {
		return "", "", fmt.Errorf("set nic vlan: %w", err)
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

func (a *Adapter) CleanupInstance(ctx context.Context, job controlplane.ClaimedJob) error {
	instanceName := buildInstanceName(job.Instance.Name, job.Instance.InstanceID)
	if _, err := a.runner.Run(ctx, "incus", "delete", instanceName, "--force"); err != nil {
		normalized := strings.ToLower(err.Error())
		if strings.Contains(normalized, "not found") || strings.Contains(normalized, "doesn't exist") {
			return nil
		}
		return fmt.Errorf("delete partial instance %s: %w", instanceName, err)
	}
	return nil
}

func buildInstanceName(preferred string, instanceID string) string {
	base := sanitizeNameSegment(preferred)
	suffix := shortHash(instanceID)
	if suffix == "" {
		suffix = shortHash(preferred)
	}
	if suffix == "" {
		suffix = "default"
	}

	prefix := "vm"
	maxBaseLength := 63 - len(prefix) - len(suffix) - 2
	if maxBaseLength < 1 {
		maxBaseLength = 1
	}
	if len(base) > maxBaseLength {
		base = strings.Trim(base[:maxBaseLength], "-")
	}
	if base == "" {
		base = "instance"
	}

	return fmt.Sprintf("%s-%s-%s", prefix, base, suffix)
}

func sanitizeNameSegment(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	lastWasHyphen := false

	for _, char := range normalized {
		isAllowed := (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
		if isAllowed {
			builder.WriteRune(char)
			lastWasHyphen = false
			continue
		}
		if !lastWasHyphen {
			builder.WriteRune('-')
			lastWasHyphen = true
		}
	}

	candidate := strings.Trim(builder.String(), "-")
	if candidate == "" {
		return "instance"
	}
	return candidate
}

func shortHash(value string) string {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return ""
	}
	digest := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(digest[:])[:10]
}

func resolveImageSource(imageCode string) string {
	switch strings.TrimSpace(imageCode) {
	case "ubuntu-24-04-lts":
		return "images:ubuntu/24.04/cloud"
	case "debian-12":
		return "images:debian/12/cloud"
	case "almalinux-9":
		return "images:almalinux/9/cloud"
	default:
		return imageCode
	}
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
