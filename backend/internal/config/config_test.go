package config

import (
	"fmt"
	"testing"
)

func setBaseConfig(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://test")
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "a-production-secret-that-is-at-least-32-bytes")
	t.Setenv("APP_BASE_URL", "https://figcolor.com")
	t.Setenv("MAIL_PROVIDER", "log")
}

func expectPanic(t *testing.T, want string, fn func()) {
	t.Helper()
	defer func() {
		got := recover()
		if got == nil || fmt.Sprint(got) != want {
			t.Fatalf("panic = %v, want %q", got, want)
		}
	}()
	fn()
}

func TestLoadRequiresAppBaseURLInProduction(t *testing.T) {
	setBaseConfig(t)
	t.Setenv("APP_BASE_URL", "")
	expectPanic(t, "APP_BASE_URL is required in production", func() { Load() })
}

func TestLoadRequiresResendConfiguration(t *testing.T) {
	setBaseConfig(t)
	t.Setenv("MAIL_PROVIDER", "resend")
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("MAIL_FROM", "")
	expectPanic(t, "RESEND_API_KEY is required when MAIL_PROVIDER=resend", func() { Load() })

	t.Setenv("RESEND_API_KEY", "test-api-key")
	expectPanic(t, "MAIL_FROM is required when MAIL_PROVIDER=resend", func() { Load() })
}

func TestLoadAcceptsProductionResendConfiguration(t *testing.T) {
	setBaseConfig(t)
	t.Setenv("MAIL_PROVIDER", "resend")
	t.Setenv("RESEND_API_KEY", "test-api-key")
	t.Setenv("MAIL_FROM", "FigColor <no-reply@mail.figcolor.com>")
	cfg := Load()
	if cfg.MailProvider != "resend" || cfg.ResendAPIKey != "test-api-key" || cfg.AppBaseURL != "https://figcolor.com" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}
