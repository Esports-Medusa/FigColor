package palette

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestCandidateAggregateServiceCreatesCanonicalAggregateInOrder(t *testing.T) {
	input := candidateAggregateTestInput(t, true)
	writer := &candidateAggregateWriterFake{}
	result, err := NewCandidateAggregateService().Create(writer, input)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(writer.events, []string{"candidate", "preview"}) {
		t.Fatalf("events=%v", writer.events)
	}
	if result.PaletteID != "palette-1" || result.Slug != input.Palette.Slug || !reflect.DeepEqual(result.PreviewCaseIDs, []string{"preview-1"}) {
		t.Fatalf("result=%+v", result)
	}
	if writer.actor != input.ActorUserID || writer.palette.Status != "candidate" || writer.palette.SourceType != "curated" || writer.palette.OwnerUserID != nil || writer.palette.Visibility != "" || writer.palette.Origin != "" {
		t.Fatalf("writer actor=%q palette=%+v", writer.actor, writer.palette)
	}
	input.Palette.Colors[0] = 'x'
	input.PreviewCases[0].ColorRoles[0] = 'x'
	if writer.palette.Colors[0] == 'x' || writer.previews[0].ColorRoles[0] == 'x' {
		t.Fatal("shared service retained caller-owned mutable JSON")
	}
}

func TestCandidateAggregateServicePropagatesWriteFailuresWithoutContinuing(t *testing.T) {
	sentinel := errors.New("write failed")
	for _, tc := range []struct {
		name       string
		writer     *candidateAggregateWriterFake
		wantEvents []string
	}{
		{name: "candidate", writer: &candidateAggregateWriterFake{candidateErr: sentinel}, wantEvents: []string{"candidate"}},
		{name: "preview", writer: &candidateAggregateWriterFake{previewErr: sentinel}, wantEvents: []string{"candidate", "preview"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewCandidateAggregateService().Create(tc.writer, candidateAggregateTestInput(t, true))
			if !errors.Is(err, sentinel) || !reflect.DeepEqual(tc.writer.events, tc.wantEvents) {
				t.Fatalf("err=%v events=%v", err, tc.writer.events)
			}
		})
	}
}

func TestCandidateAggregateServiceRejectsUnresolvedPreviewColorBeforeWriting(t *testing.T) {
	input := candidateAggregateTestInput(t, true)
	input.PreviewCases[0].ColorRoles = json.RawMessage(strings.Replace(string(input.PreviewCases[0].ColorRoles), `"color-1"`, `"missing"`, 1))
	writer := &candidateAggregateWriterFake{}
	_, err := NewCandidateAggregateService().Create(writer, input)
	if err == nil || len(writer.events) != 0 {
		t.Fatalf("err=%v events=%v", err, writer.events)
	}
	validation, ok := IsValidationError(err)
	if !ok || !hasValidationIssueCode(validation.Issues, "COLOR_NOT_FOUND") {
		t.Fatalf("issues=%+v ok=%v", validation.Issues, ok)
	}
}

func hasValidationIssueCode(issues []ValidationIssue, code string) bool {
	for _, issue := range issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}

func TestCandidateAggregateInputHasNoEntrySpecificFields(t *testing.T) {
	typeOf := reflect.TypeOf(CandidateAggregateInput{})
	got := make([]string, 0, typeOf.NumField())
	for i := 0; i < typeOf.NumField(); i++ {
		got = append(got, typeOf.Field(i).Name)
	}
	if !reflect.DeepEqual(got, []string{"Palette", "PreviewCases", "ActorUserID"}) {
		t.Fatalf("shared input fields=%v", got)
	}
	paletteType := reflect.TypeOf(CandidatePaletteInput{})
	forbidden := map[string]bool{"OwnerUserID": true, "Visibility": true, "Origin": true, "Status": true, "CreatedBy": true, "ProposalID": true, "NormalizedContentHash": true, "ValidationReceipt": true}
	for i := 0; i < paletteType.NumField(); i++ {
		if forbidden[paletteType.Field(i).Name] {
			t.Fatalf("CandidatePaletteInput exposes server/entry field %s", paletteType.Field(i).Name)
		}
	}
}

func TestCandidateAggregateServiceDependencyBoundary(t *testing.T) {
	source, err := os.ReadFile("candidate_aggregate.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	for _, prohibited := range []string{"paletteassistant", "ingestionRequest", "IngestionRecord", "gin.", "image.Decode", "net/http", "database.DB", "Commit()", "Rollback()"} {
		if strings.Contains(text, prohibited) {
			t.Fatalf("shared Candidate service contains prohibited dependency %q", prohibited)
		}
	}
}

func candidateAggregateTestInput(t *testing.T, preview bool) CandidateAggregateInput {
	t.Helper()
	prepared, err := prepareIngestion(validServiceSubmission(t, preview))
	if err != nil {
		t.Fatal(err)
	}
	return CandidateAggregateInput{Palette: candidatePaletteInputFromOffline(prepared.palette), PreviewCases: prepared.previews, ActorUserID: prepared.claim.ActorUserID}
}

type candidateAggregateWriterFake struct {
	candidateErr error
	previewErr   error
	events       []string
	palette      CreatePaletteRequest
	actor        string
	previews     []CreatePreviewCaseRequest
}

func (w *candidateAggregateWriterFake) CreateCandidate(input *CreatePaletteRequest, actor string) (*Palette, error) {
	w.events = append(w.events, "candidate")
	w.palette, w.actor = *input, actor
	w.palette.Colors = append(json.RawMessage(nil), input.Colors...)
	if w.candidateErr != nil {
		return nil, w.candidateErr
	}
	return &Palette{ID: "palette-1", Slug: input.Slug, Status: "candidate"}, nil
}

func (w *candidateAggregateWriterFake) CreatePreview(paletteID string, input *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	w.events = append(w.events, "preview")
	w.previews = append(w.previews, clonePreviewRequest(*input))
	if w.previewErr != nil {
		return nil, w.previewErr
	}
	return &PalettePreviewCase{ID: "preview-1", PaletteID: paletteID, Status: PreviewCaseStatusDraft}, nil
}
