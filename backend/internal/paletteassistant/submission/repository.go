package submission

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/database"
	"github.com/qiqi/figcolor/backend/internal/palette"
	pa "github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

const operation = "palette_assistant_candidate_create_v1"

type SQLRepository struct {
	db        *sql.DB
	palettes  *palette.Repository
	aggregate *palette.CandidateAggregateService
}

func NewSQLRepository() *SQLRepository {
	return &SQLRepository{db: database.DB, palettes: palette.NewRepository(), aggregate: palette.NewCandidateAggregateService()}
}

func (r *SQLRepository) Snapshot(ctx context.Context) ([]Comparison, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,status,colors FROM palettes WHERE owner_user_id IS NULL AND visibility='public' AND status IN ('candidate','published') ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Comparison{}
	for rows.Next() {
		var c Comparison
		var raw []byte
		if err := rows.Scan(&c.ID, &c.Status, &raw); err != nil {
			return nil, err
		}
		var colors []palette.PaletteColor
		if json.Unmarshal(raw, &colors) != nil {
			return nil, errors.New("invalid persisted colors")
		}
		c.HEX = make([]string, len(colors))
		seen := make([]bool, len(colors))
		for _, color := range colors {
			if color.Order < 0 || color.Order >= len(colors) || seen[color.Order] || palette.NormalizeHex(color.Hex) != color.Hex {
				return nil, errors.New("invalid persisted color ordering")
			}
			seen[color.Order] = true
			c.HEX[color.Order] = color.Hex
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *SQLRepository) Replay(ctx context.Context, actor, key, intent string) (*pa.CandidateReceipt, Outcome, error) {
	var digest, status string
	var raw []byte
	err := r.db.QueryRowContext(ctx, `SELECT create_intent_digest,status,candidate_receipt FROM palette_assistant_submissions WHERE actor_user_id=$1 AND operation=$2 AND idempotency_key=$3`, actor, operation, key).Scan(&digest, &status, &raw)
	if err == sql.ErrNoRows {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	if digest != intent {
		return nil, OutcomeConflict, nil
	}
	if status != "succeeded" {
		return nil, OutcomeInProgress, nil
	}
	var receipt pa.CandidateReceipt
	if json.Unmarshal(raw, &receipt) != nil {
		return nil, "", errors.New("invalid stored receipt")
	}
	return &receipt, OutcomeReplay, nil
}

func (r *SQLRepository) Create(ctx context.Context, actor, key, intent, draftDigestValue, findingDigestValue string, draft pa.AssistantDraft, findings []pa.ProtocolFinding) (*pa.CandidateReceipt, Outcome, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	var recordID string
	err = tx.QueryRowContext(ctx, `INSERT INTO palette_assistant_submissions(actor_user_id,operation,idempotency_key,create_intent_digest,draft_digest,finding_set_digest,registry_fingerprint,duplicate_policy_version,similarity_policy_version,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'processing') ON CONFLICT DO NOTHING RETURNING id`, actor, operation, key, intent, draftDigestValue, findingDigestValue, pa.PreviewRegistryFingerprint, pa.DuplicatePolicyVersion, pa.SimilarityPolicyVersion).Scan(&recordID)
	if err == sql.ErrNoRows {
		return r.replayOrConflict(ctx, tx, actor, key, intent)
	}
	if err != nil {
		return nil, "", err
	}
	ids := map[string]string{}
	for _, c := range draft.Colors {
		id, e := NewUUID()
		if e != nil {
			return nil, "", e
		}
		ids[c.ID] = id
	}
	input, e := PaletteInput(draft, ids)
	if e != nil {
		return nil, "", e
	}
	candidateID, e := NewUUID()
	if e != nil {
		return nil, "", e
	}
	input.Palette.Slug = Slug(draft.Name, candidateID)
	input.ActorUserID = actor
	result, e := r.aggregate.Create(&sqlAggregateTx{tx: tx, palettes: r.palettes}, input)
	if e != nil {
		return nil, "", e
	}
	exact, e := exactFingerprint(draft)
	if e != nil {
		return nil, "", e
	}
	if _, e = tx.ExecContext(ctx, `UPDATE palettes SET exact_fingerprint=$1,exact_fingerprint_version=$2 WHERE id=$3`, exact, pa.ExactFingerprintVersion, result.PaletteID); e != nil {
		var pe *pq.Error
		if errors.As(e, &pe) && pe.Code == "23505" {
			return nil, OutcomeExact, nil
		}
		return nil, "", e
	}
	created := time.Now().UTC()
	receipt := &pa.CandidateReceipt{ContractVersion: pa.ContractVersion, ReceiptID: recordID, CandidateID: result.PaletteID, Status: "candidate", PreviewCaseIDs: result.PreviewCaseIDs, AdminReviewPath: "/admin/palettes/" + result.PaletteID + "/edit", CreatedAt: created, Replay: false}
	raw, e := json.Marshal(receipt)
	if e != nil {
		return nil, "", e
	}
	if _, e = tx.ExecContext(ctx, `UPDATE palette_assistant_submissions SET status='succeeded',candidate_id=$1,candidate_receipt=$2,completed_at=$3 WHERE id=$4 AND status='processing'`, result.PaletteID, raw, created, recordID); e != nil {
		return nil, "", e
	}
	if e = tx.Commit(); e != nil {
		return nil, "", e
	}
	return receipt, OutcomeCreated, nil
}
func (r *SQLRepository) replayOrConflict(ctx context.Context, tx *sql.Tx, actor, key, intent string) (*pa.CandidateReceipt, Outcome, error) {
	var digest, status string
	var raw []byte
	err := tx.QueryRowContext(ctx, `SELECT create_intent_digest,status,candidate_receipt FROM palette_assistant_submissions WHERE actor_user_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE`, actor, operation, key).Scan(&digest, &status, &raw)
	if err != nil {
		return nil, "", err
	}
	if digest != intent {
		return nil, OutcomeConflict, nil
	}
	if status != "succeeded" {
		return nil, OutcomeInProgress, nil
	}
	var receipt pa.CandidateReceipt
	if json.Unmarshal(raw, &receipt) != nil {
		return nil, "", errors.New("invalid stored receipt")
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return &receipt, OutcomeReplay, nil
}

type sqlAggregateTx struct {
	tx       *sql.Tx
	palettes *palette.Repository
}

func (t *sqlAggregateTx) CreateCandidate(req *palette.CreatePaletteRequest, actor string) (*palette.Palette, error) {
	return t.palettes.CreateCandidateTx(t.tx, req, actor)
}
func (t *sqlAggregateTx) CreatePreview(id string, req *palette.CreatePreviewCaseRequest) (*palette.PalettePreviewCase, error) {
	return t.palettes.CreatePreviewCaseTx(t.tx, id, req)
}
