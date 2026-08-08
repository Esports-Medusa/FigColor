#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"
ADMIN_DB="${PGDATABASE:-postgres}"
suffix="${$}"
clean_db="figcolor_migration_020_clean_${suffix}"
upgrade_db="figcolor_migration_020_upgrade_${suffix}"
repair_db="figcolor_migration_020_repair_${suffix}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
admin(){ "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"; }
db(){ local name="$1";shift;"$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$name" "$@"; }
cleanup(){ admin -q -c "DROP DATABASE IF EXISTS ${clean_db} WITH (FORCE)"||true;admin -q -c "DROP DATABASE IF EXISTS ${upgrade_db} WITH (FORCE)"||true;admin -q -c "DROP DATABASE IF EXISTS ${repair_db} WITH (FORCE)"||true; }
trap cleanup EXIT
pre=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases 016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types 019_create_palette_ingestion_records)
apply(){ local name="$1";shift;for migration in "$@";do db "$name" -q -f "$root_dir/backend/migrations/${migration}.sql";done; }

cleanup
admin -q -c "CREATE DATABASE ${clean_db}"
admin -q -c "CREATE DATABASE ${upgrade_db}"
admin -q -c "CREATE DATABASE ${repair_db}"

apply "$clean_db" "${pre[@]}" 020_add_palette_ingestion_recovery
db "$clean_db" -q <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='palette_ingestion_attempts') THEN RAISE EXCEPTION 'attempt table missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_palette_ingestion_attempt_immutable') THEN RAISE EXCEPTION 'attempt trigger missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='palette_ingestion_records_current_attempt_fkey' AND condeferrable) THEN RAISE EXCEPTION 'current attempt FK missing/not deferred';END IF;
END $$;
SQL

# Build a representative real 019 database with both states, then upgrade.
apply "$upgrade_db" "${pre[@]}"
db "$upgrade_db" -q <<'SQL'
INSERT INTO users(id,email,email_verified,status,role) VALUES('11111111-1111-4111-8111-111111111111','upgrade-020@figcolor.local',true,'active','user');
INSERT INTO palettes(id,slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,created_by)
VALUES('22222222-2222-4222-8222-222222222222','existing-candidate','Existing Candidate','[{"id":"c","hex":"#112233","rgb":[17,34,51],"order":0}]',1,'categorical','{}','curated','candidate','public','curated','11111111-1111-4111-8111-111111111111');
INSERT INTO palette_ingestion_records(id,proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,pipeline_version,schema_version,actor_user_id)
VALUES('33333333-3333-4333-8333-333333333331','batch/processing','processing','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174001','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','pipeline-v1',1,'11111111-1111-4111-8111-111111111111');
INSERT INTO palette_ingestion_records(id,proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,processing_state,palette_id,receipt,pipeline_version,schema_version,actor_user_id)
VALUES('33333333-3333-4333-8333-333333333332','batch/succeeded','succeeded','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','palette_candidate_import_v1','123e4567-e89b-42d3-a456-426614174002','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff','succeeded','22222222-2222-4222-8222-222222222222','{"proposal_id":"batch/succeeded","normalized_content_hash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","request_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","palette_id":"22222222-2222-4222-8222-222222222222","slug":"existing-candidate","status":"candidate","preview_case_ids":[]}','pipeline-v1',1,'11111111-1111-4111-8111-111111111111');
SQL
apply "$upgrade_db" 020_add_palette_ingestion_recovery
db "$upgrade_db" -q <<'SQL'
DO $$ DECLARE p palette_ingestion_records%ROWTYPE;s palette_ingestion_records%ROWTYPE;BEGIN
 SELECT * INTO p FROM palette_ingestion_records WHERE id='33333333-3333-4333-8333-333333333331';
 SELECT * INTO s FROM palette_ingestion_records WHERE id='33333333-3333-4333-8333-333333333332';
 IF p.processing_state<>'processing' OR p.attempt_count<>1 OR p.lease_token IS NULL OR p.lease_expires_at>=clock_timestamp() THEN RAISE EXCEPTION 'processing backfill invalid';END IF;
 IF s.processing_state<>'succeeded' OR s.attempt_count<>1 OR s.lease_token IS NOT NULL OR s.receipt->>'proposal_id'<>'batch/succeeded' THEN RAISE EXCEPTION 'succeeded backfill invalid';END IF;
 IF NOT EXISTS(SELECT 1 FROM palette_ingestion_attempts WHERE ingestion_record_id=p.id AND attempt_number=1 AND outcome='processing' AND lease_expires_at<clock_timestamp()) THEN RAISE EXCEPTION 'processing audit missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM palette_ingestion_attempts WHERE ingestion_record_id=s.id AND attempt_number=1 AND outcome='succeeded' AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'succeeded audit missing';END IF;
