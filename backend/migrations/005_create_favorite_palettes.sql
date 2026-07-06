-- FigColor Auth System MVP - Migration 005
-- Create favorite_palettes table

CREATE TABLE IF NOT EXISTS favorite_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  palette_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, palette_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_palettes_user_id ON favorite_palettes(user_id);