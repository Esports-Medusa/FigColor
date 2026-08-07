package palette

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/database"
)

const (
	IngestionOperationPaletteCandidate = "palette_candidate_import_v1"
	IngestionStateProcessing           = "processing"
	IngestionStateSucceeded            = "succeeded"
	IngestionStateFailed               = "failed"
	DefaultIngestionLeaseSeconds       = 300
	IngestionRetryBackoffSeconds       = 5
	MaxAutomaticIngestionAttempts      = 3
)

const (
	IngestionClaimed                    = "CLAIMED"
	IngestionRecovered                  = "RECOVERED"
	IngestionReplay                     = "REPLAY"
	IngestionIdempotencyPayloadMismatch = "IDEMPOTENCY_PAYLOAD_MISMATCH"
	IngestionInProgress                 = "IDEMPOTENCY_IN_PROGRESS"
	IngestionRetryableFailure           = "INGESTION_RETRYABLE_FAILURE"
	IngestionFailed                     = "INGESTION_FAILED"
	IngestionProposalIDConflict         = "PROPOSAL_ID_CONFLICT"
	IngestionExactContentDuplicate      = "EXACT_CONTENT_DUPLICATE"
	IngestionFailureAttemptLimit        = "ATTEMPT_LIMIT_EXCEEDED"
)

var (
	ErrIngestionClaimNotFound = errors.New("ingestion claim not found")
	ErrIngestionClaimState    = errors.New("ingestion claim state conflict")
	ErrIngestionReceipt       = errors.New("ingestion receipt mismatch")
	ErrIngestionFailureData   = errors.New("unsafe ingestion failure data")
)