END $$;
SQL

# State checks and immutable audit/reservation rules fail closed.
if db "$upgrade_db" -q -c "UPDATE palette_ingestion_records SET processing_state='failed' WHERE id='33333333-3333-4333-8333-333333333331'";then echo 'invalid failed fields accepted'>&2;exit 1;fi
if db "$upgrade_db" -q -c "UPDATE palette_ingestion_records SET processing_state='processing' WHERE id='33333333-3333-4333-8333-333333333332'";then echo 'succeeded record reopened'>&2;exit 1;fi
if db "$upgrade_db" -q -c "UPDATE palette_ingestion_attempts SET outcome='lease_expired',completed_at=clock_timestamp() WHERE ingestion_record_id='33333333-3333-4333-8333-333333333331'; UPDATE palette_ingestion_attempts SET outcome='processing',completed_at=NULL WHERE ingestion_record_id='33333333-3333-4333-8333-333333333331'";then echo 'terminal attempt reopened'>&2;exit 1;fi
if db "$upgrade_db" -q -c "UPDATE palette_ingestion_attempts SET attempt_number=9 WHERE ingestion_record_id='33333333-3333-4333-8333-333333333332'";then echo 'attempt renumbered'>&2;exit 1;fi
if db "$upgrade_db" -q -c "DELETE FROM palette_ingestion_attempts WHERE ingestion_record_id='33333333-3333-4333-8333-333333333332'";then echo 'terminal attempt deleted'>&2;exit 1;fi
if db "$upgrade_db" -q -c "DELETE FROM palette_ingestion_records WHERE id='33333333-3333-4333-8333-333333333332'";then echo 'reservation deleted'>&2;exit 1;fi
if db "$upgrade_db" -q -c "INSERT INTO palette_ingestion_attempts(ingestion_record_id,attempt_number,lease_token,recovery_mode,started_at,lease_expires_at) SELECT ingestion_record_id,attempt_number,gen_random_uuid(),'initial',started_at,lease_expires_at FROM palette_ingestion_attempts WHERE ingestion_record_id='33333333-3333-4333-8333-333333333331'";then echo 'attempt number reused'>&2;exit 1;fi
if db "$upgrade_db" -q -c "INSERT INTO palette_ingestion_attempts(ingestion_record_id,attempt_number,lease_token,recovery_mode,started_at,lease_expires_at) SELECT ingestion_record_id,2,lease_token,'stale_recovery',started_at,lease_expires_at FROM palette_ingestion_attempts WHERE ingestion_record_id='33333333-3333-4333-8333-333333333331'";then echo 'lease token reused'>&2;exit 1;fi
if db "$upgrade_db" -q -c "INSERT INTO palette_ingestion_attempts(ingestion_record_id,attempt_number,lease_token,recovery_mode,started_at,lease_expires_at,outcome,completed_at) SELECT ingestion_record_id,2,gen_random_uuid(),'stale_recovery',started_at,lease_expires_at,'succeeded',clock_timestamp() FROM palette_ingestion_attempts WHERE ingestion_record_id='33333333-3333-4333-8333-333333333331'";then echo 'terminal attempt inserted directly'>&2;exit 1;fi

# A late DDL collision proves the entire migration is atomic; repair then rerun.
apply "$repair_db" "${pre[@]}"
db "$repair_db" -q -c "CREATE INDEX idx_palette_ingestion_records_recovery ON users(updated_at)"
if apply "$repair_db" 020_add_palette_ingestion_recovery;then echo '020 failure fixture unexpectedly migrated'>&2;exit 1;fi
db "$repair_db" -q <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='palette_ingestion_attempts') THEN RAISE EXCEPTION 'failed 020 left attempt table';END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='palette_ingestion_records' AND column_name='lease_token') THEN RAISE EXCEPTION 'failed 020 left columns';END IF;
END $$;
DROP INDEX idx_palette_ingestion_records_recovery;
SQL
apply "$repair_db" 020_add_palette_ingestion_recovery

echo 'migration 020 recovery acceptance: PASS'
