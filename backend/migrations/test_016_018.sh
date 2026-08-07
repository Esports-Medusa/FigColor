#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"
ADMIN_DB="${PGDATABASE:-postgres}"
suffix="${$}"
clean_db="figcolor_migration_accept_clean_${suffix}"
upgrade_db="figcolor_migration_accept_upgrade_${suffix}"
rollback_db="figcolor_migration_accept_rollback_${suffix}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

admin() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"; }
db() { local name="$1"; shift; "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$name" "$@"; }
cleanup() {
  admin -q -c "DROP DATABASE IF EXISTS ${clean_db} WITH (FORCE)" || true
  admin -q -c "DROP DATABASE IF EXISTS ${upgrade_db} WITH (FORCE)" || true
  admin -q -c "DROP DATABASE IF EXISTS ${rollback_db} WITH (FORCE)" || true
}
trap cleanup EXIT

pre_migrations=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases)
tail_migrations=(016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types)
apply() { local name="$1"; shift; for migration in "$@"; do db "$name" -q -f "$root_dir/backend/migrations/${migration}.sql"; done; }

cleanup
admin -q -c "CREATE DATABASE ${clean_db}"
admin -q -c "CREATE DATABASE ${upgrade_db}"
admin -q -c "CREATE DATABASE ${rollback_db}"

apply "$clean_db" "${pre_migrations[@]}" "${tail_migrations[@]}"
db "$clean_db" -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='figure_assignments_palette_id_fkey' AND pg_get_constraintdef(oid) LIKE '%REFERENCES palettes(id)%') THEN RAISE EXCEPTION '016 figure FK missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='palettes_private_owner_check') THEN RAISE EXCEPTION '017 ownership constraint missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_palette_preview_cases_chart_type' AND pg_get_constraintdef(oid) LIKE '%scatter_grouped%' AND pg_get_constraintdef(oid) LIKE '%violin_distribution%') THEN RAISE EXCEPTION '018 chart types missing'; END IF;
END $$;
SQL

apply "$upgrade_db" "${pre_migrations[@]}"
db "$upgrade_db" -q <<'SQL'
INSERT INTO users (id,email,email_verified,name,status,role) VALUES ('11111111-1111-4111-8111-111111111111','migration-owner@figcolor.local',true,'Migration Owner','active','user');
INSERT INTO paper_projects (id,user_id,name) VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Legacy Project');
INSERT INTO project_palettes (id,project_id,name,is_default) VALUES ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Legacy Project Palette',true);
UPDATE paper_projects SET default_palette_id='33333333-3333-4333-8333-333333333333' WHERE id='22222222-2222-4222-8222-222222222222';
INSERT INTO palette_roles (palette_id,key,label,color,role_type,sort_order) VALUES ('33333333-3333-4333-8333-333333333333','series-b','Series B','#AABBCC','group',20),('33333333-3333-4333-8333-333333333333','series-a','Series A','#112233','group',10);
INSERT INTO figure_assignments (id,project_id,palette_id,name,chart_type) VALUES ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','Legacy Figure','bar');
INSERT INTO palettes (id,slug,name,colors,color_count,type,chart_types,accessibility,source_type,status,version,created_by,published_at) VALUES ('66666666-6666-4666-8666-666666666666','official-existing','Official Existing','[{"id":"official-a","hex":"#445566","rgb":[68,85,102],"order":0}]',1,'categorical',ARRAY['bar'],'{}','curated','published','official-v1','11111111-1111-4111-8111-111111111111',NOW());
INSERT INTO palette_preview_cases (id,palette_id,chart_type,template_id,color_roles,preview_config,status,is_primary) VALUES ('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666','bar_error','bar_error_v1','{"bar":"official-a"}','{"groups":1}','published',true);
SQL
apply "$upgrade_db" "${tail_migrations[@]}"
db "$upgrade_db" -q <<'SQL'
DO $$ DECLARE p palettes%ROWTYPE; figure_palette uuid; BEGIN
  SELECT palettes.* INTO p FROM project_palettes pp JOIN palettes ON palettes.id=pp.base_palette_id WHERE pp.id='33333333-3333-4333-8333-333333333333';
  SELECT palette_id INTO figure_palette FROM figure_assignments WHERE id='44444444-4444-4444-8444-444444444444';
  IF p.id IS NULL OR figure_palette<>p.id OR p.visibility<>'private' OR p.origin<>'custom' OR p.status<>'draft' OR p.owner_user_id<>'11111111-1111-4111-8111-111111111111' THEN RAISE EXCEPTION '016/017 backfill mismatch'; END IF;
  IF p.color_count<>2 OR p.colors#>>'{0,id}'<>'series-a' OR p.colors#>>'{0,label}'<>'Series A' OR p.colors#>>'{0,order}'<>'0' OR p.colors#>>'{0,rgb,0}'<>'17' OR p.colors#>>'{1,order}'<>'1' THEN RAISE EXCEPTION '016 canonical colors mismatch: %',p.colors; END IF;
  IF (SELECT count(*) FROM palettes)<>2 OR (SELECT count(*) FROM project_palettes)<>1 OR (SELECT count(*) FROM figure_assignments)<>1 OR (SELECT count(*) FROM palette_preview_cases)<>1 THEN RAISE EXCEPTION 'row preservation mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM palettes WHERE id='66666666-6666-4666-8666-666666666666' AND visibility='public' AND origin='curated' AND status='published') THEN RAISE EXCEPTION 'official palette changed'; END IF;
