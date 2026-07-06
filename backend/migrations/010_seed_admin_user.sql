-- FigColor Admin Manager v0.1 - Seed Script
-- Create an admin user for testing
-- Run this AFTER migration 008 has added the role column

-- First, generate bcrypt hash for "admin123" with cost 12
-- The hash below was generated using: bcrypt.GenerateFromPassword([]byte("admin123"), 12)
-- NOTE: BCryptCost in config.go must be 12 to verify this hash

DO $$
BEGIN
    -- Check if role column exists before trying to insert
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        RAISE EXCEPTION 'Migration 008 not applied: role column does not exist. Run migrations first.';
    END IF;

    -- Insert or update admin user
    INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at)
    VALUES (
        'admin@figcolor.local',
        '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.4W6CWZ5f7.IGq',
        'Admin',
        'admin',
        'active',
        NOW(),
        NOW()
    ) ON CONFLICT (email) DO UPDATE SET 
        password_hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.4W6CWZ5f7.IGq',
        role = 'admin',
        name = 'Admin',
        updated_at = NOW();

    RAISE NOTICE 'Admin user admin@figcolor.local has been created/updated';
END $$;