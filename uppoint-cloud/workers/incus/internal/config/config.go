package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBatchSize        = 10
	defaultLockStaleSeconds = 180
	defaultBridgePrefix     = "upkvm"
	defaultVLANRange        = "2000-2999"
	defaultTimeoutSeconds   = 20
)

type Config struct {
	BaseURL          string
	Origin           string
	WorkerID         string
	Token            string
	SigningSecret    string
	TransportMode    string
	BatchSize        int
	LockStaleSeconds int
	BridgePrefix     string
	VLANStart        int
	VLANEnd          int
	IncusSocketPath  string
	IncusEndpoint    string
	HTTPTimeout      time.Duration
}

func Load() (Config, error) {
	baseURL := strings.TrimSpace(getEnv(
		"KVM_WORKER_CONTROL_PLANE_URL",
		getEnv("NEXT_PUBLIC_APP_URL", "https://cloud.uppoint.com.tr"),
	))
	parsedBaseURL, err := url.Parse(baseURL)
	if err != nil || parsedBaseURL.Scheme == "" || parsedBaseURL.Host == "" {
		return Config{}, fmt.Errorf("invalid KVM_WORKER_CONTROL_PLANE_URL/NEXT_PUBLIC_APP_URL: %q", baseURL)
	}

	origin := parsedBaseURL.Scheme + "://" + parsedBaseURL.Host
	workerID := strings.TrimSpace(getEnv("KVM_WORKER_ID", "incus-worker-1"))
	if workerID == "" {
		return Config{}, fmt.Errorf("KVM_WORKER_ID cannot be empty")
	}

	token := strings.TrimSpace(os.Getenv("INTERNAL_PROVISIONING_TOKEN"))
	if token == "" {
		return Config{}, fmt.Errorf("INTERNAL_PROVISIONING_TOKEN is required")
	}

	signingSecret := strings.TrimSpace(os.Getenv("INTERNAL_PROVISIONING_SIGNING_SECRET"))
	if signingSecret == "" {
		return Config{}, fmt.Errorf("INTERNAL_PROVISIONING_SIGNING_SECRET is required")
	}

	batchSize, err := parseIntWithBounds("KVM_WORKER_BATCH_SIZE", defaultBatchSize, 1, 100)
	if err != nil {
		return Config{}, err
	}

	lockStaleSeconds, err := parseIntWithBounds("KVM_WORKER_LOCK_STALE_SECONDS", defaultLockStaleSeconds, 30, 3600)
	if err != nil {
		return Config{}, err
	}

	bridgePrefix := strings.TrimSpace(getEnv("KVM_OVS_BRIDGE_PREFIX", defaultBridgePrefix))
	if bridgePrefix == "" {
		return Config{}, fmt.Errorf("KVM_OVS_BRIDGE_PREFIX cannot be empty")
	}

	vlanStart, vlanEnd, err := parseVLANRange(getEnv("KVM_VLAN_RANGE", defaultVLANRange))
	if err != nil {
		return Config{}, err
	}

	httpTimeoutSeconds, err := parseIntWithBounds("KVM_WORKER_HTTP_TIMEOUT_SECONDS", defaultTimeoutSeconds, 5, 120)
	if err != nil {
		return Config{}, err
	}

	transportMode := strings.TrimSpace(getEnv("INTERNAL_AUTH_TRANSPORT_MODE", "loopback-hmac-v1"))
	if transportMode == "" {
		transportMode = "loopback-hmac-v1"
	}

	incusSocketPath := strings.TrimSpace(os.Getenv("INCUS_SOCKET_PATH"))
	incusEndpoint := strings.TrimSpace(os.Getenv("INCUS_ENDPOINT"))

	return Config{
		BaseURL:          strings.TrimRight(baseURL, "/"),
		Origin:           origin,
		WorkerID:         workerID,
		Token:            token,
		SigningSecret:    signingSecret,
		TransportMode:    transportMode,
		BatchSize:        batchSize,
		LockStaleSeconds: lockStaleSeconds,
		BridgePrefix:     bridgePrefix,
		VLANStart:        vlanStart,
		VLANEnd:          vlanEnd,
		IncusSocketPath:  incusSocketPath,
		IncusEndpoint:    incusEndpoint,
		HTTPTimeout:      time.Duration(httpTimeoutSeconds) * time.Second,
	}, nil
}

func getEnv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func parseIntWithBounds(key string, fallback int, min int, max int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %q", key, raw)
	}
	if parsed < min || parsed > max {
		return 0, fmt.Errorf("invalid %s: %d (must be between %d and %d)", key, parsed, min, max)
	}
	return parsed, nil
}

func parseVLANRange(raw string) (int, int, error) {
	parts := strings.Split(raw, "-")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid KVM_VLAN_RANGE format: %q", raw)
	}

	start, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid KVM_VLAN_RANGE start: %q", raw)
	}
	end, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid KVM_VLAN_RANGE end: %q", raw)
	}
	if start < 2 || end > 4094 || start >= end {
		return 0, 0, fmt.Errorf("invalid KVM_VLAN_RANGE bounds: %q", raw)
	}
	return start, end, nil
}