END $$;
INSERT INTO palette_preview_cases (palette_id,chart_type,template_id,color_roles,preview_config) VALUES ('66666666-6666-4666-8666-666666666666','scatter_grouped','scatter_grouped_v1','{}','{}'),('66666666-6666-4666-8666-666666666666','violin_distribution','violin_distribution_v1','{}','{}');
SQL
if db "$upgrade_db" -q -c "INSERT INTO palette_preview_cases (palette_id,chart_type,template_id,color_roles,preview_config) VALUES ('66666666-6666-4666-8666-666666666666','unknown_chart','unknown_v1','{}','{}')"; then echo 'unknown chart type unexpectedly accepted' >&2; exit 1; fi
if db "$upgrade_db" -q -c "INSERT INTO palettes (slug,name,colors,color_count,type,accessibility,status,visibility,origin) VALUES ('invalid-private','Invalid','[{\"id\":\"x\",\"hex\":\"#000000\",\"rgb\":[0,0,0],\"order\":0}]',1,'categorical','{}','draft','private','custom')"; then echo 'ownerless private palette unexpectedly accepted' >&2; exit 1; fi
apply "$upgrade_db" "${tail_migrations[@]}"

apply "$rollback_db" "${pre_migrations[@]}"
db "$rollback_db" -q <<'SQL'
INSERT INTO users (id,email,email_verified,status,role) VALUES ('11111111-1111-4111-8111-111111111111','rollback@figcolor.local',true,'active','user');
INSERT INTO paper_projects (id,user_id,name) VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Rollback Project');
INSERT INTO project_palettes (id,project_id,name,base_palette_id) VALUES ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Broken Link','99999999-9999-4999-8999-999999999999');
SQL
if apply "$rollback_db" 016_figure_assignments_base_palette_fk; then echo '016 failure fixture unexpectedly migrated' >&2; exit 1; fi
db "$rollback_db" -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='figure_assignments_palette_id_fkey' AND pg_get_constraintdef(oid) LIKE '%REFERENCES project_palettes(id)%') THEN RAISE EXCEPTION '016 rollback did not restore old FK'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='palettes' AND column_name='visibility') THEN RAISE EXCEPTION 'unexpected later schema'; END IF;
END $$;
UPDATE project_palettes SET base_palette_id=NULL WHERE id='33333333-3333-4333-8333-333333333333';
SQL
apply "$rollback_db" 016_figure_assignments_base_palette_fk
db "$rollback_db" -q <<'SQL'
INSERT INTO users (id,email,email_verified,status,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','second-owner@figcolor.local',true,'active','user');
INSERT INTO paper_projects (id,user_id,name) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Second Project');
INSERT INTO project_palettes (id,project_id,name,base_palette_id) SELECT 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Shared Palette',base_palette_id FROM project_palettes WHERE id='33333333-3333-4333-8333-333333333333';
SQL
if apply "$rollback_db" 017_add_palette_ownership_visibility; then echo '017 failure fixture unexpectedly migrated' >&2; exit 1; fi
db "$rollback_db" -q <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='palettes' AND column_name='visibility') THEN RAISE EXCEPTION '017 rollback left partial columns'; END IF;
END $$;
DELETE FROM project_palettes WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SQL
apply "$rollback_db" 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types

echo 'migration 016-018 acceptance: PASS'
