-- FigColor Admin Manager v0.1 - Migration 011
-- Add avoid_case column to palettes table
-- Idempotent - safe to re-run

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'palettes' AND column_name = 'avoid_case'
    ) THEN
        ALTER TABLE palettes ADD COLUMN avoid_case TEXT[];
        CREATE INDEX idx_palettes_avoid_case ON palettes USING GIN (avoid_case);
        RAISE NOTICE 'Migration 011: avoid_case column added to palettes table';
    ELSE
        RAISE NOTICE 'Migration 011: avoid_case column already exists, skipping';
    END IF;
END $$;