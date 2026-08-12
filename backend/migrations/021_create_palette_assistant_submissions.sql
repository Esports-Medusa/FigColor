BEGIN;

ALTER TABLE palettes
    ADD COLUMN exact_fingerprint CHAR(64),
    ADD COLUMN exact_fingerprint_version INTEGER;

-- Fail closed before any fingerprint backfill. Legacy JSON is inspected, not
-- repaired or normalized, so the SQL projection has exactly the Go/JCS input.
DO $$
DECLARE
    palette_row RECORD;
    color_row RECORD;
    color_total INTEGER;
    order_total INTEGER;
BEGIN
    FOR palette_row IN SELECT id, colors FROM palettes LOOP
        IF jsonb_typeof(palette_row.colors) IS DISTINCT FROM 'array'
           OR jsonb_array_length(palette_row.colors) = 0 THEN
            RAISE EXCEPTION 'migration 021 legacy palette color shape is invalid for palette %', palette_row.id;
        END IF;
        color_total := jsonb_array_length(palette_row.colors);
        FOR color_row IN SELECT value FROM jsonb_array_elements(palette_row.colors) LOOP
            IF jsonb_typeof(color_row.value) IS DISTINCT FROM 'object'
               OR jsonb_typeof(color_row.value->'hex') IS DISTINCT FROM 'string'
               OR (color_row.value->>'hex') !~ '^#[0-9A-F]{6}$'
               OR jsonb_typeof(color_row.value->'order') IS DISTINCT FROM 'number'
               OR (color_row.value->>'order')::numeric <> trunc((color_row.value->>'order')::numeric)
               OR (color_row.value->>'order')::numeric < 0
               OR (color_row.value->>'order')::numeric >= color_total THEN
                RAISE EXCEPTION 'migration 021 legacy palette color shape is invalid for palette %', palette_row.id;
            END IF;
        END LOOP;
        SELECT count(DISTINCT (value->>'order')::integer)
          INTO order_total FROM jsonb_array_elements(palette_row.colors);
        IF order_total <> color_total OR EXISTS (
            SELECT 1 FROM generate_series(0, color_total - 1) expected
            WHERE NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(palette_row.colors) color
                WHERE (color->>'order')::integer = expected
            )
        ) THEN
            RAISE EXCEPTION 'migration 021 legacy palette color order is invalid for palette %', palette_row.id;
        END IF;
    END LOOP;
END $$;

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
          AND (exact_fingerprint IS NULL OR exact_fingerprint_version <> 1)
    ) THEN
        RAISE EXCEPTION 'migration 021 active public Palette exact fingerprint could not be computed';
    END IF;
END $$;

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
