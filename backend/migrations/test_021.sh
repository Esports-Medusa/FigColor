#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"
ADMIN_DB="${PGDATABASE:-postgres}"
suffix="${$}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
prefix="figcolor_021_${suffix}"
pre_db="${prefix}_pre"
valid_db="${prefix}_valid"
created=("$pre_db" "$valid_db")
admin(){ "$PSQL_BIN" -X -q -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"; }
db(){ local name="$1";shift;"$PSQL_BIN" -X -q -v ON_ERROR_STOP=1 -d "$name" "$@"; }
cleanup(){ for name in "${created[@]}";do admin -c "DROP DATABASE IF EXISTS ${name} WITH (FORCE)"||true;done; }
trap cleanup EXIT
pre=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases 016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types 019_create_palette_ingestion_records 020_add_palette_ingestion_recovery)
cleanup
admin -c "CREATE DATABASE ${pre_db}"
for migration in "${pre[@]}";do db "$pre_db" -f "$root_dir/backend/migrations/${migration}.sql";done

admin -c "CREATE DATABASE ${valid_db} TEMPLATE ${pre_db}"
db "$valid_db" <<'SQL'
INSERT INTO users(id,email,email_verified,status,role) VALUES('11111111-1111-4111-8111-111111111111','wpb6-pg@figcolor.local',true,'active','admin');
INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,owner_user_id) VALUES
('pub','Published','[{"id":"b","hex":"#AABBCC","rgb":[170,187,204],"order":1},{"id":"a","hex":"#112233","rgb":[17,34,51],"order":0}]',2,'categorical','{}','curated','published','public','curated',NULL),
('candidate','Candidate','[{"id":"a","hex":"#123ABC","rgb":[18,58,188],"order":0}]',1,'categorical','{}','curated','candidate','public','curated',NULL),
('archived','Archived','[{"id":"a","hex":"#010203","rgb":[1,2,3],"order":0}]',1,'categorical','{}','curated','archived','public','curated',NULL),
('private','Private','[{"id":"a","hex":"#020304","rgb":[2,3,4],"order":0}]',1,'categorical','{}','curated','draft','private','custom','11111111-1111-4111-8111-111111111111'),
('owned','Owned public','[{"id":"a","hex":"#030405","rgb":[3,4,5],"order":0}]',1,'categorical','{}','curated','published','public','curated','11111111-1111-4111-8111-111111111111');
SQL
db "$valid_db" -f "$root_dir/backend/migrations/021_create_palette_assistant_submissions.sql"
db "$valid_db" <<'SQL'
DO $$ DECLARE expected text;actual text;BEGIN
 expected:=encode(digest(convert_to('{"ordered_hex":["#112233","#AABBCC"],"version":1}','UTF8'),'sha256'),'hex');
 SELECT exact_fingerprint INTO actual FROM palettes WHERE slug='pub';
 IF actual<>expected THEN RAISE EXCEPTION 'SQL/Go exact fingerprint parity failed: % <> %',actual,expected;END IF;
 IF EXISTS(SELECT 1 FROM palettes WHERE exact_fingerprint IS NULL OR exact_fingerprint_version<>1) THEN RAISE EXCEPTION 'valid legacy backfill incomplete';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') OR to_regclass('palette_assistant_submissions') IS NULL OR to_regclass('idx_palette_active_public_exact_fingerprint') IS NULL THEN RAISE EXCEPTION '021 schema incomplete';END IF;
