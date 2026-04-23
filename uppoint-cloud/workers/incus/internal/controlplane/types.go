package controlplane

type ClaimedNetwork struct {
	NetworkID string `json:"networkId"`
	Name      string `json:"name"`
	CIDR      string `json:"cidr"`
}

type ClaimedInstance struct {
	InstanceID         string  `json:"instanceId"`
	Name               string  `json:"name"`
	PlanCode           string  `json:"planCode"`
	ImageCode          string  `json:"imageCode"`
	RegionCode         string  `json:"regionCode"`
	CPUCores           int     `json:"cpuCores"`
	MemoryMB           int     `json:"memoryMb"`
	DiskGB             int     `json:"diskGb"`
	AdminUsername      string  `json:"adminUsername"`
	SSHPublicKey       *string `json:"sshPublicKey"`
	ProviderInstanceRef *string `json:"providerInstanceRef"`
}

type ClaimedJob struct {
	JobID             string                 `json:"jobId"`
	TenantID          string                 `json:"tenantId"`
	ResourceGroupID   string                 `json:"resourceGroupId"`
	RequestedByUserID string                 `json:"requestedByUserId"`
	AttemptCount      int                    `json:"attemptCount"`
	MaxAttempts       int                    `json:"maxAttempts"`
	RequestPayload    map[string]any         `json:"requestPayload"`
	ProviderRef       *string                `json:"providerRef"`
	ProviderMessage   *string                `json:"providerMessage"`
	Network           ClaimedNetwork         `json:"network"`
	Instance          ClaimedInstance        `json:"instance"`
}

type ClaimRequest struct {
	WorkerID         string `json:"workerId"`
	BatchSize        int    `json:"batchSize"`
	LockStaleSeconds int    `json:"lockStaleSeconds"`
}

type ClaimResponsePayload struct {
	Claimed int          `json:"claimed"`
	Jobs    []ClaimedJob `json:"jobs"`
}

type ReportNetworkPreparation struct {
	VLANTag       int    `json:"vlanTag"`
	BridgeName    string `json:"bridgeName"`
	OVSNetworkName string `json:"ovsNetworkName"`
}

type ReportRequest struct {
	WorkerID           string                    `json:"workerId"`
	JobID              string                    `json:"jobId"`
	EventType          string                    `json:"eventType"`
	ProviderRef        *string                   `json:"providerRef,omitempty"`
	ProviderMessage    *string                   `json:"providerMessage,omitempty"`
	ErrorCode          *string                   `json:"errorCode,omitempty"`
	ErrorMessage       *string                   `json:"errorMessage,omitempty"`
	NetworkPreparation *ReportNetworkPreparation `json:"networkPreparation,omitempty"`
	Metadata           map[string]any            `json:"metadata,omitempty"`
}

type ReportResult struct {
	JobID           string  `json:"jobId"`
	State           string  `json:"state"`
	Terminal        bool    `json:"terminal"`
	RetryScheduled  bool    `json:"retryScheduled"`
	AttemptCount    int     `json:"attemptCount"`
	MaxAttempts     int     `json:"maxAttempts"`
	NextAttemptAt   *string `json:"nextAttemptAt"`
	ProviderRef     *string `json:"providerRef"`
	ProviderMessage *string `json:"providerMessage"`
}

type APIError struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    string `json:"code"`
}

type APIResponse[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data"`
}