var (
	ingestionUUIDPattern        = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
	ingestionFailureCodePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,127}$`)
)

type IngestionClaimInput struct {
	ProposalID            string
	SourceKey             string
	SourceHash            string
	NormalizedContentHash string
	Operation             string
	IdempotencyKey        string
	RequestFingerprint    string
	PipelineVersion       string
	SchemaVersion         int
	ValidationIssues      json.RawMessage
	DuplicateEvidence     json.RawMessage
	SourceReference       *string
	ActorUserID           string
}

type IngestionRecord struct {
	ID                    string
	ProposalID            string
	NormalizedContentHash string
	Operation             string
	IdempotencyKey        string
	RequestFingerprint    string
	ProcessingState       string
	AttemptCount          int
	LeaseToken            *string `json:"-"`
	LeaseStartedAt        *time.Time
	LeaseExpiresAt        *time.Time
	PaletteID             *string
	Receipt               json.RawMessage
	FailureCode           *string
	FailureRetryable      *bool
	FailureSummary        *string
	RetryEligibleAt       *time.Time
	ActorUserID           string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type IngestionClaimResult struct {
	Outcome           string
	Record            *IngestionRecord
	LeaseToken        string `json:"-"`
	RetryAfterSeconds int64
	MatchedIdentity   string
}

type IngestionFailureInput struct {
	Code      string
	Summary   string
	Retryable bool
}

type ingestionReceipt struct {
	ProposalID            string   `json:"proposal_id"`
	NormalizedContentHash string   `json:"normalized_content_hash"`
	RequestFingerprint    string   `json:"request_fingerprint"`
	PaletteID             string   `json:"palette_id"`
	Slug                  string   `json:"slug"`
	Status                string   `json:"status"`
	PreviewCaseIDs        []string `json:"preview_case_ids"`
}

type ingestionDB interface {
	BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
}
type IngestionRepository struct {
	db           ingestionDB
	leaseSeconds int
}

func NewIngestionRepository() *IngestionRepository {
	return &IngestionRepository{db: database.DB, leaseSeconds: DefaultIngestionLeaseSeconds}
}
func NewIngestionRepositoryWithLease(seconds int) (*IngestionRepository, error) {
	if seconds < 30 || seconds > 1800 {
		return nil, fmt.Errorf("ingestion lease seconds must be between 30 and 1800")
	}
	return &IngestionRepository{db: database.DB, leaseSeconds: seconds}, nil
}
func newIngestionRepository(db ingestionDB) *IngestionRepository {
	return &IngestionRepository{db: db, leaseSeconds: DefaultIngestionLeaseSeconds}
}
func newIngestionRepositoryWithLease(db ingestionDB, seconds int) *IngestionRepository {
	return &IngestionRepository{db: db, leaseSeconds: seconds}
}

func (r *IngestionRepository) ClaimOrRecover(ctx context.Context, input IngestionClaimInput) (*IngestionClaimResult, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin ingestion claim: %w", err)
	}
	defer tx.Rollback()

	record, err := insertInitialClaim(ctx, tx, input, r.leaseSeconds)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("claim ingestion: %w", err)
	}
	if err == nil {
		if err := insertAttempt(ctx, tx, record, "initial", nil, ""); err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit ingestion claim: %w", err)
		}
		return leaseResult(IngestionClaimed, record), nil
	}

	result, err := classifyOrRecoverExisting(ctx, tx, input, r.leaseSeconds)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit ingestion classification: %w", err)
	}
	return result, nil
}

func insertInitialClaim(ctx context.Context, tx *sql.Tx, input IngestionClaimInput, leaseSeconds int) (*IngestionRecord, error) {
	row := tx.QueryRowContext(ctx, `
		INSERT INTO palette_ingestion_records (
			proposal_id, source_key, source_hash, normalized_content_hash, operation,
			idempotency_key, request_fingerprint, processing_state, pipeline_version,
			schema_version, validation_issues, duplicate_evidence, source_reference,
			actor_user_id, attempt_count, lease_token, lease_started_at, lease_expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,'processing',$8,$9,$10,$11,$12,$13,1,
			gen_random_uuid(),clock_timestamp(),clock_timestamp()+($14 * interval '1 second'))
		ON CONFLICT DO NOTHING
		RETURNING `+ingestionRecordColumns,
		input.ProposalID, input.SourceKey, input.SourceHash, input.NormalizedContentHash,
		input.Operation, input.IdempotencyKey, input.RequestFingerprint, input.PipelineVersion,
		input.SchemaVersion, cloneJSONOrEmptyArray(input.ValidationIssues),
		cloneJSONOrEmptyArray(input.DuplicateEvidence), input.SourceReference, input.ActorUserID, leaseSeconds)
	return scanIngestionRecord(row)
}

func classifyOrRecoverExisting(ctx context.Context, tx *sql.Tx, input IngestionClaimInput, leaseSeconds int) (*IngestionClaimResult, error) {
	record, err := findIngestionRecord(ctx, tx, "actor_user_id=$1 AND operation=$2 AND idempotency_key=$3", true, input.ActorUserID, input.Operation, input.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	if record != nil {
		if record.RequestFingerprint != input.RequestFingerprint {
			return &IngestionClaimResult{Outcome: IngestionIdempotencyPayloadMismatch, Record: record}, nil
		}
		return recoverScopedRecord(ctx, tx, record, leaseSeconds)
	}
	record, err = findIngestionRecord(ctx, tx, "proposal_id=$1", false, input.ProposalID)
	if err != nil {
		return nil, err
	}
	if record != nil {
		if record.RequestFingerprint != input.RequestFingerprint {
			return &IngestionClaimResult{Outcome: IngestionProposalIDConflict, Record: record, MatchedIdentity: record.ProposalID}, nil
		}
		return classifyWithoutRecovery(ctx, tx, record)
	}
	record, err = findIngestionRecord(ctx, tx, "normalized_content_hash=$1", false, input.NormalizedContentHash)
	if err != nil {
		return nil, err
	}
	if record != nil {
		return &IngestionClaimResult{Outcome: IngestionExactContentDuplicate, Record: record, MatchedIdentity: record.ProposalID}, nil
	}
	return nil, fmt.Errorf("ingestion uniqueness conflict could not be classified")
}

func recoverScopedRecord(ctx context.Context, tx *sql.Tx, record *IngestionRecord, leaseSeconds int) (*IngestionClaimResult, error) {
	switch record.ProcessingState {
	case IngestionStateSucceeded:
		return &IngestionClaimResult{Outcome: IngestionReplay, Record: record}, nil
	case IngestionStateProcessing:
		expired, err := timestampReached(ctx, tx, record.LeaseExpiresAt)
		if err != nil {
			return nil, err
		}
		if !expired {
			retry, err := retryAfter(ctx, tx, record.LeaseExpiresAt)
			return &IngestionClaimResult{Outcome: IngestionInProgress, Record: record, RetryAfterSeconds: retry}, err
		}
		if err := closeAttempt(ctx, tx, record.ID, record.AttemptCount, *record.LeaseToken, "lease_expired", "", ""); err != nil {
			return nil, err
		}
		if record.AttemptCount >= MaxAutomaticIngestionAttempts {
			record, err = exhaustRecord(ctx, tx, record.ID, record.AttemptCount, record.LeaseToken)
			if err != nil {
				return nil, err
			}
			return &IngestionClaimResult{Outcome: IngestionFailed, Record: record}, nil
		}
		record, err = startNextAttempt(ctx, tx, record.ID, record.AttemptCount, "stale_recovery", nil, "", leaseSeconds)
		if err != nil {
			return nil, err
		}
		if err := insertAttempt(ctx, tx, record, "stale_recovery", nil, ""); err != nil {
			return nil, err
		}
		return leaseResult(IngestionRecovered, record), nil
	case IngestionStateFailed:
		if record.FailureRetryable == nil || !*record.FailureRetryable || record.AttemptCount >= MaxAutomaticIngestionAttempts {
			return &IngestionClaimResult{Outcome: IngestionFailed, Record: record}, nil
		}
		eligible, err := timestampReached(ctx, tx, record.RetryEligibleAt)
		if err != nil {
			return nil, err
		}
		if !eligible {
			retry, err := retryAfter(ctx, tx, record.RetryEligibleAt)
			return &IngestionClaimResult{Outcome: IngestionRetryableFailure, Record: record, RetryAfterSeconds: retry}, err
		}
		record, err = startNextAttempt(ctx, tx, record.ID, record.AttemptCount, "automatic_retry", nil, "", leaseSeconds)
		if err != nil {
			return nil, err
		}
		if err := insertAttempt(ctx, tx, record, "automatic_retry", nil, ""); err != nil {
			return nil, err
		}
		return leaseResult(IngestionRecovered, record), nil
	default:
		return nil, ErrIngestionClaimState
	}
}

func classifyWithoutRecovery(ctx context.Context, tx *sql.Tx, record *IngestionRecord) (*IngestionClaimResult, error) {
	switch record.ProcessingState {
	case IngestionStateSucceeded:
		return &IngestionClaimResult{Outcome: IngestionReplay, Record: record}, nil
	case IngestionStateProcessing:
		retry, err := retryAfter(ctx, tx, record.LeaseExpiresAt)
		return &IngestionClaimResult{Outcome: IngestionInProgress, Record: record, RetryAfterSeconds: retry}, err
	default:
		outcome := IngestionFailed
		if record.FailureRetryable != nil && *record.FailureRetryable {
			outcome = IngestionRetryableFailure
		}
		return &IngestionClaimResult{Outcome: outcome, Record: record}, nil
	}
}

func (r *IngestionRepository) BindSuccessTx(ctx context.Context, tx *sql.Tx, recordID string, attemptNumber int, leaseToken, paletteID string, receipt json.RawMessage) (*IngestionRecord, error) {
	ownedReceipt := append(json.RawMessage(nil), receipt...)
	parsed, err := decodeIngestionReceipt(ownedReceipt)
	if err != nil {
		return nil, err
	}
	if parsed.PaletteID != paletteID || parsed.Status != "candidate" || parsed.Slug == "" {
		return nil, fmt.Errorf("%w: palette identity, slug, or status", ErrIngestionReceipt)
	}
	claim, err := lockCurrentLease(ctx, tx, recordID, attemptNumber, leaseToken)
	if err != nil {
		return nil, err
	}
	if parsed.ProposalID != claim.ProposalID || parsed.NormalizedContentHash != claim.NormalizedContentHash || parsed.RequestFingerprint != claim.RequestFingerprint {
		return nil, fmt.Errorf("%w: proposal, content hash, or request fingerprint", ErrIngestionReceipt)
	}
	var actualSlug, actualStatus string
	err = tx.QueryRowContext(ctx, `SELECT slug,status FROM palettes WHERE id=$1 FOR UPDATE`, paletteID).Scan(&actualSlug, &actualStatus)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("%w: palette does not exist", ErrIngestionReceipt)
	}
	if err != nil {
		return nil, fmt.Errorf("validate receipt palette: %w", err)
	}
	if actualSlug != parsed.Slug || actualStatus != "candidate" {
		return nil, fmt.Errorf("%w: palette slug or candidate status", ErrIngestionReceipt)
	}
	if err := validateReceiptPreviewCases(ctx, tx, paletteID, parsed.PreviewCaseIDs); err != nil {
		return nil, err
	}

	row := tx.QueryRowContext(ctx, `UPDATE palette_ingestion_records SET
		processing_state='succeeded',palette_id=$4,receipt=$5,
		lease_token=NULL,lease_started_at=NULL,lease_expires_at=NULL,
		failed_at=NULL,failure_code=NULL,failure_retryable=NULL,failure_summary=NULL,retry_eligible_at=NULL,
		updated_at=clock_timestamp()
		WHERE id=$1 AND processing_state='processing' AND attempt_count=$2 AND lease_token=$3
		  AND lease_expires_at>clock_timestamp() AND palette_id IS NULL AND receipt IS NULL
		RETURNING `+ingestionRecordColumns, recordID, attemptNumber, leaseToken, paletteID, ownedReceipt)
	record, err := scanIngestionRecord(row)
	if err == sql.ErrNoRows {
		return nil, ErrIngestionClaimState
	}
	if err != nil {
		return nil, fmt.Errorf("bind ingestion receipt: %w", err)
	}
	if err := closeAttempt(ctx, tx, recordID, attemptNumber, leaseToken, "succeeded", "", ""); err != nil {
		return nil, err
	}
	return record, nil
}

func (r *IngestionRepository) MarkFailed(ctx context.Context, recordID string, attemptNumber int, leaseToken string, failure IngestionFailureInput) (*IngestionRecord, error) {
	if err := validateFailureInput(failure); err != nil {
		return nil, err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin mark failed: %w", err)
	}
	defer tx.Rollback()
	if _, err := lockCurrentLease(ctx, tx, recordID, attemptNumber, leaseToken); err != nil {
		return nil, err
	}
	logicalCode, retryable := failure.Code, failure.Retryable
	if failure.Retryable && attemptNumber >= MaxAutomaticIngestionAttempts {
		logicalCode, retryable = IngestionFailureAttemptLimit, false
	}
	row := tx.QueryRowContext(ctx, `UPDATE palette_ingestion_records SET
		processing_state='failed',lease_token=NULL,lease_started_at=NULL,lease_expires_at=NULL,
		failed_at=clock_timestamp(),failure_code=$4,failure_retryable=$5,failure_summary=$6,
		retry_eligible_at=CASE WHEN $5 THEN clock_timestamp()+($7*interval '1 second') ELSE NULL END,
		updated_at=clock_timestamp()
		WHERE id=$1 AND processing_state='processing' AND attempt_count=$2 AND lease_token=$3
		RETURNING `+ingestionRecordColumns,
		recordID, attemptNumber, leaseToken, logicalCode, retryable, nullableString(failure.Summary), IngestionRetryBackoffSeconds)
	record, err := scanIngestionRecord(row)
	if err == sql.ErrNoRows {
		return nil, ErrIngestionClaimState
	}
	if err != nil {
		return nil, fmt.Errorf("mark ingestion failed: %w", err)
	}
	if err := closeAttempt(ctx, tx, recordID, attemptNumber, leaseToken, "failed", failure.Code, failure.Summary); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit mark failed: %w", err)
	}
	return record, nil
}

func (r *IngestionRepository) OperatorRequeue(ctx context.Context, recordID, operatorActorID, reason string) (*IngestionClaimResult, error) {
	if !ingestionUUIDPattern.MatchString(operatorActorID) || validateSafeSummary(reason) != nil || reason == "" {
		return nil, ErrIngestionFailureData
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin operator requeue: %w", err)
	}
	defer tx.Rollback()
	record, err := findIngestionRecord(ctx, tx, "id=$1", true, recordID)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, ErrIngestionClaimNotFound
	}
	if record.ProcessingState != IngestionStateFailed || record.FailureRetryable == nil || *record.FailureRetryable {
		return nil, ErrIngestionClaimState
	}
	record, err = startNextAttempt(ctx, tx, record.ID, record.AttemptCount, "operator_requeue", &operatorActorID, reason, r.leaseSeconds)
	if err != nil {
		return nil, err
	}
	if err := insertAttempt(ctx, tx, record, "operator_requeue", &operatorActorID, reason); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit operator requeue: %w", err)
	}
	return leaseResult(IngestionRecovered, record), nil
}

func (r *IngestionRepository) Lookup(ctx context.Context, actorUserID, operation, idempotencyKey string) (*IngestionClaimResult, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin ingestion lookup: %w", err)
	}
	defer tx.Rollback()
	record, err := findIngestionRecord(ctx, tx, "actor_user_id=$1 AND operation=$2 AND idempotency_key=$3", false, actorUserID, operation, idempotencyKey)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, ErrIngestionClaimNotFound
	}
	result, err := classifyWithoutRecovery(ctx, tx, record)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit ingestion lookup: %w", err)
	}
	return result, nil
}

func startNextAttempt(ctx context.Context, tx *sql.Tx, recordID string, previousAttempt int, mode string, operatorID *string, reason string, leaseSeconds int) (*IngestionRecord, error) {
	row := tx.QueryRowContext(ctx, `UPDATE palette_ingestion_records SET
		processing_state='processing',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),
		lease_started_at=clock_timestamp(),lease_expires_at=clock_timestamp()+($3*interval '1 second'),
		failed_at=NULL,failure_code=NULL,failure_retryable=NULL,failure_summary=NULL,retry_eligible_at=NULL,
		updated_at=clock_timestamp()
		WHERE id=$1 AND attempt_count=$2 AND processing_state IN ('processing','failed')
		RETURNING `+ingestionRecordColumns, recordID, previousAttempt, leaseSeconds)
	record, err := scanIngestionRecord(row)
	if err == sql.ErrNoRows {
		return nil, ErrIngestionClaimState
	}
	if err != nil {
		return nil, fmt.Errorf("start ingestion attempt: %w", err)
	}
	return record, nil
}

func exhaustRecord(ctx context.Context, tx *sql.Tx, recordID string, attempt int, token *string) (*IngestionRecord, error) {
	row := tx.QueryRowContext(ctx, `UPDATE palette_ingestion_records SET
		processing_state='failed',lease_token=NULL,lease_started_at=NULL,lease_expires_at=NULL,
		failed_at=clock_timestamp(),failure_code=$4,failure_retryable=false,failure_summary=NULL,retry_eligible_at=NULL,
		updated_at=clock_timestamp()
		WHERE id=$1 AND attempt_count=$2 AND processing_state='processing' AND lease_token=$3
		RETURNING `+ingestionRecordColumns, recordID, attempt, token, IngestionFailureAttemptLimit)
	record, err := scanIngestionRecord(row)
	if err == sql.ErrNoRows {
		return nil, ErrIngestionClaimState
	}
	if err != nil {
		return nil, fmt.Errorf("exhaust ingestion attempts: %w", err)
	}
	return record, nil
}

func insertAttempt(ctx context.Context, tx *sql.Tx, record *IngestionRecord, mode string, operatorID *string, reason string) error {
	if record.LeaseToken == nil || record.LeaseStartedAt == nil || record.LeaseExpiresAt == nil {
		return ErrIngestionClaimState
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO palette_ingestion_attempts
		(ingestion_record_id,attempt_number,lease_token,recovery_mode,operator_actor_user_id,operator_reason,started_at,lease_expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, record.ID, record.AttemptCount, *record.LeaseToken, mode, operatorID, nullableString(reason), *record.LeaseStartedAt, *record.LeaseExpiresAt)
	if err != nil {
		return fmt.Errorf("insert ingestion attempt: %w", err)
	}
	return nil
}

func closeAttempt(ctx context.Context, tx *sql.Tx, recordID string, attempt int, token, outcome, code, summary string) error {
	result, err := tx.ExecContext(ctx, `UPDATE palette_ingestion_attempts SET
		outcome=$4,actual_failure_code=$5,failure_summary=$6,completed_at=clock_timestamp()
		WHERE ingestion_record_id=$1 AND attempt_number=$2 AND lease_token=$3 AND outcome='processing'`,
		recordID, attempt, token, outcome, nullableString(code), nullableString(summary))
	if err != nil {
		return fmt.Errorf("close ingestion attempt: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 {
		return ErrIngestionClaimState
	}
	return nil
}

func lockCurrentLease(ctx context.Context, tx *sql.Tx, recordID string, attempt int, token string) (*IngestionRecord, error) {
	record, err := findIngestionRecord(ctx, tx, "id=$1 AND processing_state='processing' AND attempt_count=$2 AND lease_token=$3 AND lease_expires_at>clock_timestamp()", true, recordID, attempt, token)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, ErrIngestionClaimState
	}
	return record, nil
}

func findIngestionRecord(ctx context.Context, tx *sql.Tx, condition string, lock bool, args ...interface{}) (*IngestionRecord, error) {
	query := `SELECT ` + ingestionRecordColumns + ` FROM palette_ingestion_records WHERE ` + condition
	if lock {
		query += ` FOR UPDATE`
	}
	record, err := scanIngestionRecord(tx.QueryRowContext(ctx, query, args...))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read ingestion record: %w", err)
	}
	return record, nil
}

const ingestionRecordColumns = `id,proposal_id,normalized_content_hash,operation,idempotency_key,
	request_fingerprint,processing_state,attempt_count,lease_token,lease_started_at,lease_expires_at,
	palette_id,receipt,failure_code,failure_retryable,failure_summary,retry_eligible_at,
	actor_user_id,created_at,updated_at`

type rowScanner interface{ Scan(...interface{}) error }

func scanIngestionRecord(row rowScanner) (*IngestionRecord, error) {
	var record IngestionRecord
	var leaseToken, paletteID, failureCode, failureSummary sql.NullString
	var leaseStarted, leaseExpires, retryEligible sql.NullTime
	var failureRetryable sql.NullBool
	var receipt []byte
	err := row.Scan(&record.ID, &record.ProposalID, &record.NormalizedContentHash, &record.Operation,
		&record.IdempotencyKey, &record.RequestFingerprint, &record.ProcessingState, &record.AttemptCount,
		&leaseToken, &leaseStarted, &leaseExpires, &paletteID, &receipt, &failureCode, &failureRetryable,
		&failureSummary, &retryEligible, &record.ActorUserID, &record.CreatedAt, &record.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if leaseToken.Valid {
		record.LeaseToken = &leaseToken.String
	}
	if leaseStarted.Valid {
		record.LeaseStartedAt = &leaseStarted.Time
	}
	if leaseExpires.Valid {
		record.LeaseExpiresAt = &leaseExpires.Time
	}
	if paletteID.Valid {
		record.PaletteID = &paletteID.String
	}
	if failureCode.Valid {
		record.FailureCode = &failureCode.String
	}
	if failureRetryable.Valid {
		record.FailureRetryable = &failureRetryable.Bool
	}
	if failureSummary.Valid {
		record.FailureSummary = &failureSummary.String
	}
	if retryEligible.Valid {
		record.RetryEligibleAt = &retryEligible.Time
	}
	record.Receipt = append(json.RawMessage(nil), receipt...)
	return &record, nil
}

func leaseResult(outcome string, record *IngestionRecord) *IngestionClaimResult {
	token := ""
	if record.LeaseToken != nil {
		token = *record.LeaseToken
	}
	return &IngestionClaimResult{Outcome: outcome, Record: record, LeaseToken: token}
}
func timestampReached(ctx context.Context, tx *sql.Tx, value *time.Time) (bool, error) {
	if value == nil {
		return false, ErrIngestionClaimState
	}
	var reached bool
	err := tx.QueryRowContext(ctx, `SELECT clock_timestamp()>=$1`, *value).Scan(&reached)
	return reached, err
}
func retryAfter(ctx context.Context, tx *sql.Tx, value *time.Time) (int64, error) {
	if value == nil {
		return 1, nil
	}
	var seconds int64
	err := tx.QueryRowContext(ctx, `SELECT GREATEST(1,CEIL(EXTRACT(EPOCH FROM ($1-clock_timestamp()))))::bigint`, *value).Scan(&seconds)
	return seconds, err
}

func validateFailureInput(failure IngestionFailureInput) error {
	if !ingestionFailureCodePattern.MatchString(failure.Code) {
		return ErrIngestionFailureData
	}
	return validateSafeSummary(failure.Summary)
}
func validateSafeSummary(summary string) error {
	if len(summary) > 512 || !utf8.ValidString(summary) || strings.ContainsAny(summary, "\r\n\x00") {
		return ErrIngestionFailureData
	}
	lower := strings.ToLower(summary)
	for _, forbidden := range []string{"password", "authorization", "bearer ", "token=", "postgres://", "select ", "insert ", "update ", "delete "} {
		if strings.Contains(lower, forbidden) {
			return ErrIngestionFailureData
		}
	}
	return nil
}
func nullableString(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}

func decodeIngestionReceipt(raw json.RawMessage) (*ingestionReceipt, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var receipt ingestionReceipt
	if err := decoder.Decode(&receipt); err != nil {
		return nil, fmt.Errorf("%w: invalid JSON: %v", ErrIngestionReceipt, err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, fmt.Errorf("%w: trailing JSON", ErrIngestionReceipt)
	}
	if receipt.ProposalID == "" || receipt.NormalizedContentHash == "" || receipt.RequestFingerprint == "" || receipt.PaletteID == "" || receipt.PreviewCaseIDs == nil {
		return nil, fmt.Errorf("%w: missing required field", ErrIngestionReceipt)
	}
	return &receipt, nil
}
func validateReceiptPreviewCases(ctx context.Context, tx *sql.Tx, paletteID string, previewIDs []string) error {
	seen := make(map[string]struct{}, len(previewIDs))
	for _, id := range previewIDs {
		if !ingestionUUIDPattern.MatchString(id) {
			return fmt.Errorf("%w: invalid preview case identity", ErrIngestionReceipt)
		}
		if _, ok := seen[id]; ok {
			return fmt.Errorf("%w: duplicate preview case identity", ErrIngestionReceipt)
		}
		seen[id] = struct{}{}
	}
	if len(previewIDs) == 0 {
		return nil
	}
	rows, err := tx.QueryContext(ctx, `SELECT id FROM palette_preview_cases WHERE palette_id=$1 AND id=ANY($2::uuid[]) FOR SHARE`, paletteID, pq.Array(previewIDs))
	if err != nil {
		return fmt.Errorf("validate receipt preview cases: %w", err)
	}
	defer rows.Close()
	found := 0
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		found++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if found != len(previewIDs) {
		return fmt.Errorf("%w: preview case missing or belongs to another palette", ErrIngestionReceipt)
	}
	return nil
}
func cloneJSONOrEmptyArray(value json.RawMessage) json.RawMessage {
	if len(value) == 0 {
		return json.RawMessage("[]")
	}
	return append(json.RawMessage(nil), value...)
}
