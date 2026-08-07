package palette

import (
	"database/sql/driver"
	"errors"
	"os"
	"strings"
	"testing"
)

func TestListPublicFiltersRepositoryQueryToPublicPublished(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("SELECT COUNT(*) FROM palettes", "owner_user_id IS NULL", countRows(1)),
		queryOp("FROM palettes", "owner_user_id IS NULL", paletteRow(t)),
		queryOp("FROM palette_preview_cases", "status = 'published'", emptyPreviewCaseRows()),
	})
	defer restore()

	palettes, total, err := NewService(NewRepository()).ListPublic(ListParams{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("ListPublic returned error: %v", err)
	}
	if total != 1 || len(palettes) != 1 {
		t.Fatalf("result total=%d len=%d, want one public palette", total, len(palettes))
	}
	if palettes[0].Visibility != "public" || palettes[0].Status != "published" {
		t.Fatalf("palette visibility/status = %q/%q, want public/published", palettes[0].Visibility, palettes[0].Status)
	}

	assertScriptedEvents(t,
		"query SELECT COUNT(*) FROM palettes",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query SELECT id, palette_id, chart_type",
	)
}

func TestAdminListFiltersRepositoryQueryToPublicCatalogOwnership(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("SELECT COUNT(*) FROM palettes", "owner_user_id IS NULL", countRows(1)),
		queryOp("FROM palettes", "owner_user_id IS NULL", paletteRow(t)),
	})
	defer restore()

	palettes, total, err := NewService(NewRepository()).List(ListParams{Status: "published", Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if total != 1 || len(palettes) != 1 {
		t.Fatalf("result total=%d len=%d, want one admin-manageable palette", total, len(palettes))
	}
	if palettes[0].Visibility != "public" || palettes[0].OwnerUserID != nil {
		t.Fatalf("palette visibility/owner = %q/%#v, want public/nil", palettes[0].Visibility, palettes[0].OwnerUserID)
	}

	events := scriptedState.snapshotEvents()
	for _, event := range events {
		if strings.Contains(event, "query SELECT") && !strings.Contains(event, "visibility = 'public'") {
			t.Fatalf("admin list query did not enforce public visibility: %q", event)
		}
		if strings.Contains(event, "query SELECT") && !strings.Contains(event, "owner_user_id IS NULL") {
			t.Fatalf("admin list query did not enforce owner boundary: %q", event)
		}
	}
}

func TestAdminGetByIDHidesPrivatePalette(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
	})
	defer restore()

	got, err := NewService(NewRepository()).GetByID("palette-1")
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if got != nil {
		t.Fatalf("private palette was returned from admin ID endpoint: %#v", got)
	}
}

func TestAdminWriteOperationsRejectPrivatePalette(t *testing.T) {
	for _, tc := range []struct {
		name string
		act  func(*Service) error
	}{
		{
			name: "update",
			act: func(service *Service) error {
				name := "Changed"
				_, err := service.Update("palette-1", &UpdatePaletteRequest{Name: &name})
				return err
			},
		},
		{
			name: "publish",
			act: func(service *Service) error {
				_, err := service.Publish("palette-1")
				return err
			},
		},
		{
			name: "unpublish",
			act: func(service *Service) error {
				_, err := service.Unpublish("palette-1")
				return err
			},
		},
		{
			name: "archive",
			act: func(service *Service) error {
				_, err := service.Archive("palette-1")
				return err
			},
		},
		{
			name: "delete",
			act: func(service *Service) error {
				return service.Delete("palette-1")
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			restore := installScriptedDB(t, []scriptedDBOp{
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			})
			defer restore()

			err := tc.act(NewService(NewRepository()))
			if !errors.Is(err, ErrPaletteNotAdminManageable) {
				t.Fatalf("%s error = %v, want ErrPaletteNotAdminManageable", tc.name, err)
			}
		})
	}
}

func TestAdminPreviewCasePaletteRoutesRejectPrivatePalette(t *testing.T) {
	for _, tc := range []struct {
		name string
		act  func(*Service) error
	}{
		{
			name: "list",
			act: func(service *Service) error {
				_, err := service.ListPreviewCasesByPalette("palette-1", false)
				return err
			},
		},
		{
			name: "create",
			act: func(service *Service) error {
				_, err := service.CreatePreviewCase("palette-1", nil)
				return err
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			restore := installScriptedDB(t, []scriptedDBOp{
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			})
			defer restore()

			err := tc.act(NewService(NewRepository()))
			if !errors.Is(err, ErrPaletteNotAdminManageable) {
				t.Fatalf("%s error = %v, want ErrPaletteNotAdminManageable", tc.name, err)
			}
		})
	}
}

