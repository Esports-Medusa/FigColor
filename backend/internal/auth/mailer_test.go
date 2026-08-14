package auth

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type resendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
}

func TestResendMailerSendsTransactionalMessages(t *testing.T) {
	requests := make(chan resendRequest, 3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/emails" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-api-key" {
			t.Errorf("Authorization = %q", got)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q", got)
		}
		var request resendRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode request: %v", err)
		}
		requests <- request
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	mailer := NewResendMailer("test-api-key", "FigColor <no-reply@mail.figcolor.com>")
	mailer.Endpoint = server.URL + "/emails"

	tests := []struct {
		name    string
		subject string
		link    string
		send    func() error
	}{
		{"verification", "Verify your FigColor email", "https://figcolor.com/verify-email?token=verify-secret", func() error {
			return mailer.SendVerificationEmail("person@example.com", "https://figcolor.com/verify-email?token=verify-secret")
		}},
		{"password reset", "Reset your FigColor password", "https://figcolor.com/reset-password?token=reset-secret", func() error {
			return mailer.SendPasswordResetEmail("person@example.com", "https://figcolor.com/reset-password?token=reset-secret")
		}},
		{"password changed", "Your FigColor password was changed", "", func() error {
			return mailer.SendPasswordChangedEmail("person@example.com")
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.send(); err != nil {
				t.Fatalf("send: %v", err)
			}
			request := <-requests
			if request.From != "FigColor <no-reply@mail.figcolor.com>" || len(request.To) != 1 || request.To[0] != "person@example.com" {
				t.Errorf("unexpected envelope: %+v", request)
			}
			if request.Subject != tt.subject {
				t.Errorf("subject = %q", request.Subject)
			}
			if tt.link != "" && !strings.Contains(request.Text, tt.link) {
				t.Error("message does not contain its transactional link")
			}
		})
	}
}

func TestResendMailerRejectsNon2xxWithoutResponseBody(t *testing.T) {
	const sensitiveBody = `{"message":"token=must-not-leak","name":"validation_error"}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Request-Id", "safe-request-id")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = io.WriteString(w, sensitiveBody)
	}))
	defer server.Close()

	mailer := NewResendMailer("test-api-key", "sender@example.com")
	mailer.Endpoint = server.URL
	err := mailer.SendVerificationEmail("person@example.com", "https://figcolor.com/verify-email?token=secret")
	if err == nil {
		t.Fatal("expected delivery failure")
	}
	got := err.Error()
	if !strings.Contains(got, "status=422") || !strings.Contains(got, "safe-request-id") {
		t.Fatalf("error lacks safe metadata: %q", got)
	}
	if strings.Contains(got, "must-not-leak") || strings.Contains(got, "token=secret") {
		t.Fatalf("error leaked sensitive content: %q", got)
	}
}

func TestResendMailerUsesHTTPClientTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	mailer := NewResendMailer("test-api-key", "sender@example.com")
	mailer.Endpoint = server.URL
	mailer.Client.Timeout = 10 * time.Millisecond
	if err := mailer.SendPasswordResetEmail("person@example.com", "https://figcolor.com/reset-password?token=secret"); err == nil {
		t.Fatal("expected timeout delivery failure")
	}
}
