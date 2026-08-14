package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

type Mailer interface {
	SendVerificationEmail(to, link string) error
	SendPasswordResetEmail(to, link string) error
	SendPasswordChangedEmail(to string) error
}

// LogMailer is safe for local development: it records the delivery target and
// kind, while the URL is intentionally not logged because it contains a token.
type LogMailer struct{}

func (LogMailer) SendVerificationEmail(to, _ string) error {
	log.Printf("[mail] verification email queued for %s", to)
	return nil
}
func (LogMailer) SendPasswordResetEmail(to, _ string) error {
	log.Printf("[mail] password reset email queued for %s", to)
	return nil
}
func (LogMailer) SendPasswordChangedEmail(to string) error {
	log.Printf("[mail] password changed notification queued for %s", to)
	return nil
}

// SMTPMailer works with Mailpit (localhost:1025) and other unauthenticated SMTP relays.
type SMTPMailer struct {
	Addr string
	From string
}

const resendEmailsEndpoint = "https://api.resend.com/emails"

// ResendMailer delivers transactional email through the Resend HTTP API.
type ResendMailer struct {
	APIKey   string
	From     string
	Client   *http.Client
	Endpoint string
}

func NewResendMailer(apiKey, from string) *ResendMailer {
	return &ResendMailer{
		APIKey:   apiKey,
		From:     from,
		Client:   &http.Client{Timeout: 10 * time.Second},
		Endpoint: resendEmailsEndpoint,
	}
}

func (m *ResendMailer) send(to, subject, body string) error {
	payload, err := json.Marshal(struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
	}{m.From, []string{to}, subject, body})
	if err != nil {
		return fmt.Errorf("encode resend request: %w", err)
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, m.Endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+m.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := m.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("resend delivery request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		requestID := strings.TrimSpace(resp.Header.Get("X-Request-Id"))
		if requestID != "" {
			return fmt.Errorf("resend delivery failed: status=%d request_id=%q", resp.StatusCode, requestID)
		}
		return fmt.Errorf("resend delivery failed: status=%d", resp.StatusCode)
	}
	return nil
}

func (m *ResendMailer) SendVerificationEmail(to, link string) error {
	return m.send(to, "Verify your FigColor email", "Verify your account:\n\n"+link+"\n\nThis link expires in 24 hours.")
}

func (m *ResendMailer) SendPasswordResetEmail(to, link string) error {
	return m.send(to, "Reset your FigColor password", "Reset your password:\n\n"+link+"\n\nThis link expires in 30 minutes.")
}

func (m *ResendMailer) SendPasswordChangedEmail(to string) error {
	return m.send(to, "Your FigColor password was changed", "Your FigColor password was changed. If this was not you, contact support immediately.")
}

func (m SMTPMailer) send(to, subject, body string) error {
	message := []byte(fmt.Sprintf("To: %s\r\nFrom: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", to, m.From, subject, body))
	return smtp.SendMail(m.Addr, nil, m.From, []string{to}, message)
}
func (m SMTPMailer) SendVerificationEmail(to, link string) error {
	return m.send(to, "Verify your FigColor email", "Verify your account:\n\n"+link+"\n\nThis link expires in 24 hours.")
}
func (m SMTPMailer) SendPasswordResetEmail(to, link string) error {
	return m.send(to, "Reset your FigColor password", "Reset your password:\n\n"+link+"\n\nThis link expires in 30 minutes.")
}
func (m SMTPMailer) SendPasswordChangedEmail(to string) error {
	return m.send(to, "Your FigColor password was changed", "Your FigColor password was changed. If this was not you, contact support immediately.")
}
