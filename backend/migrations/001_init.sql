-- PostgreSQL UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Project table
CREATE TABLE IF NOT EXISTS paper_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  default_palette_id UUID NULL,  -- P0: no foreign key to avoid circular reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project palette table
CREATE TABLE IF NOT EXISTS project_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES paper_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_palette_id UUID NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key for default_palette_id after palette table is created
-- This is done in a separate statement to avoid circular reference
ALTER TABLE paper_projects ADD CONSTRAINT fk_default_palette 
  FOREIGN KEY (default_palette_id) REFERENCES project_palettes(id) ON DELETE SET NULL;

-- Palette role table
CREATE TABLE IF NOT EXISTS palette_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  palette_id UUID NOT NULL REFERENCES project_palettes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  role_type TEXT NOT NULL CHECK (role_type IN ('semantic', 'group', 'ui', 'custom')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (palette_id, key)
);

-- Figure assignment table
CREATE TABLE IF NOT EXISTS figure_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES paper_projects(id) ON DELETE CASCADE,
  palette_id UUID NOT NULL REFERENCES project_palettes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  panel TEXT NULL,
  chart_type TEXT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Figure role override table
CREATE TABLE IF NOT EXISTS figure_role_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  figure_id UUID NOT NULL REFERENCES figure_assignments(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  UNIQUE (figure_id, role_key)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_project_palettes_project_id ON project_palettes(project_id);
CREATE INDEX IF NOT EXISTS idx_palette_roles_palette_id ON palette_roles(palette_id);
CREATE INDEX IF NOT EXISTS idx_figure_assignments_project_id ON figure_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_figure_assignments_palette_id ON figure_assignments(palette_id);
CREATE INDEX IF NOT EXISTS idx_figure_role_overrides_figure_id ON figure_role_overrides(figure_id);