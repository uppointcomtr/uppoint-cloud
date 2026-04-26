package provider

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"uppoint-cloud/workers/incus/internal/controlplane"
	"uppoint-cloud/workers/incus/internal/network"
)

func TestBuildCloudInitUsesRealNewLines(t *testing.T) {
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey user@example"
	job := controlplane.ClaimedJob{
		Instance: controlplane.ClaimedInstance{
			AdminUsername: "cloudadmin",
			SSHPublicKey:  &sshKey,
		},
	}

	cloudInit := buildCloudInit(job)

	if strings.Contains(cloudInit, "\\n") {
		t.Fatalf("cloud-init should use real newline characters, got: %q", cloudInit)
	}
	if !strings.Contains(cloudInit, "#cloud-config\nusers:\n  - name: cloudadmin\n") {
		t.Fatalf("cloud-init header/user block missing expected formatting: %q", cloudInit)
	}
	if !strings.Contains(cloudInit, "ssh_authorized_keys:\n  - "+sshKey+"\n") {
		t.Fatalf("cloud-init ssh key block missing expected formatting: %q", cloudInit)
	}
}

func TestEnsureInstanceInitializesBeforeConfigAndStart(t *testing.T) {
	runner := &recordingRunner{
		failures: map[string]error{
			"incus info vm-test": errors.New("not found"),
		},
	}
	adapter := NewAdapter(runner)
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey user@example"
	job := controlplane.ClaimedJob{
		Instance: controlplane.ClaimedInstance{
			InstanceID:    "inst-test",
			Name:          "vm-test",
			ImageCode:     "ubuntu-24-04-lts",
			CPUCores:      2,
			MemoryMB:      4096,
			AdminUsername: "cloudadmin",
			SSHPublicKey:  &sshKey,
		},
	}

	providerRef, providerMessage, err := adapter.EnsureInstance(
		context.Background(),
		job,
		network.Preparation{
			VLANTag:    2001,
			BridgeName: "upkvm-rg",
		},
	)

	if err != nil {
		t.Fatalf("EnsureInstance returned error: %v", err)
	}
	if providerRef != "incus/vm-test" {
		t.Fatalf("unexpected providerRef: %q", providerRef)
	}
	if !strings.Contains(providerMessage, "bridge=upkvm-rg vlan=2001") {
		t.Fatalf("unexpected providerMessage: %q", providerMessage)
	}

	expectedPrefix := []string{
		"incus info vm-test",
		"incus init images:ubuntu/24.04/cloud vm-test --vm",
		"incus config set vm-test limits.cpu 2",
		"incus config set vm-test limits.memory 4096MB",
	}
	if len(runner.commands) < len(expectedPrefix) {
		t.Fatalf("expected at least %d commands, got %d: %#v", len(expectedPrefix), len(runner.commands), runner.commands)
	}
	if !reflect.DeepEqual(runner.commands[:len(expectedPrefix)], expectedPrefix) {
		t.Fatalf("unexpected command prefix:\nexpected: %#v\nactual:   %#v", expectedPrefix, runner.commands[:len(expectedPrefix)])
	}
	if runner.commands[len(runner.commands)-1] != "incus start vm-test" {
		t.Fatalf("expected final command to start instance, got commands: %#v", runner.commands)
	}
}

type recordingRunner struct {
	commands []string
	failures map[string]error
}

func (r *recordingRunner) Run(_ context.Context, command string, args ...string) (string, error) {
	rendered := strings.TrimSpace(command + " " + strings.Join(args, " "))
	r.commands = append(r.commands, rendered)
	if err, ok := r.failures[rendered]; ok {
		return "", err
	}
	return "", nil
}
