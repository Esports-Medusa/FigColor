-- FigColor Auth System MVP - Migration 004
-- Create auth_providers table for OAuth providers (future wechat, google, etc.)

CREATE TABLE IF NOT EXISTS auth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255),
  openid VARCHAR(255),
  unionid VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id),
  UNIQUE(provider, openid)
);

CREATE INDEX IF NOT EXISTS idx_auth_providers_user_id ON auth_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_providers_provider ON auth_providers(provider);