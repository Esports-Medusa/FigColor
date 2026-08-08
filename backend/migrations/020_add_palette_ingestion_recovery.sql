-- Migration 020: Lease-based ingestion recovery and append-only attempt audit.

BEGIN;

ALTER TABLE palette_ingestion_records
  DROP CONSTRAINT palette_ingestion_records_state_check,
  DROP CONSTRAINT palette_ingestion_records_receipt_binding_check,
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN lease_token UUID,
  ADD COLUMN lease_started_at TIMESTAMPTZ,
  ADD COLUMN lease_expires_at TIMESTAMPTZ,
  ADD COLUMN failed_at TIMESTAMPTZ,
  ADD COLUMN failure_code TEXT,
  ADD COLUMN failure_retryable BOOLEAN,
  ADD COLUMN failure_summary VARCHAR(512),
  ADD COLUMN retry_eligible_at TIMESTAMPTZ;

UPDATE palette_ingestion_records
SET lease_token = gen_random_uuid(),
	lease_started_at = LEAST(created_at, clock_timestamp() - INTERVAL '2 seconds'),
    lease_expires_at = clock_timestamp() - INTERVAL '1 second'
WHERE processing_state = 'processing';

CREATE TABLE palette_ingestion_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_record_id UUID NOT NULL REFERENCES palette_ingestion_records(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  lease_token UUID NOT NULL,
  recovery_mode TEXT NOT NULL,
  operator_actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  operator_reason VARCHAR(512),
  started_at TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'processing',
  actual_failure_code TEXT,
  failure_summary VARCHAR(512),
  completed_at TIMESTAMPTZ,

  CONSTRAINT palette_ingestion_attempts_record_number_key UNIQUE (ingestion_record_id, attempt_number),
  CONSTRAINT palette_ingestion_attempts_lease_token_key UNIQUE (lease_token),
  CONSTRAINT palette_ingestion_attempts_lease_order_check CHECK (lease_expires_at > started_at),
  CONSTRAINT palette_ingestion_attempts_mode_check CHECK (recovery_mode IN ('initial','automatic_retry','stale_recovery','operator_requeue')),
  CONSTRAINT palette_ingestion_attempts_operator_check CHECK (
    (recovery_mode = 'operator_requeue' AND operator_actor_user_id IS NOT NULL AND operator_reason IS NOT NULL AND length(operator_reason) BETWEEN 1 AND 512)
    OR (recovery_mode <> 'operator_requeue' AND operator_actor_user_id IS NULL AND operator_reason IS NULL)
  ),
  CONSTRAINT palette_ingestion_attempts_outcome_check CHECK (outcome IN ('processing','succeeded','failed','lease_expired')),
  CONSTRAINT palette_ingestion_attempts_terminal_check CHECK (
    (outcome = 'processing' AND completed_at IS NULL AND actual_failure_code IS NULL AND failure_summary IS NULL)
    OR (outcome = 'succeeded' AND completed_at IS NOT NULL AND actual_failure_code IS NULL AND failure_summary IS NULL)
    OR (outcome = 'lease_expired' AND completed_at IS NOT NULL AND actual_failure_code IS NULL AND failure_summary IS NULL)
    OR (outcome = 'failed' AND completed_at IS NOT NULL AND actual_failure_code ~ '^[A-Z][A-Z0-9_]{0,127}$')
  )
);

INSERT INTO palette_ingestion_attempts (
  ingestion_record_id, attempt_number, lease_token, recovery_mode,
  started_at, lease_expires_at, outcome, completed_at
)
SELECT id, 1,
       COALESCE(lease_token, gen_random_uuid()),
	   'initial', CASE WHEN processing_state = 'processing' THEN lease_started_at ELSE created_at END,
       CASE WHEN processing_state = 'processing' THEN lease_expires_at ELSE GREATEST(updated_at, created_at + INTERVAL '1 microsecond') END,
       CASE WHEN processing_state = 'succeeded' THEN 'succeeded' ELSE 'processing' END,
       CASE WHEN processing_state = 'succeeded' THEN updated_at ELSE NULL END
FROM palette_ingestion_records;

