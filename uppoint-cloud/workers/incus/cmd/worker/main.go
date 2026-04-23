package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"uppoint-cloud/workers/incus/internal/config"
	"uppoint-cloud/workers/incus/internal/controlplane"
	"uppoint-cloud/workers/incus/internal/executil"
	"uppoint-cloud/workers/incus/internal/network"
	"uppoint-cloud/workers/incus/internal/provider"
	"uppoint-cloud/workers/incus/internal/worker"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("incus-worker config error: %v", err)
	}

	httpClient := &http.Client{
		Timeout: cfg.HTTPTimeout,
	}

	cpClient := controlplane.NewClient(
		httpClient,
		cfg.BaseURL,
		cfg.Origin,
		cfg.Token,
		cfg.SigningSecret,
		cfg.TransportMode,
	)

	runner := &executil.CommandRunner{}
	networkPreparer := network.NewPreparer(runner, cfg.BridgePrefix, cfg.VLANStart, cfg.VLANEnd)
	instanceProvider := provider.NewAdapter(runner)

	service := worker.NewRunner(
		cpClient,
		networkPreparer,
		instanceProvider,
		cfg.WorkerID,
		cfg.BatchSize,
		cfg.LockStaleSeconds,
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := service.RunOnce(ctx); err != nil {
		log.Fatalf("incus-worker failed: %v", err)
	}
}
