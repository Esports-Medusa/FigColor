-- FigColor Auth System MVP - Migration 006
-- Add user_id to paper_projects for user isolation

-- Drop existing foreign key if any
ALTER TABLE paper_projects DROP CONSTRAINT IF EXISTS fk_paper_projects_user;

-- Add user_id column (nullable first to avoid breaking existing data)
ALTER TABLE paper_projects ADD COLUMN IF NOT EXISTS user_id UUID;

-- For development: assign all existing projects to a default user
-- We create a default anonymous user first
INSERT INTO users (id, email, name, status)
VALUES ('00000000-0000-0000-0000-000000000000', 'anonymous@figcolor.local', 'Anonymous User', 'active')
ON CONFLICT (email) DO NOTHING;

-- Update all existing projects to belong to anonymous user
UPDATE paper_projects SET user_id = '00000000-0000-0000-0000-000000000000' 
WHERE user_id IS NULL;

-- Set NOT NULL constraint
ALTER TABLE paper_projects ALTER COLUMN user_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE paper_projects ADD CONSTRAINT fk_paper_projects_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create index for user isolation queries
CREATE INDEX IF NOT EXISTS idx_paper_projects_user_id ON paper_projects(user_id);
