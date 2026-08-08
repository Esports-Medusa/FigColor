package palette

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestPreviewCaseCreateSuccess(t *testing.T) {
	fake := &fakePaletteHandlerService{
		createPreviewCase: func(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
			if paletteID != "palette-1" {
				t.Fatalf("paletteID = %q, want palette-1", paletteID)
			}
			if req.ChartType != ChartTypeBarError {
				t.Fatalf("chart type = %q, want %q", req.ChartType, ChartTypeBarError)
			}
			return handlerPreviewCase("preview-1", PreviewCaseStatusDraft, false), nil
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodPost, "/api/admin/palettes/palette-1/preview-cases", validPreviewCaseCreateBody())
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestPreviewCaseMalformedCreateBody(t *testing.T) {
	rec := performPreviewCaseRequest(&fakePaletteHandlerService{}, http.MethodPost, "/api/admin/palettes/palette-1/preview-cases", []byte(`{"chart_type":`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCandidatePublicationHTTPFailures(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{name: "validation", err: NewValidationError([]ValidationIssue{validationIssue("colors", "COLORS_INVALID", "Colors invalid.")}), status: http.StatusUnprocessableEntity},
		{name: "conflict", err: ErrPalettePublicationConflict, status: http.StatusConflict, code: "PUBLICATION_CONFLICT"},
		{name: "private", err: ErrPaletteNotAdminManageable, status: http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakePaletteHandlerService{publish: func(string) (*Palette, error) { return nil, tt.err }}
			rec := performPreviewCaseRequest(fake, http.MethodPost, "/api/admin/palettes/palette-1/publish", nil)
			if rec.Code != tt.status {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			if tt.code != "" {
				var body struct {
					Code string `json:"code"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Code != tt.code {
					t.Fatalf("body=%s", rec.Body.String())
				}
			}
		})
	}
}

func TestImportedCandidateRejectionHTTP(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		fake := &fakePaletteHandlerService{reject: func(id string) (*Palette, error) {
			return &Palette{ID: id, Status: "archived", Visibility: "public"}, nil
		}}
		rec := performPreviewCaseRequest(fake, http.MethodPost, "/api/admin/palettes/palette-1/reject", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	})
	t.Run("conflict", func(t *testing.T) {
		fake := &fakePaletteHandlerService{reject: func(string) (*Palette, error) { return nil, ErrPaletteRejectionConflict }}
		rec := performPreviewCaseRequest(fake, http.MethodPost, "/api/admin/palettes/palette-1/reject", nil)
		if rec.Code != http.StatusConflict || !bytes.Contains(rec.Body.Bytes(), []byte("REJECTION_CONFLICT")) {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	})
}

func TestPreviewCaseCreateValidationFailure(t *testing.T) {
	fake := &fakePaletteHandlerService{
		createPreviewCase: func(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
			return nil, NewValidationError([]ValidationIssue{
				validationIssue("preview_case.color_roles.groups[0].fill.color_id", "COLOR_NOT_FOUND", "Missing color."),
			})
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodPost, "/api/admin/palettes/palette-1/preview-cases", validPreviewCaseCreateBody())
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Error  string            `json:"error"`
		Issues []ValidationIssue `json:"issues"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != "validation failed" || len(body.Issues) != 1 || body.Issues[0].Code != "COLOR_NOT_FOUND" {
		t.Fatalf("body = %#v, want validation issue preserved", body)
	}
}

func TestPreviewCaseGetNotFound(t *testing.T) {
	fake := &fakePaletteHandlerService{
		getPreviewCaseByID: func(id string) (*PalettePreviewCase, error) {
			return nil, ErrPreviewCaseNotFound
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodGet, "/api/admin/preview-cases/missing", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestPreviewCaseUpdateSuccess(t *testing.T) {
	fake := &fakePaletteHandlerService{
		updatePreviewCase: func(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
			if id != "preview-1" {
				t.Fatalf("id = %q, want preview-1", id)
			}
			if req.TemplateID == nil || *req.TemplateID != "bar_error_v2" {
				t.Fatalf("template patch = %#v, want bar_error_v2", req.TemplateID)
			}
			return handlerPreviewCase("preview-1", PreviewCaseStatusDraft, false), nil
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodPatch, "/api/admin/preview-cases/preview-1", []byte(`{"template_id":"bar_error_v2"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestPreviewCaseUpdateValidationFailure(t *testing.T) {
	fake := &fakePaletteHandlerService{
		updatePreviewCase: func(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
			return nil, previewCaseValidationError(NewValidationError([]ValidationIssue{
				validationIssue("preview_case.seed_value", "FIXED_SEED_VALUE_REQUIRED", "Fixed seed required."),
			}))
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodPatch, "/api/admin/preview-cases/preview-1", []byte(`{"seed_value":null}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestPreviewCaseDeleteDraftSuccess(t *testing.T) {
	fake := &fakePaletteHandlerService{
		deleteDraftPreviewCase: func(id string) error {
			if id != "preview-1" {
				t.Fatalf("id = %q, want preview-1", id)
			}
			return nil
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodDelete, "/api/admin/preview-cases/preview-1", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
}

func TestPreviewCaseDeletePublishedArchivedConflict(t *testing.T) {
	for _, name := range []string{"published", "archived"} {
		t.Run(name, func(t *testing.T) {
			fake := &fakePaletteHandlerService{
				deleteDraftPreviewCase: func(id string) error {
					return ErrInvalidPreviewCaseLifecycleTransition
				},
			}
			rec := performPreviewCaseRequest(fake, http.MethodDelete, "/api/admin/preview-cases/preview-1", nil)
			if rec.Code != http.StatusConflict {
				t.Fatalf("status = %d, want 409", rec.Code)
			}
		})
	}
}

func TestPreviewCaseLifecycleRoutes(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		setup  func(*fakePaletteHandlerService)
		status int
	}{
		{
			name:   "publish success",
			method: http.MethodPost,
			path:   "/api/admin/preview-cases/preview-1/publish",
			setup: func(fake *fakePaletteHandlerService) {
				fake.publishPreviewCase = func(id string) (*PalettePreviewCase, error) {
					return handlerPreviewCase(id, PreviewCaseStatusPublished, false), nil
				}
			},
			status: http.StatusOK,
		},
		{
			name:   "archived publish conflict",
			method: http.MethodPost,
			path:   "/api/admin/preview-cases/preview-1/publish",
			setup: func(fake *fakePaletteHandlerService) {
				fake.publishPreviewCase = func(id string) (*PalettePreviewCase, error) {
					return nil, ErrInvalidPreviewCaseLifecycleTransition
				}
			},
			status: http.StatusConflict,
		},
		{
			name:   "archive success",
			method: http.MethodPost,
			path:   "/api/admin/preview-cases/preview-1/archive",
			setup: func(fake *fakePaletteHandlerService) {
				fake.archivePreviewCase = func(id string) (*PalettePreviewCase, error) {
					return handlerPreviewCase(id, PreviewCaseStatusArchived, false), nil
				}
			},
			status: http.StatusOK,
		},
		{
			name:   "set primary success",
			method: http.MethodPost,
			path:   "/api/admin/preview-cases/preview-1/set-primary",
			setup: func(fake *fakePaletteHandlerService) {
				fake.setPrimaryPreviewCase = func(id string) (*PalettePreviewCase, error) {
					return handlerPreviewCase(id, PreviewCaseStatusPublished, true), nil
				}
			},
			status: http.StatusOK,
		},
		{
			name:   "set primary draft conflict",
			method: http.MethodPost,
			path:   "/api/admin/preview-cases/preview-1/set-primary",
			setup: func(fake *fakePaletteHandlerService) {
				fake.setPrimaryPreviewCase = func(id string) (*PalettePreviewCase, error) {
					return nil, ErrInvalidPreviewCaseLifecycleTransition
				}
			},
			status: http.StatusConflict,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakePaletteHandlerService{}
			tt.setup(fake)
			rec := performPreviewCaseRequest(fake, tt.method, tt.path, nil)
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d body=%s", rec.Code, tt.status, rec.Body.String())
			}
		})
	}
}

func TestPreviewCaseActiveConflictMapsTo409(t *testing.T) {
	fake := &fakePaletteHandlerService{
		createPreviewCase: func(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
			return nil, ErrPreviewCaseConflict
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodPost, "/api/admin/palettes/palette-1/preview-cases", validPreviewCaseCreateBody())
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestPreviewCaseListIncludeArchivedParsing(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		wantInclude bool
		wantStatus  int
		wantTotal   float64
	}{
		{name: "default excludes archived", path: "/api/admin/palettes/palette-1/preview-cases", wantInclude: false, wantStatus: http.StatusOK, wantTotal: 1},
		{name: "include archived true", path: "/api/admin/palettes/palette-1/preview-cases?include_archived=true", wantInclude: true, wantStatus: http.StatusOK, wantTotal: 2},
		{name: "invalid include archived", path: "/api/admin/palettes/palette-1/preview-cases?include_archived=1", wantStatus: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakePaletteHandlerService{
				listPreviewCasesByPalette: func(paletteID string, includeArchived bool) ([]*PalettePreviewCase, error) {
					if includeArchived != tt.wantInclude {
						t.Fatalf("includeArchived = %v, want %v", includeArchived, tt.wantInclude)
					}
					items := []*PalettePreviewCase{handlerPreviewCase("preview-1", PreviewCaseStatusDraft, false)}
					if includeArchived {
						items = append(items, handlerPreviewCase("preview-2", PreviewCaseStatusArchived, false))
					}
					return items, nil
				},
			}
			rec := performPreviewCaseRequest(fake, http.MethodGet, tt.path, nil)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d body=%s", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if tt.wantStatus == http.StatusOK {
				var body map[string]interface{}
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
					t.Fatalf("decode body: %v", err)
				}
				if body["total"] != tt.wantTotal {
					t.Fatalf("total = %#v, want %v", body["total"], tt.wantTotal)
				}
			}
		})
	}
}

func TestPublicPaletteListReturnsPublicPreviewDTO(t *testing.T) {
	publicDTO := buildPublicPaletteDTO(testPublicPalette("palette-1"), []*PalettePreviewCase{
		testPublicPreviewCase("preview-primary", PreviewCaseStatusPublished, true),
	})
	fake := &fakePaletteHandlerService{
		listPublic: func(params ListParams) ([]*PublicPaletteDTO, int, error) {
			if !params.PublishedOnly {
				t.Fatal("public list did not request published-only palettes")
			}
			if params.Visibility != "public" {
				t.Fatalf("visibility = %q, want public", params.Visibility)
			}
			return []*PublicPaletteDTO{publicDTO}, 1, nil
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodGet, "/api/palettes", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Palettes []PublicPaletteDTO `json:"palettes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if len(body.Palettes) != 1 || body.Palettes[0].PrimaryPreviewCase == nil {
		t.Fatalf("body = %#v, want public preview DTO", body)
	}
	if body.Palettes[0].PrimaryPreviewCase.Status != PreviewCaseStatusPublished {
		t.Fatalf("primary status = %q, want published", body.Palettes[0].PrimaryPreviewCase.Status)
	}
}

func TestPublicPaletteListParsesPagingAndFilters(t *testing.T) {
	fake := &fakePaletteHandlerService{
		listPublic: func(params ListParams) ([]*PublicPaletteDTO, int, error) {
			if !params.PublishedOnly {
				t.Fatal("public list did not request published-only palettes")
			}
			if params.Visibility != "public" {
				t.Fatalf("visibility = %q, want public", params.Visibility)
			}
			if params.Page != 3 || params.PageSize != 12 {
				t.Fatalf("paging = page %d page_size %d, want 3/12", params.Page, params.PageSize)
			}
			if params.Search != "mock" ||
				params.ChartType != "line" ||
				params.JournalStyle != "nature" ||
				params.Discipline != "genomics" ||
				params.UseCase != "omics" ||
				params.Tag != "publication_ready" ||
				params.ColorCount != 5 {
				t.Fatalf("params = %#v, want parsed public filters", params)
			}
			return []*PublicPaletteDTO{}, 41, nil
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodGet, "/api/palettes?page=3&page_size=12&search=mock&chart_type=line&journal_style=nature&discipline=genomics&use_case=omics&tag=publication_ready&color_count=5", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["total"] != float64(41) || body["page"] != float64(3) || body["page_size"] != float64(12) || body["total_pages"] != float64(4) {
		t.Fatalf("response metadata = %#v", body)
	}
}

func TestPublicPaletteDetailReturnsPublicPreviewDTO(t *testing.T) {
	publicDTO := buildPublicPaletteDTO(testPublicPalette("palette-1"), []*PalettePreviewCase{
		testPublicPreviewCase("preview-primary", PreviewCaseStatusPublished, true),
		testPublicPreviewCase("preview-draft", PreviewCaseStatusDraft, false),
	})
	fake := &fakePaletteHandlerService{
		getPublicBySlug: func(slug string) (*PublicPaletteDTO, error) {
			if slug != "test-palette" {
				t.Fatalf("slug = %q, want test-palette", slug)
			}
			return publicDTO, nil
		},
	}

	rec := performPreviewCaseRequest(fake, http.MethodGet, "/api/palettes/test-palette", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body PublicPaletteDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.PrimaryPreviewCase == nil || body.PrimaryPreviewCase.ID != "preview-primary" {
		t.Fatalf("primary = %#v, want preview-primary", body.PrimaryPreviewCase)
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode raw body: %v", err)
	}
	if _, exists := raw["preview_cases"]; exists {
		t.Fatalf("public detail exposed preview_cases collection: %s", rec.Body.String())
	}
}

func TestPreviewCaseRoutesRequireAdminMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("auth middleware blocks route", func(t *testing.T) {
		router := gin.New()
		handler := &Handler{service: &fakePaletteHandlerService{}}
		handler.RegisterRoutes(router.Group("/api"), "", func(c *gin.Context) {
			c.AbortWithStatus(http.StatusUnauthorized)
		}, func(c *gin.Context) {
			t.Fatal("admin middleware should not run after auth abort")
		})

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/admin/preview-cases/preview-1", nil)
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", rec.Code)
		}
	})

	t.Run("admin middleware blocks route", func(t *testing.T) {
		router := gin.New()
		handler := &Handler{service: &fakePaletteHandlerService{}}
		handler.RegisterRoutes(router.Group("/api"), "", func(c *gin.Context) {
			c.Next()
		}, func(c *gin.Context) {
			c.AbortWithStatus(http.StatusForbidden)
		})

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/admin/preview-cases/preview-1", nil)
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", rec.Code)
		}
	})
}

func performPreviewCaseRequest(service handlerService, method string, path string, body []byte) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &Handler{service: service}
	handler.RegisterRoutes(router.Group("/api"), "", func(c *gin.Context) {
		c.Next()
	}, func(c *gin.Context) {
		c.Next()
	})

	rec := httptest.NewRecorder()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		reader = bytes.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	router.ServeHTTP(rec, req)
	return rec
}

func validPreviewCaseCreateBody() []byte {
	return []byte(`{
		"chart_type":"bar_error",
		"template_id":"bar_error_v1",
		"template_version":1,
		"schema_version":1,
		"color_roles":{"series":[{"source":"palette","color_id":"color-1"}]},
		"preview_config":{"show_error_bars":true},
		"seed_strategy":"stable_id"
	}`)
}

func handlerPreviewCase(id string, status string, isPrimary bool) *PalettePreviewCase {
	now := time.Now().UTC()
	return &PalettePreviewCase{
		ID:              id,
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      json.RawMessage(`{"series":[{"source":"palette","color_id":"color-1"}]}`),
		PreviewConfig:   json.RawMessage(`{"show_error_bars":true}`),
		SeedStrategy:    PreviewCaseSeedStrategyStableID,
		IsPrimary:       isPrimary,
		Status:          status,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
}

type fakePaletteHandlerService struct {
	publish                   func(id string) (*Palette, error)
	reject                    func(id string) (*Palette, error)
	listPreviewCasesByPalette func(paletteID string, includeArchived bool) ([]*PalettePreviewCase, error)
	getPreviewCaseByID        func(id string) (*PalettePreviewCase, error)
	createPreviewCase         func(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error)
	updatePreviewCase         func(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error)
	deleteDraftPreviewCase    func(id string) error
	publishPreviewCase        func(id string) (*PalettePreviewCase, error)
	archivePreviewCase        func(id string) (*PalettePreviewCase, error)
	setPrimaryPreviewCase     func(id string) (*PalettePreviewCase, error)
	listPublic                func(params ListParams) ([]*PublicPaletteDTO, int, error)
	getPublicBySlug           func(slug string) (*PublicPaletteDTO, error)
}

func (f *fakePaletteHandlerService) GetByID(id string) (*Palette, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) GetBySlug(slug string) (*Palette, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) List(params ListParams) ([]*Palette, int, error) {
	return nil, 0, errors.New("unused")
}
func (f *fakePaletteHandlerService) GetStats() (*PaletteStats, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) Create(req *CreatePaletteRequest, createdBy string) (*Palette, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) Update(id string, req *UpdatePaletteRequest) (*Palette, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) Publish(id string) (*Palette, error) {
	if f.publish != nil {
		return f.publish(id)
	}
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) Reject(id string) (*Palette, error) {
	if f.reject != nil {
		return f.reject(id)
	}
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) CanReject(id string) (bool, error) {
	return false, errors.New("unused")
}
func (f *fakePaletteHandlerService) Unpublish(id string) (*Palette, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) Archive(id string) (*Palette, error) {
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) Delete(id string) error { return errors.New("unused") }
func (f *fakePaletteHandlerService) ListPublic(params ListParams) ([]*PublicPaletteDTO, int, error) {
	if f.listPublic != nil {
		return f.listPublic(params)
	}
	return nil, 0, errors.New("unused")
}
func (f *fakePaletteHandlerService) GetPublicBySlug(slug string) (*PublicPaletteDTO, error) {
	if f.getPublicBySlug != nil {
		return f.getPublicBySlug(slug)
	}
	return nil, errors.New("unused")
}
func (f *fakePaletteHandlerService) GetPublicByID(id string) (*PublicPaletteDTO, error) {
	return nil, errors.New("unused")
}

func (f *fakePaletteHandlerService) ListPreviewCasesByPalette(paletteID string, includeArchived bool) ([]*PalettePreviewCase, error) {
	if f.listPreviewCasesByPalette != nil {
		return f.listPreviewCasesByPalette(paletteID, includeArchived)
	}
	return nil, errors.New("unexpected ListPreviewCasesByPalette call")
}
func (f *fakePaletteHandlerService) GetPreviewCaseByID(id string) (*PalettePreviewCase, error) {
	if f.getPreviewCaseByID != nil {
		return f.getPreviewCaseByID(id)
	}
	return handlerPreviewCase(id, PreviewCaseStatusDraft, false), nil
}
func (f *fakePaletteHandlerService) CreatePreviewCase(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	if f.createPreviewCase != nil {
		return f.createPreviewCase(paletteID, req)
	}
	return nil, errors.New("unexpected CreatePreviewCase call")
}
func (f *fakePaletteHandlerService) UpdatePreviewCase(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
	if f.updatePreviewCase != nil {
		return f.updatePreviewCase(id, req)
	}
	return nil, errors.New("unexpected UpdatePreviewCase call")
}
func (f *fakePaletteHandlerService) DeleteDraftPreviewCase(id string) error {
	if f.deleteDraftPreviewCase != nil {
		return f.deleteDraftPreviewCase(id)
	}
	return errors.New("unexpected DeleteDraftPreviewCase call")
}
func (f *fakePaletteHandlerService) PublishPreviewCase(id string) (*PalettePreviewCase, error) {
	if f.publishPreviewCase != nil {
		return f.publishPreviewCase(id)
	}
	return nil, errors.New("unexpected PublishPreviewCase call")
}
func (f *fakePaletteHandlerService) ArchivePreviewCase(id string) (*PalettePreviewCase, error) {
	if f.archivePreviewCase != nil {
		return f.archivePreviewCase(id)
	}
	return nil, errors.New("unexpected ArchivePreviewCase call")
}
func (f *fakePaletteHandlerService) SetPrimaryPreviewCase(id string) (*PalettePreviewCase, error) {
	if f.setPrimaryPreviewCase != nil {
		return f.setPrimaryPreviewCase(id)
	}
	return nil, errors.New("unexpected SetPrimaryPreviewCase call")
}
