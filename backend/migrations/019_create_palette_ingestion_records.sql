-- Migration 019: Persist idempotent Palette candidate ingestion claims and receipts.

BEGIN;

CREATE TABLE palette_ingestion_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_hash CHAR(64) NOT NULL,
  normalized_content_hash CHAR(64) NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  processing_state TEXT NOT NULL DEFAULT 'processing',
  palette_id UUID NULL,
  receipt JSONB NULL,
  pipeline_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_reference TEXT NULL,
  actor_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT palette_ingestion_records_proposal_id_key UNIQUE (proposal_id),
  CONSTRAINT palette_ingestion_records_content_hash_key UNIQUE (normalized_content_hash),
  CONSTRAINT palette_ingestion_records_actor_operation_key UNIQUE (actor_user_id, operation, idempotency_key),
  CONSTRAINT palette_ingestion_records_palette_id_key UNIQUE (palette_id),
  CONSTRAINT palette_ingestion_records_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT palette_ingestion_records_palette_fkey FOREIGN KEY (palette_id) REFERENCES palettes(id) ON DELETE RESTRICT,
  CONSTRAINT palette_ingestion_records_operation_check CHECK (operation = 'palette_candidate_import_v1'),
  CONSTRAINT palette_ingestion_records_idempotency_key_check CHECK (
    idempotency_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ),
  CONSTRAINT palette_ingestion_records_source_hash_check CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT palette_ingestion_records_content_hash_check CHECK (normalized_content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT palette_ingestion_records_request_fingerprint_check CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT palette_ingestion_records_schema_version_check CHECK (schema_version > 0),
  CONSTRAINT palette_ingestion_records_state_check CHECK (processing_state IN ('processing', 'succeeded')),
  CONSTRAINT palette_ingestion_records_validation_issues_check CHECK (jsonb_typeof(validation_issues) = 'array'),
  CONSTRAINT palette_ingestion_records_duplicate_evidence_check CHECK (jsonb_typeof(duplicate_evidence) = 'array'),
  CONSTRAINT palette_ingestion_records_receipt_binding_check CHECK (
    (
      processing_state = 'processing'
      AND palette_id IS NULL
      AND receipt IS NULL
    ) OR (
      processing_state = 'succeeded'
      AND palette_id IS NOT NULL
      AND jsonb_typeof(receipt) = 'object'
      AND receipt ? 'proposal_id'
      AND receipt ? 'normalized_content_hash'
      AND receipt ? 'request_fingerprint'
      AND receipt ? 'palette_id'
      AND receipt ? 'slug'
      AND receipt ? 'status'
      AND receipt ? 'preview_case_ids'
      AND receipt->>'proposal_id' = proposal_id
      AND receipt->>'normalized_content_hash' = normalized_content_hash
      AND receipt->>'request_fingerprint' = request_fingerprint
      AND receipt->>'palette_id' = palette_id::text
      AND receipt->>'status' = 'candidate'
      AND jsonb_typeof(receipt->'preview_case_ids') = 'array'
    )
  )
);

CREATE INDEX idx_palette_ingestion_records_state_updated
  ON palette_ingestion_records (processing_state, updated_at);

CREATE INDEX idx_palette_ingestion_records_actor_created
  ON palette_ingestion_records (actor_user_id, created_at DESC);

COMMIT;
