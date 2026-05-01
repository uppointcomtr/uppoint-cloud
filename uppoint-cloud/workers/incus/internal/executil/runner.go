package executil

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

type Runner interface {
	Run(ctx context.Context, command string, args ...string) (string, error)
}

type CommandRunner struct{}

var allowedCommands = map[string]struct{}{
	"incus":     {},
	"ovs-vsctl": {},
}

func (r *CommandRunner) Run(ctx context.Context, command string, args ...string) (string, error) {
	commandName := filepath.Base(strings.TrimSpace(command))
	if _, ok := allowedCommands[commandName]; !ok {
		return "", fmt.Errorf("command not allowed: %s", commandName)
	}

	cmd := exec.CommandContext(ctx, command, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := strings.TrimSpace(stdout.String())
	if err != nil {
		errOutput := strings.TrimSpace(stderr.String())
		if errOutput != "" {
			return output, fmt.Errorf("%w: %s", err, errOutput)
		}
		return output, err
	}

	return output, nil
}
