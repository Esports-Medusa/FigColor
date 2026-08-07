-- Migration 007: Handle existing projects without user_id
-- This migration ensures existing projects are owned by a system user,
-- so new users won't see unrelated projects

BEGIN;

-- Create or find the anonymous user (for projects that existed before user system)
INSERT INTO users (id, email, name, status, created_at, updated_at)
SELECT 
    gen_random_uuid()::uuid,
    'anonymous@system.local',
    'System Anonymous',
    'active',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'anonymous@system.local');

-- Update all projects with NULL user_id to use the anonymous user
UPDATE paper_projects 
SET user_id = (SELECT id FROM users WHERE email = 'anonymous@system.local' LIMIT 1)
WHERE user_id IS NULL;

-- Update all projects with empty/invalid user_id to use the anonymous user
UPDATE paper_projects 
SET user_id = (SELECT id FROM users WHERE email = 'anonymous@system.local' LIMIT 1)
WHERE user_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = paper_projects.user_id
);

-- Add NOT NULL constraint now that all projects have valid user_id
ALTER TABLE paper_projects ALTER COLUMN user_id SET NOT NULL;

COMMIT;
