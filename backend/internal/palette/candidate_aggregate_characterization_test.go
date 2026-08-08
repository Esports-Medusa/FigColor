package palette

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// This test freezes the offline adapter behavior before Candidate aggregate
// extraction. PostgreSQL-backed atomicity remains covered by
// TestIngestionServicePostgresAggregate when FIGCOLOR_INGESTION_TEST_DSN is set.
func TestOfflineCandidateAggregateCharacterization(t *testing.T) {
	input := validServiceSubmission(t, true)
	prepared, err := prepareIngestion(input)
	if err != nil {
		t.Fatal(err)
	}
	record := serviceRecord(input, IngestionStateProcessing)
	tx := &characterizationAggregateTx{}
	claims := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "secret-lease"}}
	result := newIngestionService(claims, &characterizationAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
	if result.Outcome != IngestionServiceCreated || result.Replay {
		t.Fatalf("result=%+v", result)
	}
	if tx.commits != 1 || tx.rollbacks != 0 || tx.binds != 1 {
		t.Fatalf("transaction commits=%d rollbacks=%d binds=%d", tx.commits, tx.rollbacks, tx.binds)
	}
	if tx.actor != input.ActorUserID || tx.palette == nil {
		t.Fatalf("actor=%q palette=%+v", tx.actor, tx.palette)
	}
	if tx.palette.Status != "candidate" || tx.palette.SourceType != "curated" || tx.palette.Visibility != "" || tx.palette.OwnerUserID != nil || tx.palette.Origin != "" {
		t.Fatalf("prepared lifecycle fields changed: %+v", tx.palette)
	}
	if tx.palette.Slug != prepared.palette.Slug || !reflect.DeepEqual(tx.palette.ChartTypes, []string{ChartTypeBarError}) || tx.palette.ChartApplicability.Value[0].Source != ChartApplicabilitySourceCurated {
		t.Fatalf("prepared Palette mismatch: %+v", tx.palette)
	}
	var colors []PaletteColor
	if err := json.Unmarshal(tx.palette.Colors, &colors); err != nil {
		t.Fatal(err)
	}
	if len(colors) != 3 || colors[0].ID != "color-1" || colors[1].ID != "color-2" || colors[2].ID != "color-3" || colors[0].Order != 0 || colors[2].Order != 2 {
		t.Fatalf("offline color identity/order changed: %+v", colors)
	}
	if len(tx.previews) != 1 || tx.previews[0].SeedStrategy != PreviewCaseSeedStrategyStableID || !json.Valid(tx.previews[0].ColorRoles) || !containsJSONText(tx.previews[0].ColorRoles, `"color_id":"color-1"`) {
		t.Fatalf("offline Preview changed: %+v", tx.previews)
	}
	var receipt ingestionReceipt
	if err := json.Unmarshal(tx.receipt, &receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.ProposalID != prepared.claim.ProposalID || receipt.NormalizedContentHash != prepared.claim.NormalizedContentHash || receipt.RequestFingerprint != prepared.claim.RequestFingerprint || receipt.PaletteID != tx.paletteID || receipt.Status != "candidate" || !reflect.DeepEqual(receipt.PreviewCaseIDs, []string{"preview-characterized"}) {
		t.Fatalf("receipt changed: %+v", receipt)
	}
}

func containsJSONText(raw json.RawMessage, fragment string) bool {
	var compact any
	if json.Unmarshal(raw, &compact) != nil {
		return false
	}
	b, _ := json.Marshal(compact)
	return strings.Contains(string(b), fragment)
}

type characterizationAggregateFactory struct{ tx *characterizationAggregateTx }

func (f *characterizationAggregateFactory) BeginAggregate(context.Context) (ingestionAggregateTx, error) {
	return f.tx, nil
}

type characterizationAggregateTx struct {
	palette                   *CreatePaletteRequest
	actor, paletteID          string
	previews                  []CreatePreviewCaseRequest
	receipt                   json.RawMessage
	binds, commits, rollbacks int
}

func (t *characterizationAggregateTx) CreateCandidate(req *CreatePaletteRequest, actor string) (*Palette, error) {
	copy := *req
	copy.Colors = append(json.RawMessage(nil), req.Colors...)
	t.palette, t.actor, t.paletteID = &copy, actor, "palette-characterized"
	return &Palette{ID: t.paletteID, Slug: req.Slug, Status: "candidate"}, nil
}

func (t *characterizationAggregateTx) CreatePreview(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	t.previews = append(t.previews, clonePreviewRequest(*req))
	return &PalettePreviewCase{ID: "preview-characterized", PaletteID: paletteID, Status: PreviewCaseStatusDraft}, nil
}

func (t *characterizationAggregateTx) BindSuccess(_ context.Context, _ string, _ int, _ string, _ string, receipt json.RawMessage) (*IngestionRecord, error) {
	t.binds++
	t.receipt = append(json.RawMessage(nil), receipt...)
	return &IngestionRecord{Receipt: t.receipt}, nil
}

func (t *characterizationAggregateTx) Commit() error   { t.commits++; return nil }
func (t *characterizationAggregateTx) Rollback() error { t.rollbacks++; return nil }
