-- Migration 017: Add palette ownership and visibility metadata.
-- Public catalog palettes and user/project palettes share the palettes table,
-- but public browse endpoints must only expose public, published rows.

BEGIN;

ALTER TABLE palettes
  ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS source_palette_id UUID NULL;

-- Existing rows are official catalog rows unless a project association below
-- proves they are user-owned project palettes.
UPDATE palettes
SET
  visibility = COALESCE(visibility, 'public'),
  origin = COALESCE(origin, 'curated')
WHERE visibility IS NULL
   OR origin IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'palettes_owner_user_id_fkey') THEN
    ALTER TABLE palettes DROP CONSTRAINT palettes_owner_user_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'palettes_source_palette_id_fkey') THEN
    ALTER TABLE palettes DROP CONSTRAINT palettes_source_palette_id_fkey;
  END IF;
END $$;

-- Existing project default palettes were inserted into palettes as published
-- catalog rows. Reclassify them as private user palettes.
UPDATE palettes p
SET
  owner_user_id = project_owner.user_id,
  visibility = 'private',
  origin = 'custom',
  status = 'draft',
  published_at = NULL,
  updated_at = NOW()
FROM (
  SELECT DISTINCT pp.base_palette_id, pr.user_id
  FROM project_palettes pp
  JOIN paper_projects pr ON pr.id = pp.project_id
  WHERE pp.base_palette_id IS NOT NULL
    AND pr.user_id IS NOT NULL
) AS project_owner
WHERE p.id = project_owner.base_palette_id
  AND (
    p.slug LIKE 'project-default-%'
    OR p.slug LIKE 'project-%'
    OR 'project_default' = ANY(p.tags)
    OR p.version = 'project-default'
    OR p.version = 'project-backfill'
  );

DO $$
DECLARE
  shared_count INTEGER;
  missing_owner_count INTEGER;
  orphan_private_count INTEGER;
  public_project_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO shared_count
  FROM (
    SELECT pp.base_palette_id
    FROM project_palettes pp
    JOIN paper_projects pr ON pr.id = pp.project_id
    JOIN palettes p ON p.id = pp.base_palette_id
    WHERE pp.base_palette_id IS NOT NULL
      AND pr.user_id IS NOT NULL
      AND (
        p.slug LIKE 'project-default-%'
        OR p.slug LIKE 'project-%'
        OR 'project_default' = ANY(p.tags)
        OR p.version = 'project-default'
        OR p.version = 'project-backfill'
      )
    GROUP BY pp.base_palette_id
    HAVING COUNT(DISTINCT pr.user_id) > 1
  ) shared;

  IF shared_count > 0 THEN
    RAISE EXCEPTION 'Migration 017 cannot assign owner_user_id: % palette rows are associated with projects owned by multiple users', shared_count;
  END IF;

  SELECT COUNT(*)
    INTO missing_owner_count
  FROM project_palettes pp
  JOIN paper_projects pr ON pr.id = pp.project_id
  JOIN palettes p ON p.id = pp.base_palette_id
  WHERE pp.base_palette_id IS NOT NULL
    AND pr.user_id IS NULL
    AND (
      p.slug LIKE 'project-default-%'
      OR p.slug LIKE 'project-%'
      OR 'project_default' = ANY(p.tags)
      OR p.version = 'project-default'
      OR p.version = 'project-backfill'
    );

  IF missing_owner_count > 0 THEN
    RAISE EXCEPTION 'Migration 017 cannot assign owner_user_id: % project palette associations have no project owner', missing_owner_count;
  END IF;

  SELECT COUNT(*)
    INTO orphan_private_count
  FROM palettes
  WHERE visibility = 'private'
    AND owner_user_id IS NULL;

  IF orphan_private_count > 0 THEN
    RAISE EXCEPTION 'Migration 017 produced % private palettes without owner_user_id', orphan_private_count;
  END IF;

  SELECT COUNT(*)
    INTO public_project_count
  FROM project_palettes pp
  JOIN palettes p ON p.id = pp.base_palette_id
  WHERE p.visibility = 'public'
    AND (
      p.slug LIKE 'project-default-%'
      OR p.slug LIKE 'project-%'
      OR 'project_default' = ANY(p.tags)
      OR p.version = 'project-default'
      OR p.version = 'project-backfill'
    );

  IF public_project_count > 0 THEN
    RAISE EXCEPTION 'Migration 017 left % project-associated palettes public', public_project_count;
  END IF;
END $$;

ALTER TABLE palettes
  ALTER COLUMN visibility SET DEFAULT 'private',
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN origin SET DEFAULT 'custom',
  ALTER COLUMN origin SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_owner_user_id_fkey'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_source_palette_id_fkey'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_source_palette_id_fkey
      FOREIGN KEY (source_palette_id) REFERENCES palettes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_visibility_check'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_visibility_check
      CHECK (visibility IN ('public', 'private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_origin_check'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_origin_check
      CHECK (origin IN ('curated', 'custom', 'fork'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_private_owner_check'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_private_owner_check
      CHECK (visibility <> 'private' OR owner_user_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_fork_source_check'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_fork_source_check
      CHECK (origin <> 'fork' OR source_palette_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palettes_source_not_self_check'
  ) THEN
    ALTER TABLE palettes
      ADD CONSTRAINT palettes_source_not_self_check
      CHECK (source_palette_id IS NULL OR source_palette_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_palettes_public_catalog
  ON palettes (status, created_at DESC)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_palettes_private_owner
  ON palettes (owner_user_id, updated_at DESC)
  WHERE visibility = 'private';

COMMIT;
