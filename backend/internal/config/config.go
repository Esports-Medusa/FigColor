package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL       string
	ServerPort        string
	JWTSecret         string
	JWTExpiry         time.Duration
	BCryptCost        int
	IngestionRecovery IngestionRecoveryConfig
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
	return &Config{
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://localhost:5432/figcolor?sslmode=disable"),
		ServerPort:        getEnv("SERVER_PORT", "8080"),
		JWTSecret:         getEnv("JWT_SECRET", "figcolor-dev-secret-change-in-production"),
		JWTExpiry:         24 * time.Hour,
		BCryptCost:        12,
		IngestionRecovery: ingestionRecovery,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
