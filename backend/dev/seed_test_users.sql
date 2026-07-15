-- FigColor local development test users
-- Password for all seeded test users: "test1234"

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        RAISE EXCEPTION 'Migration 008 not applied: role column does not exist. Run migrations first.';
    END IF;

    INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at)
    VALUES
        (
            'test1@figcolor.local',
            '$2a$12$oDeXlmi2x9rAbJoyLrWOAOxM4svPTfxUOi4Mjc089Vhe.3gu4qUy6',
            'Test User 1',
            'user',
            'active',
            NOW(),
            NOW()
        ),
        (
            'test2@figcolor.local',
            '$2a$12$oDeXlmi2x9rAbJoyLrWOAOxM4svPTfxUOi4Mjc089Vhe.3gu4qUy6',
            'Test User 2',
            'user',
            'active',
            NOW(),
            NOW()
        ),
        (
            'test3@figcolor.local',
            '$2a$12$oDeXlmi2x9rAbJoyLrWOAOxM4svPTfxUOi4Mjc089Vhe.3gu4qUy6',
            'Test User 3',
            'user',
            'active',
            NOW(),
            NOW()
        )
    ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = NOW();

    RAISE NOTICE 'Test users test1@figcolor.local, test2@figcolor.local, test3@figcolor.local have been created/updated';
END $$;
