-- FigColor Scientific Preview System - WP2A
-- Persist stable color IDs inside palettes.colors before preview cases can
-- safely reference palette colors by color_id.
--
-- This backfill preserves unknown historical color-object keys while
-- overriding the canonical keys owned by FigColor: id, hex, rgb, label, order.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE palettes DROP CONSTRAINT IF EXISTS palettes_type_check;
ALTER TABLE palettes
    ADD CONSTRAINT palettes_type_check
    CHECK (type IN ('categorical', 'sequential', 'diverging', 'mixed', 'qualitative', 'heatmap'));

DO $$
DECLARE
    invalid_palette_ids TEXT;
BEGIN
    SELECT string_agg(DISTINCT p.id::TEXT, ', ')
    INTO invalid_palette_ids
    FROM palettes p
    WHERE CASE
        WHEN jsonb_typeof(p.colors) <> 'array' THEN TRUE
        ELSE jsonb_array_length(p.colors) = 0
    END;

    IF invalid_palette_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 013 cannot normalize palettes.colors. colors must be a non-empty JSON array for palette id(s): %', invalid_palette_ids;
    END IF;

    SELECT string_agg(DISTINCT p.id::TEXT, ', ')
    INTO invalid_palette_ids
    FROM palettes p
    CROSS JOIN LATERAL jsonb_array_elements(p.colors) color(value)
    WHERE jsonb_typeof(color.value) <> 'object'
       OR btrim(coalesce(color.value->>'hex', '')) = ''
       OR upper(regexp_replace(btrim(color.value->>'hex'), '^#', '')) !~ '^[0-9A-F]{6}$';

    IF invalid_palette_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 013 cannot normalize palettes.colors. Invalid color data in palette id(s): %', invalid_palette_ids;
    END IF;

    SELECT string_agg(DISTINCT palette_id::TEXT, ', ')
    INTO invalid_palette_ids
    FROM (
        SELECT
            p.id AS palette_id,
            btrim(color.value->>'id') AS color_id
        FROM palettes p
        CROSS JOIN LATERAL jsonb_array_elements(p.colors) color(value)
        WHERE btrim(coalesce(color.value->>'id', '')) <> ''
        GROUP BY p.id, btrim(color.value->>'id')
        HAVING count(*) > 1
    ) duplicates;

    IF invalid_palette_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 013 cannot normalize palettes.colors. Duplicate color id(s) exist in palette id(s): %', invalid_palette_ids;
    END IF;
END $$;

WITH expanded AS (
    SELECT
        p.id AS palette_id,
        color.value AS color,
        color.ordinality,
        upper(regexp_replace(btrim(color.value->>'hex'), '^#', '')) AS clean_hex
    FROM palettes p
    CROSS JOIN LATERAL jsonb_array_elements(p.colors) WITH ORDINALITY AS color(value, ordinality)
),
normalized AS (
    SELECT
        palette_id,
        jsonb_agg(
            jsonb_strip_nulls(
                color || jsonb_build_object(
                    'id',
                    CASE
                        WHEN btrim(coalesce(color->>'id', '')) <> '' THEN btrim(color->>'id')
                        ELSE gen_random_uuid()::TEXT
                    END,
                    'hex', '#' || clean_hex,
                    'rgb', jsonb_build_array(
                        get_byte(decode(clean_hex, 'hex'), 0),
                        get_byte(decode(clean_hex, 'hex'), 1),
                        get_byte(decode(clean_hex, 'hex'), 2)
                    ),
                    'label',
                    CASE
                        WHEN jsonb_typeof(color->'label') = 'string'
                             AND btrim(color->>'label') <> '' THEN btrim(color->>'label')
                        ELSE NULL
                    END,
                    'order', ordinality - 1
                )
            )
            ORDER BY ordinality
        ) AS colors,
        count(*)::INT AS color_count
    FROM expanded
    GROUP BY palette_id
)
UPDATE palettes p
SET
    colors = normalized.colors,
    color_count = normalized.color_count
FROM normalized
WHERE p.id = normalized.palette_id;

COMMIT;