ALTER TABLE palette_ingestion_records
  ADD CONSTRAINT palette_ingestion_records_attempt_count_check CHECK (attempt_count > 0),
  ADD CONSTRAINT palette_ingestion_records_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,127}$'),
  ADD CONSTRAINT palette_ingestion_records_lease_order_check CHECK (lease_expires_at IS NULL OR lease_expires_at > lease_started_at),
  ADD CONSTRAINT palette_ingestion_records_state_check CHECK (processing_state IN ('processing','succeeded','failed')),
  ADD CONSTRAINT palette_ingestion_records_state_fields_check CHECK (
    (processing_state = 'processing'
      AND palette_id IS NULL AND receipt IS NULL
      AND lease_token IS NOT NULL AND lease_started_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND failed_at IS NULL AND failure_code IS NULL AND failure_retryable IS NULL
      AND failure_summary IS NULL AND retry_eligible_at IS NULL)
    OR
    (processing_state = 'succeeded'
      AND palette_id IS NOT NULL AND receipt IS NOT NULL
      AND lease_token IS NULL AND lease_started_at IS NULL AND lease_expires_at IS NULL
      AND failed_at IS NULL AND failure_code IS NULL AND failure_retryable IS NULL
      AND failure_summary IS NULL AND retry_eligible_at IS NULL)
    OR
    (processing_state = 'failed'
      AND palette_id IS NULL AND receipt IS NULL
      AND lease_token IS NULL AND lease_started_at IS NULL AND lease_expires_at IS NULL
      AND failed_at IS NOT NULL AND failure_code IS NOT NULL AND failure_retryable IS NOT NULL
      AND ((failure_retryable AND retry_eligible_at IS NOT NULL) OR (NOT failure_retryable AND retry_eligible_at IS NULL)))
  ),
  ADD CONSTRAINT palette_ingestion_records_receipt_binding_check CHECK (
    processing_state <> 'succeeded'
    OR (
      jsonb_typeof(receipt) = 'object'
      AND receipt ? 'proposal_id' AND receipt ? 'normalized_content_hash' AND receipt ? 'request_fingerprint'
      AND receipt ? 'palette_id' AND receipt ? 'slug' AND receipt ? 'status' AND receipt ? 'preview_case_ids'
      AND receipt->>'proposal_id' = proposal_id
      AND receipt->>'normalized_content_hash' = normalized_content_hash
      AND receipt->>'request_fingerprint' = request_fingerprint
      AND receipt->>'palette_id' = palette_id::text
      AND receipt->>'status' = 'candidate'
      AND jsonb_typeof(receipt->'preview_case_ids') = 'array'
    )
  ),
  ADD CONSTRAINT palette_ingestion_records_current_attempt_fkey
    FOREIGN KEY (id, attempt_count)
    REFERENCES palette_ingestion_attempts(ingestion_record_id, attempt_number)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION enforce_palette_ingestion_attempt_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.outcome <> 'processing' THEN
      RAISE EXCEPTION 'new palette ingestion attempt must start processing';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'palette ingestion attempts cannot be deleted';
  END IF;
  IF OLD.ingestion_record_id IS DISTINCT FROM NEW.ingestion_record_id
     OR OLD.attempt_number IS DISTINCT FROM NEW.attempt_number
     OR OLD.lease_token IS DISTINCT FROM NEW.lease_token
     OR OLD.recovery_mode IS DISTINCT FROM NEW.recovery_mode
     OR OLD.operator_actor_user_id IS DISTINCT FROM NEW.operator_actor_user_id
     OR OLD.operator_reason IS DISTINCT FROM NEW.operator_reason
     OR OLD.started_at IS DISTINCT FROM NEW.started_at
     OR OLD.lease_expires_at IS DISTINCT FROM NEW.lease_expires_at THEN
    RAISE EXCEPTION 'palette ingestion attempt identity/start fields are immutable';
  END IF;
  IF OLD.outcome <> 'processing' OR NEW.outcome = 'processing' THEN
    RAISE EXCEPTION 'palette ingestion attempt can close exactly once';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_palette_ingestion_attempt_immutable
BEFORE INSERT OR UPDATE OR DELETE ON palette_ingestion_attempts
FOR EACH ROW EXECUTE FUNCTION enforce_palette_ingestion_attempt_immutability();

CREATE OR REPLACE FUNCTION enforce_palette_ingestion_record_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'palette ingestion reservations cannot be deleted';
  END IF;
  IF OLD.proposal_id IS DISTINCT FROM NEW.proposal_id
     OR OLD.normalized_content_hash IS DISTINCT FROM NEW.normalized_content_hash
     OR OLD.operation IS DISTINCT FROM NEW.operation
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
     OR OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id THEN
    RAISE EXCEPTION 'palette ingestion reservation identity is immutable';
  END IF;
  IF OLD.processing_state = 'succeeded' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'succeeded palette ingestion record is immutable';
  END IF;
  IF OLD.processing_state = 'processing' THEN
    IF NEW.processing_state IN ('succeeded','failed') AND NEW.attempt_count <> OLD.attempt_count THEN
      RAISE EXCEPTION 'terminal transition must close current attempt';
    ELSIF NEW.processing_state = 'processing'
          AND (NEW.attempt_count <> OLD.attempt_count + 1 OR OLD.lease_expires_at > clock_timestamp()) THEN
      RAISE EXCEPTION 'processing recovery requires expired lease and next attempt';
    ELSIF NEW.processing_state NOT IN ('processing','succeeded','failed') THEN
      RAISE EXCEPTION 'invalid processing transition';
    END IF;
  ELSIF OLD.processing_state = 'failed' THEN
    IF NEW.processing_state <> 'processing' OR NEW.attempt_count <> OLD.attempt_count + 1 THEN
      RAISE EXCEPTION 'failed record can only start the next attempt';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_palette_ingestion_record_immutable
BEFORE UPDATE OR DELETE ON palette_ingestion_records
FOR EACH ROW EXECUTE FUNCTION enforce_palette_ingestion_record_immutability();

CREATE INDEX idx_palette_ingestion_records_recovery
  ON palette_ingestion_records (processing_state, lease_expires_at, retry_eligible_at);
CREATE INDEX idx_palette_ingestion_attempts_record_started
  ON palette_ingestion_attempts (ingestion_record_id, started_at DESC);

COMMIT;
