package provider

import (
	"strings"
	"testing"

	"uppoint-cloud/workers/incus/internal/controlplane"
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