END $$;
DO $$ DECLARE fp text:=repeat('a',64);BEGIN
 INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,exact_fingerprint,exact_fingerprint_version) VALUES('scope-c1','c1','[{"hex":"#111111","order":0}]',1,'categorical','{}','curated','candidate','public','curated',fp,1);
 BEGIN INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,exact_fingerprint,exact_fingerprint_version) VALUES('scope-c2','c2','[{"hex":"#111111","order":0}]',1,'categorical','{}','curated','candidate','public','curated',fp,1);RAISE EXCEPTION 'candidate/candidate uniqueness missing';EXCEPTION WHEN unique_violation THEN NULL;END;
 BEGIN INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,exact_fingerprint,exact_fingerprint_version) VALUES('scope-p1','p1','[{"hex":"#111111","order":0}]',1,'categorical','{}','curated','published','public','curated',fp,1);RAISE EXCEPTION 'candidate/published uniqueness missing';EXCEPTION WHEN unique_violation THEN NULL;END;
 fp:=repeat('b',64);INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,exact_fingerprint,exact_fingerprint_version) VALUES('scope-p2','p2','[{"hex":"#222222","order":0}]',1,'categorical','{}','curated','published','public','curated',fp,1);
 BEGIN INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,exact_fingerprint,exact_fingerprint_version) VALUES('scope-p3','p3','[{"hex":"#222222","order":0}]',1,'categorical','{}','curated','published','public','curated',fp,1);RAISE EXCEPTION 'published/published uniqueness missing';EXCEPTION WHEN unique_violation THEN NULL;END;
 INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,owner_user_id,exact_fingerprint,exact_fingerprint_version) VALUES
 ('scope-archived','archived','[{"hex":"#111111","order":0}]',1,'categorical','{}','curated','archived','public','curated',NULL,repeat('a',64),1),
 ('scope-private','private','[{"hex":"#111111","order":0}]',1,'categorical','{}','curated','draft','private','custom','11111111-1111-4111-8111-111111111111',repeat('a',64),1),
 ('scope-owned','owned','[{"hex":"#111111","order":0}]',1,'categorical','{}','curated','published','public','curated','11111111-1111-4111-8111-111111111111',repeat('a',64),1);
END $$;
SQL

failure_case(){ local label="$1" expected="$2" fixture="$3";local name="${prefix}_${label}";created+=("$name");admin -c "CREATE DATABASE ${name} TEMPLATE ${pre_db}";db "$name" -c "$fixture";set +e;output=$(db "$name" -f "$root_dir/backend/migrations/021_create_palette_assistant_submissions.sql" 2>&1);status=$?;set -e;if [[ $status -eq 0 || "$output" != *"$expected"* ]];then echo "021 failure case ${label} did not fail as ${expected}" >&2;exit 1;fi;if db "$name" -Atc "SELECT count(*) FROM information_schema.columns WHERE table_name='palettes' AND column_name='exact_fingerprint'"|grep -vq '^0$';then echo "021 failure case ${label} left partial schema" >&2;exit 1;fi; }
base="INSERT INTO palettes(slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin) VALUES"
failure_case non_array "legacy palette color shape" "$base('bad','bad','{}',1,'categorical','{}','curated','candidate','public','curated')"
failure_case empty "legacy palette color shape" "$base('bad','bad','[]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case element "legacy palette color shape" "$base('bad','bad','[1]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case missing_hex "legacy palette color shape" "$base('bad','bad','[{\"order\":0}]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case lowercase_hex "legacy palette color shape" "$base('bad','bad','[{\"hex\":\"#aabbcc\",\"order\":0}]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case missing_order "legacy palette color shape" "$base('bad','bad','[{\"hex\":\"#AABBCC\"}]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case fractional_order "legacy palette color shape" "$base('bad','bad','[{\"hex\":\"#AABBCC\",\"order\":0.5}]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case negative_order "legacy palette color order" "$base('bad','bad','[{\"hex\":\"#AABBCC\",\"order\":-1}]',1,'categorical','{}','curated','candidate','public','curated')"
failure_case duplicate_order "legacy palette color order" "$base('bad','bad','[{\"hex\":\"#AABBCC\",\"order\":0},{\"hex\":\"#112233\",\"order\":0}]',2,'categorical','{}','curated','candidate','public','curated')"
failure_case noncontiguous_order "legacy palette color order" "$base('bad','bad','[{\"hex\":\"#AABBCC\",\"order\":0},{\"hex\":\"#112233\",\"order\":2}]',2,'categorical','{}','curated','candidate','public','curated')"
failure_case exact_duplicate "exact fingerprints must be unique" "$base('a','a','[{\"hex\":\"#AABBCC\",\"order\":0}]',1,'categorical','{}','curated','candidate','public','curated'),('b','b','[{\"hex\":\"#AABBCC\",\"order\":0}]',1,'categorical','{}','curated','published','public','curated')"

echo 'migration 021 PostgreSQL acceptance: PASS'
