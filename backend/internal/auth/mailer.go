package auth

import (
	"fmt"
	"log"
	"net/smtp"
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
