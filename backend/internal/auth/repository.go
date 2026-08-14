package auth

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/qiqi/figcolor/backend/internal/database"
)

const (
	PurposeVerifyEmail   = "verify_email"
	PurposeResetPassword = "reset_password"
)

type Repository struct{}

func NewRepository() *Repository { return &Repository{} }

func (r *Repository) ReplaceToken(userID, purpose, tokenHash string, expiresAt time.Time) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`UPDATE auth_tokens SET consumed_at = NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL`, userID, purpose); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO auth_tokens (user_id,purpose,token_hash,expires_at) VALUES ($1,$2,$3,$4)`, userID, purpose, tokenHash, expiresAt); err != nil {
		return err
	}
	return tx.Commit()
}

// TokenState permits stable INVALID/EXPIRED/CONSUMED errors without exposing token data.
func (r *Repository) TokenState(tokenHash, purpose string) (string, error) {
	var expires time.Time
	var consumed sql.NullTime
	err := database.DB.QueryRow(`SELECT expires_at, consumed_at FROM auth_tokens WHERE token_hash=$1 AND purpose=$2`, tokenHash, purpose).Scan(&expires, &consumed)
	if err == sql.ErrNoRows {
		return "invalid", nil
	}
	if err != nil {
		return "", err
	}
	if consumed.Valid {
		return "consumed", nil
	}
	if !expires.After(time.Now()) {
		return "expired", nil
	}
	return "valid", nil
}

func (r *Repository) ValidTokenUser(tokenHash, purpose string) (string, error) {
	var userID string
	err := database.DB.QueryRow(`SELECT user_id FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW()`, tokenHash, purpose).Scan(&userID)
	return userID, err
}

func (r *Repository) ConsumeVerification(tokenHash string) (string, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var userID string
	err = tx.QueryRow(`UPDATE auth_tokens SET consumed_at=NOW() WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW() RETURNING user_id`, tokenHash, PurposeVerifyEmail).Scan(&userID)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(`UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()), email_verified=TRUE, updated_at=NOW() WHERE id=$1`, userID)
	if err != nil {
		return "", err
	}
	if err = insertAudit(tx, userID, "email_verified", "self", nil); err != nil {
		return "", err
	}
	return userID, tx.Commit()
}

func (r *Repository) ConsumeReset(tokenHash, passwordHash string) (string, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var userID string
	err = tx.QueryRow(`UPDATE auth_tokens SET consumed_at=NOW() WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW() RETURNING user_id`, tokenHash, PurposeResetPassword).Scan(&userID)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(`UPDATE users SET password_hash=$1,password_changed_at=NOW(),auth_version=auth_version+1,updated_at=NOW() WHERE id=$2`, passwordHash, userID)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(`UPDATE auth_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL`, userID)
	if err != nil {
		return "", err
	}
	if err = insertAudit(tx, userID, "password_reset", "self", nil); err != nil {
		return "", err
	}
	return userID, tx.Commit()
}

func (r *Repository) LastTokenCreatedAt(userID, purpose string) (*time.Time, error) {
	var at time.Time
	err := database.DB.QueryRow(`SELECT created_at FROM auth_tokens WHERE user_id=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1`, userID, purpose).Scan(&at)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &at, err
}

func insertAudit(tx *sql.Tx, userID, event, actor string, metadata any) error {
	payload := []byte(`{}`)
	if metadata != nil {
		var err error
		payload, err = json.Marshal(metadata)
		if err != nil {
			return err
		}
	}
	_, err := tx.Exec(`INSERT INTO auth_audit_events(user_id,event_type,actor,metadata) VALUES($1,$2,$3,$4)`, userID, event, actor, payload)
	return err
}

func (r *Repository) UserEmail(userID string) (string, error) {
	var email string
	err := database.DB.QueryRow(`SELECT email FROM users WHERE id=$1`, userID).Scan(&email)
	if err != nil {
		return "", fmt.Errorf("get user email: %w", err)
	}
	return email, nil
}
