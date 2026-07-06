-- FigColor Admin Manager v0.1 - Migration 009
-- Create palettes table for admin management
-- Idempotent - safe to re-run

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Only create table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'palettes'
    ) THEN
        CREATE TABLE palettes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          slug VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          colors JSONB NOT NULL,
          color_count INT NOT NULL CHECK (color_count > 0),
          type VARCHAR(50) NOT NULL CHECK (type IN ('categorical', 'sequential', 'diverging', 'qualitative', 'heatmap')),
          chart_types TEXT[],
          journal_style TEXT[],
          discipline TEXT[],
          use_case TEXT[],
          tags TEXT[],
          accessibility JSONB NOT NULL DEFAULT '{"colorblind_safe": false, "print_friendly": false, "dark_background": false}',
          source_type VARCHAR(50) CHECK (source_type IN ('manual', 'figure_extracted', 'curated')),
          source_image TEXT,
          source_note TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'candidate', 'published', 'archived')),
          version VARCHAR(50),
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          published_at TIMESTAMPTZ,
          archived_at TIMESTAMPTZ
        );

        -- Indexes for filtering and queries
        CREATE INDEX idx_palettes_status ON palettes(status);
        CREATE INDEX idx_palettes_type ON palettes(type);
        CREATE INDEX idx_palettes_created_by ON palettes(created_by);
        CREATE INDEX idx_palettes_created_at ON palettes(created_at DESC);
        CREATE INDEX idx_palettes_slug ON palettes(slug);

        RAISE NOTICE 'Migration 009: palettes table created successfully';
    ELSE
        RAISE NOTICE 'Migration 009: palettes table already exists, skipping';
    END IF;
END $$;