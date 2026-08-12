package submission

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
	pa "github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

const jsonBodyLimit = 512 * 1024

var uuidV4 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }
func (h *Handler) RegisterRoutes(api *gin.RouterGroup, auth, admin gin.HandlerFunc) {
	group := api.Group("/admin/palette-assistant", auth, admin)
	group.POST("/validate", h.validate)
	group.POST("/candidates", h.create)
}
func (h *Handler) validate(c *gin.Context) {
	var req pa.ValidateRequest
	if p := decodeStrict(c, &req, []string{"draft", "confirmed_revision"}); p != nil {
		writeProblem(c, p)
		return
	}
	if h.service == nil {
		writeProblem(c, &pa.Problem{Code: pa.ErrInternal, Message: "Palette Assistant submission is unavailable.", Retryable: true})
		return
	}
	r := h.service.Validate(c.Request.Context(), authctx.GetUserID(c), req)
	writeResult(c, r)
}
func (h *Handler) create(c *gin.Context) {
	key := c.GetHeader("Idempotency-Key")
	if key == "" {
		writeProblem(c, &pa.Problem{Code: pa.ErrIdempotencyKeyMissing, Message: "Idempotency-Key is required."})
		return
	}
	if !uuidV4.MatchString(key) {
		writeProblem(c, &pa.Problem{Code: pa.ErrIdempotencyKeyInvalid, Message: "Idempotency-Key must be a canonical UUIDv4."})
		return
	}
	var req pa.CreateCandidateRequest
	if p := decodeStrict(c, &req, []string{"draft", "confirmed_revision", "validation_receipt", "warning_acknowledgments"}); p != nil {
		writeProblem(c, p)
		return
	}
	if h.service == nil {
		writeProblem(c, &pa.Problem{Code: pa.ErrInternal, Message: "Palette Assistant submission is unavailable.", Retryable: true})
		return
	}
	r := h.service.Create(c.Request.Context(), authctx.GetUserID(c), key, req)
	writeResult(c, r)
}
func decodeStrict(c *gin.Context, target any, required []string) *pa.Problem {
	if c.ContentType() != "application/json" {
		return &pa.Problem{Code: pa.ErrUnsupportedMediaType, Message: "Content-Type must be application/json."}
	}
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, jsonBodyLimit+1))
	if err != nil || len(raw) > jsonBodyLimit {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "The JSON request body is invalid or too large."}
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "The JSON request body is required."}
	}
	if err := rejectDuplicateKeys(raw); err != nil {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "The JSON request body contains duplicate object members."}
	}
	var envelope map[string]json.RawMessage
	if json.Unmarshal(raw, &envelope) != nil || envelope == nil {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "The JSON request body is malformed."}
	}
	issues := []pa.FieldIssue{}
	for _, name := range required {
		v, ok := envelope[name]
		if !ok || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			issues = append(issues, pa.FieldIssue{Path: "/" + name, Code: "REQUIRED_FIELD", Message: "This field is required and cannot be null."})
		}
	}
	if d, ok := envelope["draft"]; ok {
		var dm map[string]json.RawMessage
		if json.Unmarshal(d, &dm) == nil {
			for _, name := range []string{"contract_version", "revision", "name", "type", "colors", "chart_applicability", "disciplines", "use_cases", "avoid_cases", "tags", "accessibility", "source_type", "source_note", "preview_cases", "provenance"} {
				if value, found := dm[name]; !found || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
					issues = append(issues, pa.FieldIssue{Path: "/draft/" + name, Code: "REQUIRED_FIELD", Message: "This field is required and cannot be null."})
				}
			}
		}
	}
	if len(issues) > 0 {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "Required request fields are missing.", Issues: issues}
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "The JSON request body does not match the contract."}
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return &pa.Problem{Code: pa.ErrMalformedRequest, Message: "Only one JSON value is allowed."}
	}
	return nil
}
func rejectDuplicateKeys(raw []byte) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	var value func() error
	value = func() error {
		tok, e := d.Token()
		if e != nil {
			return e
		}
		delim, ok := tok.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				k, e := d.Token()
				if e != nil {
					return e
				}
				key, ok := k.(string)
				if !ok || seen[key] {
					return errors.New("duplicate")
				}
				seen[key] = true
				if e = value(); e != nil {
					return e
				}
			}
			_, e = d.Token()
			return e
		case '[':
			for d.More() {
				if e := value(); e != nil {
					return e
				}
			}
			_, e = d.Token()
			return e
		default:
			return errors.New("unexpected delimiter")
		}
	}
	if e := value(); e != nil {
		return e
	}
	if _, e := d.Token(); e != io.EOF {
		return errors.New("trailing")
	}
	return nil
}
func writeResult(c *gin.Context, r Result) {
	if r.Problem != nil {
		c.JSON(r.Status, r.Problem)
		return
	}
	if r.Response != nil {
		c.JSON(r.Status, r.Response)
		return
	}
	c.JSON(r.Status, r.Receipt)
}
func writeProblem(c *gin.Context, p *pa.Problem) {
	status := statusFor(p.Code)
	if p.Code == pa.ErrInternal && strings.Contains(p.Message, "unavailable") {
		status = http.StatusServiceUnavailable
	}
	c.JSON(status, p)
}
