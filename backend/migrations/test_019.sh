#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"
ADMIN_DB="${PGDATABASE:-postgres}"
suffix="${$}"
clean_db="figcolor_migration_019_clean_${suffix}"
upgrade_db="figcolor_migration_019_upgrade_${suffix}"
repair_db="figcolor_migration_019_repair_${suffix}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

admin() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"; }
db() { local name="$1"; shift; "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$name" "$@"; }
cleanup() {
  admin -q -c "DROP DATABASE IF EXISTS ${clean_db} WITH (FORCE)" || true
  admin -q -c "DROP DATABASE IF EXISTS ${upgrade_db} WITH (FORCE)" || true
  admin -q -c "DROP DATABASE IF EXISTS ${repair_db} WITH (FORCE)" || true
}
trap cleanup EXIT

pre_migrations=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases 016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types)
apply() { local name="$1"; shift; for migration in "$@"; do db "$name" -q -f "$root_dir/backend/migrations/${migration}.sql"; done; }

cleanup
admin -q -c "CREATE DATABASE ${clean_db}"
admin -q -c "CREATE DATABASE ${upgrade_db}"
admin -q -c "CREATE DATABASE ${repair_db}"

# A clean database reaches 019 and exposes every frozen uniqueness/check/FK boundary.
apply "$clean_db" "${pre_migrations[@]}" 019_create_palette_ingestion_records
db "$clean_db" -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='palette_ingestion_records') THEN RAISE EXCEPTION '019 table missing'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='palette_ingestion_records'::regclass AND contype='u')<>4 THEN RAISE EXCEPTION '019 unique constraints incomplete'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='palette_ingestion_records'::regclass AND contype='f')<>2 THEN RAISE EXCEPTION '019 foreign keys incomplete'; END IF;
END $$;
INSERT INTO users (id,email,email_verified,status,role) VALUES ('11111111-1111-4111-8111-111111111111','ingestion@figcolor.local',true,'active','user');
INSERT INTO palette_ingestion_records (id,proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id)
VALUES ('22222222-2222-4222-8222-222222222222','batch/proposal','proposal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174000','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','pipeline-v1',1,'11111111-1111-4111-8111-111111111111');
SQL

# Database-level collisions cannot create a second reservation.
if db "$clean_db" -q -c "INSERT INTO palette_ingestion_records (proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id) VALUES ('batch/key-conflict','proposal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174000','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','pipeline-v1',1,'11111111-1111-4111-8111-111111111111')"; then echo 'same scoped key unexpectedly inserted' >&2; exit 1; fi
if db "$clean_db" -q -c "INSERT INTO palette_ingestion_records (proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id) VALUES ('batch/proposal','proposal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174001','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','pipeline-v1',1,'11111111-1111-4111-8111-111111111111')"; then echo 'duplicate proposal unexpectedly inserted' >&2; exit 1; fi
if db "$clean_db" -q -c "INSERT INTO palette_ingestion_records (proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id) VALUES ('batch/content-conflict','proposal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174002','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','pipeline-v1',1,'11111111-1111-4111-8111-111111111111')"; then echo 'duplicate content unexpectedly inserted' >&2; exit 1; fi
if db "$clean_db" -q -c "INSERT INTO palette_ingestion_records (proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id) VALUES ('batch/bad','proposal','not-a-hash','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','wrong-operation','not-a-uuid','bad','pipeline-v1',0,'11111111-1111-4111-8111-111111111111')"; then echo 'invalid checks unexpectedly accepted' >&2; exit 1; fi
if db "$clean_db" -q -c "INSERT INTO palette_ingestion_records (proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id) VALUES ('batch/bad-fk','proposal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174003','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','pipeline-v1',1,'99999999-9999-4999-8999-999999999999')"; then echo 'invalid actor FK unexpectedly accepted' >&2; exit 1; fi

