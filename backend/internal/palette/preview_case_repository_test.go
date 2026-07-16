package palette

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"
)

type fakePreviewCaseScanner struct {
	values []interface{}
}

func (s fakePreviewCaseScanner) Scan(dest ...interface{}) error {
	for index, value := range s.values {
		switch target := dest[index].(type) {
		case *string:
			*target = value.(string)
		case *int:
			*target = value.(int)
		case *json.RawMessage:
			*target = json.RawMessage(value.([]byte))
		case *sql.NullInt64:
			*target = value.(sql.NullInt64)
		case *bool:
			*target = value.(bool)
		case *time.Time:
			*target = value.(time.Time)
		default:
			t := target
			_ = t
		}
	}
	return nil
}

func TestScanPreviewCaseHandlesNullableSeedValue(t *testing.T) {
	now := time.Now().UTC()
	scanner := fakePreviewCaseScanner{values: []interface{}{
		"preview-id",
		"palette-id",
		ChartTypeBarError,
		"bar_error_v1",
		1,
		1,
		[]byte(`{"series":[]}`),
		[]byte(`{"show":true}`),
		PreviewCaseSeedStrategyFixed,
		sql.NullInt64{Int64: 99, Valid: true},
		false,
		PreviewCaseStatusDraft,
		now,
		now,
	}}

	previewCase, err := scanPreviewCase(scanner)
	if err != nil {
		t.Fatalf("scanPreviewCase returned error: %v", err)
	}
	if previewCase.SeedValue == nil || *previewCase.SeedValue != 99 {
		t.Fatalf("seed value = %#v, want 99", previewCase.SeedValue)
	}
	if string(previewCase.ColorRoles) != `{"series":[]}` {
		t.Fatalf("color roles = %s", previewCase.ColorRoles)
	}

	scanner.values[9] = sql.NullInt64{}
	previewCase, err = scanPreviewCase(scanner)
	if err != nil {
		t.Fatalf("scanPreviewCase returned error for null seed: %v", err)
	}
	if previewCase.SeedValue != nil {
		t.Fatalf("seed value = %#v, want nil", previewCase.SeedValue)
	}
}

func TestPreviewCaseOrderClauseIsDeterministic(t *testing.T) {
	order := previewCaseOrderClause()
	for _, expected := range []string{"is_primary DESC", "created_at ASC", "id ASC"} {
		if !strings.Contains(order, expected) {
			t.Fatalf("order clause %q missing %q", order, expected)
		}
	}
}

func TestClassifyPreviewCaseDBError(t *testing.T) {
	tests := []struct {
		name string
		code pq.ErrorCode
		want error
	}{
		{name: "unique conflict", code: "23505", want: ErrPreviewCaseConflict},
		{name: "foreign key", code: "23503", want: ErrPreviewCaseForeignKey},
		{name: "check constraint", code: "23514", want: ErrPreviewCaseConstraint},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := classifyPreviewCaseDBError("test", &pq.Error{Code: tt.code})
			if !errors.Is(err, tt.want) {
				t.Fatalf("classified error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestClassifyPreviewCaseDBErrorPreservesUnknownCause(t *testing.T) {
	root := errors.New("driver exploded")

	err := classifyPreviewCaseDBError("test", root)
	if !errors.Is(err, root) {
		t.Fatalf("classified error = %v, want wrapped root cause", err)
	}
}
