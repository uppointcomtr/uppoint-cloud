package controlplane

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestClientSetsRealIpForLoopbackControlPlane(t *testing.T) {
	var realIP string
	client := NewClient(
		&http.Client{
			Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
				realIP = request.Header.Get("x-real-ip")
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader(`{"success":true,"data":{"claimed":0,"jobs":[]}}`)),
				}, nil
			}),
		},
		"http://127.0.0.1:3000",
		"http://127.0.0.1:3000",
		"token-token-token-token-token-token-token-token",
		"secret-secret-secret-secret-secret-secret",
		"loopback-hmac-v1",
	)

	if _, err := client.Claim(context.Background(), ClaimRequest{
		WorkerID:         "incus-worker-1",
		BatchSize:        1,
		LockStaleSeconds: 180,
	}); err != nil {
		t.Fatalf("Claim returned error: %v", err)
	}

	if realIP != "127.0.0.1" {
		t.Fatalf("expected loopback x-real-ip, got %q", realIP)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}
