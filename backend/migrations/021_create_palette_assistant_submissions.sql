BEGIN;

ALTER TABLE palettes
    ADD COLUMN exact_fingerprint CHAR(64),
    ADD COLUMN exact_fingerprint_version INTEGER;

UPDATE palettes p SET
    exact_fingerprint = (
      SELECT encode(digest(convert_to(
        '{"ordered_hex":[' || string_agg(to_jsonb(color->>'hex')::text, ',' ORDER BY (color->>'order')::integer) || '],"version":1}',
        'UTF8'), 'sha256'), 'hex')
      FROM jsonb_array_elements(p.colors) AS color
    ),
    exact_fingerprint_version = 1;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM palettes
        WHERE owner_user_id IS NULL AND visibility = 'public'
          AND status IN ('candidate', 'published')
        GROUP BY exact_fingerprint_version, exact_fingerprint
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'active public Palette exact fingerprints must be unique before migration 021';
    END IF;
END $$;

ALTER TABLE palettes ADD CONSTRAINT chk_palette_exact_fingerprint
    CHECK ((exact_fingerprint IS NULL AND exact_fingerprint_version IS NULL) OR
           (exact_fingerprint ~ '^[0-9a-f]{64}$' AND exact_fingerprint_version = 1));

CREATE UNIQUE INDEX idx_palette_active_public_exact_fingerprint
    ON palettes(exact_fingerprint_version, exact_fingerprint)
    WHERE owner_user_id IS NULL AND visibility = 'public'
      AND status IN ('candidate', 'published') AND exact_fingerprint IS NOT NULL;

CREATE TABLE palette_assistant_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL REFERENCES users(id),
    operation VARCHAR(80) NOT NULL,
    idempotency_key UUID NOT NULL,
    create_intent_digest CHAR(64) NOT NULL CHECK (create_intent_digest ~ '^[0-9a-f]{64}$'),
    draft_digest CHAR(64) NOT NULL CHECK (draft_digest ~ '^[0-9a-f]{64}$'),
    finding_set_digest CHAR(64) NOT NULL CHECK (finding_set_digest ~ '^[0-9a-f]{64}$'),
    registry_fingerprint CHAR(64) NOT NULL CHECK (registry_fingerprint ~ '^[0-9a-f]{64}$'),
    duplicate_policy_version INTEGER NOT NULL CHECK (duplicate_policy_version > 0),
    similarity_policy_version INTEGER NOT NULL CHECK (similarity_policy_version > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('processing','succeeded','failed')),
    candidate_id UUID REFERENCES palettes(id),
    candidate_receipt JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    UNIQUE(actor_user_id, operation, idempotency_key),
    CHECK ((status = 'succeeded') = (candidate_id IS NOT NULL AND candidate_receipt IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE INDEX idx_palette_assistant_submissions_candidate ON palette_assistant_submissions(candidate_id);

COMMIT;
