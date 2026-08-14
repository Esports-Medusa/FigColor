package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL          string
	ServerPort           string
	JWTSecret            string
	JWTExpiry            time.Duration
	BCryptCost           int
	AppBaseURL           string
	EmailVerificationTTL time.Duration
	PasswordResetTTL     time.Duration
	Environment          string
	SMTPAddr             string
	MailProvider         string
	MailFrom             string
	ResendAPIKey         string
	CORSAllowedOrigins   []string
	IngestionRecovery    IngestionRecoveryConfig
}

const (
	DefaultPaletteIngestionLeaseSeconds = 300
	MinPaletteIngestionLeaseSeconds     = 30
	MaxPaletteIngestionLeaseSeconds     = 1800
	PaletteIngestionRetryBackoffSeconds = 5
	PaletteIngestionAttemptLimit        = 3
	IngestionUnknownRetryAfterSeconds   = 5
)

type IngestionRecoveryConfig struct {
	LeaseSeconds             int
	RetryBackoffSeconds      int
	AutomaticAttemptLimit    int
	UnknownRetryAfterSeconds int
}

func LoadIngestionRecoveryConfig() (IngestionRecoveryConfig, error) {
	seconds := DefaultPaletteIngestionLeaseSeconds
	if raw := os.Getenv("PALETTE_INGESTION_LEASE_SECONDS"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return IngestionRecoveryConfig{}, fmt.Errorf("PALETTE_INGESTION_LEASE_SECONDS must be an integer number of seconds")
		}
		seconds = value
	}
	if seconds < MinPaletteIngestionLeaseSeconds || seconds > MaxPaletteIngestionLeaseSeconds {
		return IngestionRecoveryConfig{}, fmt.Errorf("PALETTE_INGESTION_LEASE_SECONDS must be between %d and %d", MinPaletteIngestionLeaseSeconds, MaxPaletteIngestionLeaseSeconds)
	}
	return IngestionRecoveryConfig{
		LeaseSeconds:             seconds,
		RetryBackoffSeconds:      PaletteIngestionRetryBackoffSeconds,
		AutomaticAttemptLimit:    PaletteIngestionAttemptLimit,
		UnknownRetryAfterSeconds: IngestionUnknownRetryAfterSeconds,
	}, nil
}

func Load() *Config {
	ingestionRecovery, err := LoadIngestionRecoveryConfig()
	if err != nil {
		panic(err)
	}
	appBaseURL := os.Getenv("APP_BASE_URL")
	if appBaseURL == "" {
		appBaseURL = "http://localhost:5173"
	}
	cfg := &Config{
		DatabaseURL:          requiredEnv("DATABASE_URL"),
		ServerPort:           firstEnv([]string{"PORT", "SERVER_PORT"}, "8080"),
		JWTSecret:            getEnv("JWT_SECRET", "figcolor-dev-secret-change-in-production"),
		JWTExpiry:            24 * time.Hour,
		BCryptCost:           12,
		AppBaseURL:           appBaseURL,
		EmailVerificationTTL: 24 * time.Hour,
		PasswordResetTTL:     30 * time.Minute,
		Environment:          getEnv("APP_ENV", "development"),
		SMTPAddr:             getEnv("SMTP_ADDR", "localhost:1025"),
		MailProvider:         getEnv("MAIL_PROVIDER", "smtp"),
		MailFrom:             getEnv("MAIL_FROM", "noreply@figcolor.local"),
		ResendAPIKey:         os.Getenv("RESEND_API_KEY"),
		CORSAllowedOrigins:   splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		IngestionRecovery:    ingestionRecovery,
	}
	if cfg.Environment == "production" && (cfg.JWTSecret == "figcolor-dev-secret-change-in-production" || len(cfg.JWTSecret) < 32) {
		panic("JWT_SECRET must be changed to a strong value in production")
	}
	if cfg.Environment == "production" && os.Getenv("APP_BASE_URL") == "" {
		panic("APP_BASE_URL is required in production")
	}
	if cfg.MailProvider == "resend" {
		if cfg.ResendAPIKey == "" {
			panic("RESEND_API_KEY is required when MAIL_PROVIDER=resend")
		}
		if os.Getenv("MAIL_FROM") == "" {
			panic("MAIL_FROM is required when MAIL_PROVIDER=resend")
		}
	}
	return cfg
}

func requiredEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic(key + " is required")
	}
	return value
}

func firstEnv(keys []string, defaultValue string) string {
	for _, key := range keys {
		if value := os.Getenv(key); value != "" {
			return value
		}
	}
	return defaultValue
}

func splitCSV(value string) []string {
	var values []string
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	return values
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
