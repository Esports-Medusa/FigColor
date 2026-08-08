package palette

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
	figjcs "github.com/qiqi/figcolor/backend/internal/jcs"
)

const IngestionRequestBodyLimit int64 = 256 * 1024
const idempotencyHeader = "Idempotency-Key"

var charsetParameterPattern = regexp.MustCompile(`(?i)(?:^|;)\s*charset\s*=`)

type ingestionHTTPService interface {
	Ingest(context.Context, CandidateIngestionSubmission) *IngestionServiceResult
}

type IngestionHandler struct {
	service ingestionHTTPService
}

type ingestionPublicError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ingestionHTTPResponse struct {
	status     int
	retryAfter int64
	receipt    json.RawMessage
	problem    *ingestionPublicError
}

func NewIngestionHandler(service ingestionHTTPService) (*IngestionHandler, error) {
	if service == nil {
		return nil, errors.New("ingestion HTTP service is required")
	}
	return &IngestionHandler{service: service}, nil
}

func (h *IngestionHandler) RegisterRoutes(router *gin.RouterGroup, authMiddleware, adminMiddleware gin.HandlerFunc) {
	admin := router.Group("/admin")
	admin.Use(authMiddleware)
	admin.Use(adminMiddleware)
	admin.POST("/palette-candidates", h.IngestCandidate)
}

func (h *IngestionHandler) IngestCandidate(c *gin.Context) {
	if !validIngestionContentType(c.GetHeader("Content-Type")) {
		writeIngestionProblem(c, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json with optional UTF-8 charset.")
		return
	}
	idempotencyKey, ok := validIdempotencyHeader(c.Request.Header.Values(idempotencyHeader))
	if !ok {
		writeIngestionProblem(c, http.StatusBadRequest, "INVALID_IDEMPOTENCY_KEY", "A single valid Idempotency-Key UUID is required.")
		return
	}
	if c.Request.ContentLength > IngestionRequestBodyLimit {
		writeIngestionProblem(c, http.StatusRequestEntityTooLarge, "REQUEST_BODY_TOO_LARGE", "The ingestion request body exceeds 262144 bytes.")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, IngestionRequestBodyLimit+1))
	if err != nil {
		writeIngestionProblem(c, http.StatusBadRequest, "INVALID_JSON", "The ingestion request body is not valid JSON.")
		return
	}
	if int64(len(raw)) > IngestionRequestBodyLimit {
		writeIngestionProblem(c, http.StatusRequestEntityTooLarge, "REQUEST_BODY_TOO_LARGE", "The ingestion request body exceeds 262144 bytes.")
		return
	}
	if _, _, err := figjcs.Hash(raw); err != nil {
		writeIngestionProblem(c, http.StatusBadRequest, "INVALID_JSON", "The ingestion request body is not valid I-JSON.")
		return
	}
	submission := CandidateIngestionSubmission{
		CanonicalRequest: append(json.RawMessage(nil), raw...),
		IdempotencyKey:   idempotencyKey,
		ActorUserID:      authctx.GetUserID(c),
	}
	if _, err := prepareIngestion(submission); err != nil {
		switch {
		case errors.Is(err, ErrUnsupportedIngestionSchemaVersion):
			writeIngestionProblem(c, http.StatusUnprocessableEntity, "UNSUPPORTED_SCHEMA_VERSION", "The ingestion schema version is not supported.")
		case errors.Is(err, ErrUnsupportedIngestionPipelineVersion):
			writeIngestionProblem(c, http.StatusUnprocessableEntity, "UNSUPPORTED_PIPELINE_VERSION", "The ingestion pipeline version is not supported.")
		default:
			writeIngestionProblem(c, http.StatusUnprocessableEntity, "INVALID_INGESTION_REQUEST", "The ingestion request failed validation.")
		}
		return
	}
	writeIngestionResponse(c, adaptIngestionServiceResult(h.service.Ingest(c.Request.Context(), submission)))
}

func validIngestionContentType(value string) bool {
	if value == "" {
		return false
	}
	mediaType, params, err := mime.ParseMediaType(value)
	if err != nil || !strings.EqualFold(mediaType, "application/json") || len(params) > 1 || len(charsetParameterPattern.FindAllStringIndex(value, -1)) > 1 {
		return false
	}
	if len(params) == 0 {
		return true
	}
	charset, ok := params["charset"]
	return ok && strings.EqualFold(charset, "utf-8")
}

func validIdempotencyHeader(values []string) (string, bool) {
	if len(values) != 1 || values[0] == "" || strings.Contains(values[0], ",") || !ingestionUUIDPattern.MatchString(values[0]) {
		return "", false
	}
	return values[0], true
}

