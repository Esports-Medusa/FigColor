-- Migration: Add figure_selected_roles table
-- This table stores which roles are selected for each figure

CREATE TABLE IF NOT EXISTS figure_selected_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  figure_id UUID NOT NULL REFERENCES figure_assignments(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (figure_id, role_key)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_figure_selected_roles_figure_id ON figure_selected_roles(figure_id);