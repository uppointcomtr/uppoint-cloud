package controlplane

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	httpClient    *http.Client
	baseURL       string
	origin        string
	token         string
	signingSecret string
	transportMode string
}

func NewClient(httpClient *http.Client, baseURL string, origin string, token string, signingSecret string, transportMode string) *Client {
	return &Client{
		httpClient:    httpClient,
		baseURL:       strings.TrimRight(baseURL, "/"),
		origin:        origin,
		token:         token,
		signingSecret: signingSecret,
		transportMode: transportMode,
	}
}

func (c *Client) Claim(ctx context.Context, payload ClaimRequest) ([]ClaimedJob, error) {
	var response APIResponse[ClaimResponsePayload]
	if err := c.doSignedJSON(ctx, http.MethodPost, "/api/internal/instances/provisioning/claim", payload, &response); err != nil {
		return nil, err
	}
	return response.Data.Jobs, nil
}

func (c *Client) Report(ctx context.Context, payload ReportRequest) (*ReportResult, error) {
	var response APIResponse[ReportResult]
	if err := c.doSignedJSON(ctx, http.MethodPost, "/api/internal/instances/provisioning/report", payload, &response); err != nil {
		return nil, err
	}
	return &response.Data, nil
}

func (c *Client) doSignedJSON(ctx context.Context, method string, path string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	requestID, err := generateRequestID()
	if err != nil {
		return fmt.Errorf("generate request id: %w", err)
	}
	timestamp := strconv.FormatInt(time.Now().UTC().Unix(), 10)
	bodySHA := sha256Hex(body)

	canonical := method + "\n" + path + "\n" + requestID + "\n" + timestamp + "\n" + bodySHA
	signature := hmacSha256Hex(c.signingSecret, canonical)

	url := c.baseURL + path
	request, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	request.Header.Set("content-type", "application/json")
	request.Header.Set("origin", c.origin)
	request.Header.Set("x-request-id", requestID)
	request.Header.Set("x-internal-request-id", requestID)
	request.Header.Set("x-internal-provisioning-token", c.token)
	request.Header.Set("x-internal-request-ts", timestamp)
	request.Header.Set("x-internal-request-signature", signature)
	request.Header.Set("x-internal-transport", c.transportMode)
	if isLoopbackHost(request.URL.Hostname()) {
		request.Header.Set("x-real-ip", "127.0.0.1")
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read response body: %w", err)
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		apiError := APIError{}
		if err := json.Unmarshal(responseBody, &apiError); err == nil && apiError.Code != "" {
			return fmt.Errorf("control plane %s %s failed: %s (%s)", method, path, apiError.Error, apiError.Code)
		}
		return fmt.Errorf("control plane %s %s failed with status %d", method, path, response.StatusCode)
	}

	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

func generateRequestID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("incus-worker-%d-%s", time.Now().UTC().Unix(), hex.EncodeToString(buf)), nil
}

func sha256Hex(payload []byte) string {
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

func hmacSha256Hex(secret string, canonical string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func isLoopbackHost(host string) bool {
	normalized := strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	return normalized == "127.0.0.1" || normalized == "::1" || normalized == "localhost"
}
