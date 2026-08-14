package middleware

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/database"
	figjwt "github.com/qiqi/figcolor/backend/internal/jwt"
	"github.com/qiqi/figcolor/backend/internal/user"
)

type authScriptedState struct {
	mu   sync.Mutex
	role string
}

var authState *authScriptedState

func init() {
	sql.Register("figcolor_auth_middleware_test", authScriptedDriver{})
}

func TestAdminMiddlewareAuthenticationAndAuthorization(t *testing.T) {
	const secret = "test-secret"

	for _, tc := range []struct {
		name       string
		role       string
		withToken  bool
		wantStatus int
	}{
		{name: "anonymous", withToken: false, wantStatus: http.StatusUnauthorized},
		{name: "normal user", role: "user", withToken: true, wantStatus: http.StatusForbidden},
		{name: "admin", role: "admin", withToken: true, wantStatus: http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			restoreDB := installAuthScriptedDB(t, tc.role)
			defer restoreDB()

			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.GET("/api/admin/ping", Auth(secret, user.NewRepository()), AdminRequired(), func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"ok": true})
			})

			req := httptest.NewRequest(http.MethodGet, "/api/admin/ping", nil)
			if tc.withToken {
				token, err := figjwt.GenerateToken("user-1", "user@example.com", 1, secret, time.Hour)
				if err != nil {
					t.Fatalf("generate token: %v", err)
				}
				req.Header.Set(AuthorizationHeader, BearerPrefix+token)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}

func installAuthScriptedDB(t *testing.T, role string) func() {
	t.Helper()
	previousDB := database.DB
	state := &authScriptedState{role: role}
	authState = state
	db, err := sql.Open("figcolor_auth_middleware_test", "test")
	if err != nil {
		t.Fatalf("open scripted db: %v", err)
	}
	database.DB = db
	return func() {
		db.Close()
		database.DB = previousDB
		authState = nil
	}
}

type authScriptedDriver struct{}

func (authScriptedDriver) Open(name string) (driver.Conn, error) {
	return authScriptedConn{}, nil
}

type authScriptedConn struct{}

func (authScriptedConn) Prepare(query string) (driver.Stmt, error) {
	return nil, errors.New("prepare is not supported")
}

func (authScriptedConn) Close() error {
	return nil
}

func (authScriptedConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions are not supported")
}

func (authScriptedConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	authState.mu.Lock()
	defer authState.mu.Unlock()
	if authState.role == "" {
		return &authRows{columns: userColumns}, nil
	}
	now := time.Now()
	return &authRows{
		columns: userColumns,
		values: [][]driver.Value{{
			"user-1",
			"user@example.com",
			true,
			now,
			nil,
			nil,
			authState.role,
			"active",
			now,
			now,
			nil,
			int64(1),
		}},
	}, nil
}

var userColumns = []string{"id", "email", "email_verified", "email_verified_at", "name", "avatar_url", "role", "status", "created_at", "updated_at", "password_changed_at", "auth_version"}

type authRows struct {
	columns []string
	values  [][]driver.Value
	index   int
}

func (r *authRows) Columns() []string {
	return r.columns
}

func (r *authRows) Close() error {
	return nil
}

func (r *authRows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	copy(dest, r.values[r.index])
	r.index++
	return nil
}
