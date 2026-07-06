-- FigColor Admin Manager v0.1 - Migration 008
-- Add role field to users table (idempotent)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Only add column if it doesn't exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
        ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('user', 'admin'));
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    END IF;
END $$;

-- Verify
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        RAISE NOTICE 'Migration 008: role column added successfully';
    ELSE
        RAISE WARNING 'Migration 008: role column may not exist';
    END IF;
END $$;