func adaptIngestionServiceResult(result *IngestionServiceResult) ingestionHTTPResponse {
	if result == nil {
		return ingestionProblem(http.StatusInternalServerError, "INTERNAL_ERROR", "The ingestion request could not be completed.", 0)
	}
	switch result.Outcome {
	case IngestionServiceCreated:
		return ingestionReceiptResponse(http.StatusCreated, result.Receipt)
	case IngestionServiceReplayed, IngestionServiceRecoveredUnknown:
		return ingestionReceiptResponse(http.StatusOK, result.Receipt)
	case IngestionInProgress:
		return ingestionProblem(http.StatusConflict, IngestionInProgress, "The ingestion request is already processing.", positiveRetryAfter(result.RetryAfterSeconds))
	case IngestionIdempotencyPayloadMismatch:
		return ingestionProblem(http.StatusConflict, IngestionIdempotencyPayloadMismatch, "The idempotency key is already bound to another payload.", 0)
	case IngestionProposalIDConflict:
		return ingestionProblem(http.StatusConflict, IngestionProposalIDConflict, "The proposal identity is already bound to another payload.", 0)
	case IngestionExactContentDuplicate:
		return ingestionProblem(http.StatusConflict, IngestionExactContentDuplicate, "The canonical Palette content already exists.", 0)
	case IngestionServiceRetryNotReady:
		return ingestionProblem(http.StatusServiceUnavailable, IngestionRetryableFailure, "The ingestion request may be retried with the same key and payload.", positiveRetryAfter(result.RetryAfterSeconds))
	case IngestionFailed:
		return ingestionProblem(http.StatusConflict, IngestionFailed, "The ingestion request is in a terminal failed state.", 0)
	case IngestionServiceValidationFailed:
		return ingestionProblem(http.StatusUnprocessableEntity, "INVALID_INGESTION_REQUEST", "The ingestion request failed validation.", 0)
	case IngestionServiceUnsupportedSchemaVersion:
		return ingestionProblem(http.StatusUnprocessableEntity, IngestionServiceUnsupportedSchemaVersion, "The ingestion schema version is not supported.", 0)
	case IngestionServiceUnsupportedPipelineVersion:
		return ingestionProblem(http.StatusUnprocessableEntity, IngestionServiceUnsupportedPipelineVersion, "The ingestion pipeline version is not supported.", 0)
	case IngestionServiceInternalError:
		return ingestionProblem(http.StatusInternalServerError, "INTERNAL_ERROR", "The ingestion request could not be completed.", 0)
	case IngestionServiceOutcomeUnknown:
		return ingestionProblem(http.StatusServiceUnavailable, IngestionServiceOutcomeUnknown, "The ingestion outcome could not be confirmed.", 5)
	default:
		return ingestionProblem(http.StatusServiceUnavailable, IngestionServiceOutcomeUnknown, "The ingestion outcome could not be confirmed.", 5)
	}
}

func ingestionReceiptResponse(status int, raw json.RawMessage) ingestionHTTPResponse {
	if validateHTTPReceipt(raw) != nil {
		return ingestionProblem(http.StatusInternalServerError, "INTERNAL_ERROR", "The stable ingestion receipt is unavailable.", 0)
	}
	return ingestionHTTPResponse{status: status, receipt: append(json.RawMessage(nil), raw...)}
}

func validateHTTPReceipt(raw json.RawMessage) error {
	var receipt struct {
		ProposalID            string   `json:"proposal_id"`
		NormalizedContentHash string   `json:"normalized_content_hash"`
		RequestFingerprint    string   `json:"request_fingerprint"`
		PaletteID             string   `json:"palette_id"`
		Slug                  string   `json:"slug"`
		Status                string   `json:"status"`
		PreviewCaseIDs        []string `json:"preview_case_ids"`
		AdminReviewPath       *string  `json:"admin_review_path,omitempty"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&receipt); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("trailing receipt JSON")
	}
	if receipt.ProposalID == "" || !isSHA256(receipt.NormalizedContentHash) || !isSHA256(receipt.RequestFingerprint) || receipt.PaletteID == "" || receipt.Slug == "" || receipt.Status != "candidate" || receipt.PreviewCaseIDs == nil {
		return errors.New("invalid stable receipt")
	}
	return nil
}

func positiveRetryAfter(value int64) int64 {
	if value < 1 {
		return 1
	}
	return value
}

func ingestionProblem(status int, code, message string, retryAfter int64) ingestionHTTPResponse {
	return ingestionHTTPResponse{status: status, retryAfter: retryAfter, problem: &ingestionPublicError{Code: code, Message: message}}
}

func writeIngestionResponse(c *gin.Context, response ingestionHTTPResponse) {
	if response.retryAfter > 0 {
		c.Header("Retry-After", strconv.FormatInt(response.retryAfter, 10))
	}
	if response.problem != nil {
		c.JSON(response.status, response.problem)
		return
	}
	c.Data(response.status, "application/json", response.receipt)
}

func writeIngestionProblem(c *gin.Context, status int, code, message string) {
	writeIngestionResponse(c, ingestionProblem(status, code, message, 0))
}