# Receipt binding is atomic with the candidate Palette; a bad binding rolls both back.
db "$clean_db" -q <<'SQL'
BEGIN;
INSERT INTO palettes (id,slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,created_by,owner_user_id)
VALUES ('33333333-3333-4333-8333-333333333333','candidate-palette','Candidate Palette','[{"id":"color-1","hex":"#112233","rgb":[17,34,51],"order":0}]',1,'categorical','{}','curated','candidate','private','custom','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');
UPDATE palette_ingestion_records SET processing_state='succeeded',palette_id='33333333-3333-4333-8333-333333333333',receipt=jsonb_build_object('proposal_id',proposal_id,'normalized_content_hash',normalized_content_hash,'request_fingerprint',request_fingerprint,'palette_id','33333333-3333-4333-8333-333333333333','slug','candidate-palette','status','candidate','preview_case_ids','[]'::jsonb),updated_at=NOW() WHERE id='22222222-2222-4222-8222-222222222222';
COMMIT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM palette_ingestion_records WHERE id='22222222-2222-4222-8222-222222222222' AND processing_state='succeeded' AND palette_id='33333333-3333-4333-8333-333333333333' AND receipt->>'proposal_id'=proposal_id AND receipt->>'normalized_content_hash'=normalized_content_hash AND receipt->>'request_fingerprint'=request_fingerprint) THEN RAISE EXCEPTION 'receipt binding mismatch'; END IF;
END $$;
SQL
if db "$clean_db" -q <<'SQL'
BEGIN;
INSERT INTO palettes (id,slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,created_by,owner_user_id) VALUES ('44444444-4444-4444-8444-444444444444','partial-palette','Partial Palette','[{"id":"color-1","hex":"#112233","rgb":[17,34,51],"order":0}]',1,'categorical','{}','curated','candidate','private','custom','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');
UPDATE palette_ingestion_records SET receipt='{}'::jsonb WHERE id='22222222-2222-4222-8222-222222222222';
COMMIT;
SQL
then echo 'invalid receipt transaction unexpectedly committed' >&2; exit 1; fi
db "$clean_db" -q -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM palettes WHERE id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'partial palette survived rollback'; END IF; END \$\$"

# Two concurrent scoped-key claims serialize on the unique index and leave one row.
db "$clean_db" -q -c "DELETE FROM palette_ingestion_records; DELETE FROM palettes"
claim_sql="INSERT INTO palette_ingestion_records (proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id) VALUES ('batch/concurrent','proposal','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174009','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','pipeline-v1',1,'11111111-1111-4111-8111-111111111111') ON CONFLICT DO NOTHING"
(db "$clean_db" -q -c "BEGIN; ${claim_sql}; SELECT pg_sleep(1); COMMIT") & first_pid=$!
(db "$clean_db" -q -c "${claim_sql}") & second_pid=$!
wait "$first_pid"
wait "$second_pid"
db "$clean_db" -q -c "DO \$\$ BEGIN IF (SELECT count(*) FROM palette_ingestion_records)<>1 THEN RAISE EXCEPTION 'concurrent claim created multiple rows'; END IF; END \$\$"

# A representative 018 database upgrades without changing existing Palette data.
apply "$upgrade_db" "${pre_migrations[@]}"
db "$upgrade_db" -q <<'SQL'
INSERT INTO users (id,email,email_verified,status,role) VALUES ('11111111-1111-4111-8111-111111111111','upgrade-019@figcolor.local',true,'active','user');
INSERT INTO palettes (id,slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,created_by) VALUES ('33333333-3333-4333-8333-333333333333','existing-palette','Existing Palette','[{"id":"color-1","hex":"#112233","rgb":[17,34,51],"order":0}]',1,'categorical','{}','curated','published','public','curated','11111111-1111-4111-8111-111111111111');
SQL
apply "$upgrade_db" 019_create_palette_ingestion_records
db "$upgrade_db" -q -c "DO \$\$ BEGIN IF (SELECT count(*) FROM palettes WHERE id='33333333-3333-4333-8333-333333333333')<>1 OR (SELECT count(*) FROM palette_ingestion_records)<>0 THEN RAISE EXCEPTION 'pre-019 upgrade changed existing data'; END IF; END \$\$"

# A transactional DDL failure leaves no partial table; repair then rerun succeeds.
apply "$repair_db" "${pre_migrations[@]}"
db "$repair_db" -q -c "CREATE INDEX idx_palette_ingestion_records_state_updated ON users(updated_at)"
if apply "$repair_db" 019_create_palette_ingestion_records; then echo '019 failure fixture unexpectedly migrated' >&2; exit 1; fi
db "$repair_db" -q -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='palette_ingestion_records') THEN RAISE EXCEPTION 'failed 019 left partial table'; END IF; END \$\$; DROP INDEX idx_palette_ingestion_records_state_updated"
apply "$repair_db" 019_create_palette_ingestion_records

echo 'migration 019 persistence acceptance: PASS'
