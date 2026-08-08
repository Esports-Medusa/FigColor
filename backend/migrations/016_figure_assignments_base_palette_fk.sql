-- Migration 016: Store base palette IDs in figure_assignments.palette_id.
-- figure_assignments.palette_id now targets palettes(id), while project_palettes
-- keeps the project-level palette association and role mapping.

BEGIN;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name
    INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'figure_assignments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'palette_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE figure_assignments DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

WITH palette_sources AS (
  SELECT
    pp.id AS project_palette_id,
    pp.name,
    COALESCE(
      role_colors.colors,
      '[{"id":"color-0","hex":"#3D5A80","rgb":[61,90,128],"label":"Color 1","order":0}]'::jsonb
    ) AS colors,
    GREATEST(COALESCE(role_colors.color_count, 0), 1) AS color_count
  FROM project_palettes pp
  LEFT JOIN LATERAL (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'id', ranked.key,
          'hex', '#' || ranked.clean_hex,
          'rgb', jsonb_build_array(
            get_byte(decode(ranked.clean_hex, 'hex'), 0),
            get_byte(decode(ranked.clean_hex, 'hex'), 1),
            get_byte(decode(ranked.clean_hex, 'hex'), 2)
          ),
          'label', ranked.label,
          'order', ranked.canonical_order
        )
        ORDER BY ranked.canonical_order
      ) AS colors,
      COUNT(*)::int AS color_count
    FROM (
      SELECT
        pr.key,
        pr.label,
        upper(regexp_replace(btrim(pr.color), '^#', '')) AS clean_hex,
        (row_number() OVER (ORDER BY pr.sort_order, pr.id) - 1)::int AS canonical_order
      FROM palette_roles pr
      WHERE pr.palette_id = pp.id
    ) ranked
  ) role_colors ON TRUE
  WHERE pp.base_palette_id IS NULL
),
created_palettes AS (
  INSERT INTO palettes (
    id, slug, name, colors, color_count, type, chart_types, journal_style,
    discipline, use_case, tags, accessibility, source_type, status, version,
    created_at, updated_at, published_at
  )
  SELECT
    gen_random_uuid(),
    'project-' || project_palette_id::text,
    name,
    colors,
    color_count,
    'categorical',
    ARRAY['bar', 'line', 'heatmap'],
    ARRAY['general'],
    ARRAY['general'],
    ARRAY['presentation'],
    ARRAY['project_default'],
    '{"colorblind_safe": false, "print_friendly": true, "dark_background": false}'::jsonb,
    'manual',
    'published',
    'project-backfill',
    NOW(),
    NOW(),
    NOW()
  FROM palette_sources
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        colors = EXCLUDED.colors,
        color_count = EXCLUDED.color_count,
        updated_at = NOW()
  RETURNING id, slug
)
UPDATE project_palettes pp
SET base_palette_id = cp.id,
    updated_at = NOW()
FROM created_palettes cp
WHERE cp.slug = 'project-' || pp.id::text
  AND pp.base_palette_id IS NULL;

UPDATE figure_assignments fa
SET palette_id = pp.base_palette_id
FROM project_palettes pp
WHERE fa.palette_id = pp.id
  AND pp.base_palette_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'project_palettes'
      AND constraint_name = 'project_palettes_base_palette_id_fkey'
  ) THEN
    ALTER TABLE project_palettes
      ADD CONSTRAINT project_palettes_base_palette_id_fkey
      FOREIGN KEY (base_palette_id) REFERENCES palettes(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE figure_assignments
  ADD CONSTRAINT figure_assignments_palette_id_fkey
  FOREIGN KEY (palette_id) REFERENCES palettes(id) ON DELETE RESTRICT;

COMMIT;