func TestAdminPreviewCaseIDRoutesRejectPrivatePalette(t *testing.T) {
	for _, tc := range []struct {
		name string
		ops  []scriptedDBOp
		act  func(*Service) error
	}{
		{
			name: "get",
			ops: []scriptedDBOp{
				queryOp("FROM palette_preview_cases", "", previewCaseRow(PreviewCaseStatusDraft, false)),
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			},
			act: func(service *Service) error {
				_, err := service.GetPreviewCaseByID("preview-1")
				return err
			},
		},
		{
			name: "update",
			ops: []scriptedDBOp{
				queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			},
			act: func(service *Service) error {
				_, err := service.UpdatePreviewCase("preview-1", &UpdatePreviewCaseRequest{})
				return err
			},
		},
		{
			name: "delete",
			ops: []scriptedDBOp{
				queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			},
			act: func(service *Service) error {
				return service.DeleteDraftPreviewCase("preview-1")
			},
		},
		{
			name: "publish",
			ops: []scriptedDBOp{
				queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			},
			act: func(service *Service) error {
				_, err := service.PublishPreviewCase("preview-1")
				return err
			},
		},
		{
			name: "archive",
			ops: []scriptedDBOp{
				queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusPublished, false)),
				queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			},
			act: func(service *Service) error {
				_, err := service.ArchivePreviewCase("preview-1")
				return err
			},
		},
		{
			name: "set primary",
			ops: []scriptedDBOp{
				queryOp("FROM palette_preview_cases", "", previewCaseRow(PreviewCaseStatusPublished, false)),
				queryOp("FROM palettes", "FOR UPDATE", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
			},
			act: func(service *Service) error {
				_, err := service.SetPrimaryPreviewCase("preview-1")
				return err
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			restore := installScriptedDB(t, tc.ops)
			defer restore()

			err := tc.act(NewService(NewRepository()))
			if !errors.Is(err, ErrPaletteNotAdminManageable) {
				t.Fatalf("%s error = %v, want ErrPaletteNotAdminManageable", tc.name, err)
			}
		})
	}
}

func TestPrivatePublishedPaletteIsNotPublicByID(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palettes", "WHERE id = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
	})
	defer restore()

	got, err := NewService(NewRepository()).GetPublicByID("palette-1")
	if err == nil || !strings.Contains(err.Error(), "palette not found") {
		t.Fatalf("GetPublicByID error = %v, want not found", err)
	}
	if got != nil {
		t.Fatalf("private palette was returned from public ID endpoint: %#v", got)
	}
}

func TestPrivatePublishedPaletteIsNotPublicBySlug(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palettes", "WHERE slug = $1", paletteRowWithVisibility(t, "private", "custom", driver.Value("user-1"))),
	})
	defer restore()

	got, err := NewService(NewRepository()).GetPublicBySlug("palette-one")
	if err == nil || !strings.Contains(err.Error(), "palette not found") {
		t.Fatalf("GetPublicBySlug error = %v, want not found", err)
	}
	if got != nil {
		t.Fatalf("private palette was returned from public slug endpoint: %#v", got)
	}
}

func TestUserOwnedPublicPaletteIsNotPublicBySlug(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palettes", "WHERE slug = $1", paletteRowWithVisibility(t, "public", "custom", driver.Value("user-1"))),
	})
	defer restore()

	got, err := NewService(NewRepository()).GetPublicBySlug("palette-one")
	if err == nil || !strings.Contains(err.Error(), "palette not found") {
		t.Fatalf("GetPublicBySlug error = %v, want not found", err)
	}
	if got != nil {
		t.Fatalf("user-owned palette was returned from public slug endpoint: %#v", got)
	}
}

func TestAdminCreateForcesOfficialCatalogOwnershipFields(t *testing.T) {
	req := &CreatePaletteRequest{
		Name:       "Admin Palette",
		Slug:       "admin-palette",
		Colors:     []byte(`[{"hex":"#112233"}]`),
		ColorCount: 1,
		Type:       "categorical",
		Visibility: "private",
		Origin:     "custom",
	}
	applyOfficialCatalogOwnership(req)

	if req.OwnerUserID != nil {
		t.Fatalf("admin create owner_user_id = %#v, want nil", req.OwnerUserID)
	}
	if req.Visibility != "public" || req.Origin != "curated" || req.SourcePaletteID != nil {
		t.Fatalf("admin create ownership fields = visibility %q origin %q source %#v, want public/curated/nil", req.Visibility, req.Origin, req.SourcePaletteID)
	}
}

func TestOwnershipVisibilityMigrationUsesSafeDefaultsAndGuards(t *testing.T) {
	migration, err := os.ReadFile("../../migrations/017_add_palette_ownership_visibility.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := string(migration)
	for _, want := range []string{
		"ALTER COLUMN visibility SET DEFAULT 'private'",
		"ALTER COLUMN origin SET DEFAULT 'custom'",
		"palettes_private_owner_check",
		"palettes_fork_source_check",
		"palettes_source_not_self_check",
		"COUNT(DISTINCT pr.user_id) > 1",
		"RAISE EXCEPTION 'Migration 017 produced % private palettes without owner_user_id'",
		"visibility = 'private'",
		"origin = 'custom'",
		"status = 'draft'",
		"published_at = NULL",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("migration missing %q", want)
		}
	}
	if strings.Contains(sql, "visibility VARCHAR(20) NOT NULL DEFAULT 'public'") {
		t.Fatal("migration must not make public the database default visibility")
	}
}

func countRows(count int64) *scriptedRows {
	return &scriptedRows{
		columns: []string{"count"},
		values:  [][]driver.Value{{count}},
	}
}
