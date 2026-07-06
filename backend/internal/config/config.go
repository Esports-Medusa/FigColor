package config

import (
	"os"
	"time"
)

type Config struct {
	DatabaseURL string
	ServerPort  string
	JWTSecret   string
	JWTExpiry   time.Duration
	BCryptCost  int
}

func Load() *Config {
	return &Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgres://localhost:5432/figcolor?sslmode=disable"),
		ServerPort:  getEnv("SERVER_PORT", "8080"),
		JWTSecret:   getEnv("JWT_SECRET", "figcolor-dev-secret-change-in-production"),
		JWTExpiry:   24 * time.Hour,
		BCryptCost:  12,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}