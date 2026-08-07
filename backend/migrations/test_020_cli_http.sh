#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"
GO_BIN="${GO_BIN:-go}"
NODE_BIN="${NODE_BIN:-node}"
CURL_BIN="${CURL_BIN:-curl}"
ADMIN_DB="${PGDATABASE:-postgres}"
test_db="figcolor_cli_http_020_${$}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
server_port="$((20000 + ($$ % 10000)))"
proxy_port="$((server_port + 1))"
test_root="$(mktemp -d)"
server_pid=""
proxy_pid=""

admin() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"; }
db() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$test_db" "$@"; }
cleanup() {
  local status="$?"
  if [[ "$status" -ne 0 && -f "$test_root/server.log" ]]; then
    echo "CLI HTTP integration failed; server log follows:" >&2
    tail -n 40 "$test_root/server.log" >&2 || true
  fi
  if [[ -n "$proxy_pid" ]]; then kill "$proxy_pid" 2>/dev/null || true; fi
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  admin -q -c "DROP DATABASE IF EXISTS ${test_db} WITH (FORCE)" || true
  rm -rf "$test_root"
  return "$status"
}
trap cleanup EXIT

migrations=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases 016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types 019_create_palette_ingestion_records 020_add_palette_ingestion_recovery)

admin -q -c "DROP DATABASE IF EXISTS ${test_db} WITH (FORCE)"
admin -q -c "CREATE DATABASE ${test_db}"
for migration in "${migrations[@]}"; do
  db -q -f "$root_dir/backend/migrations/${migration}.sql"
done

(
  cd "$root_dir/backend"
  DATABASE_URL="dbname=${test_db} sslmode=disable" SERVER_PORT="$server_port" JWT_SECRET="cli-http-test-secret" GOCACHE="${GOCACHE:-/tmp/figcolor-go-cache}" "$GO_BIN" run ./cmd/server
) >"$test_root/server.log" 2>&1 &
server_pid="$!"

for _ in {1..120}; do
  if "$CURL_BIN" --silent --fail "http://127.0.0.1:${server_port}/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
"$CURL_BIN" --silent --fail "http://127.0.0.1:${server_port}/health" >/dev/null

echo 'CLI HTTP E2E: authenticate admin'
"$CURL_BIN" --silent --fail-with-body -H 'Content-Type: application/json' -d '{"email":"admin@figcolor.local","password":"admin123"}' "http://127.0.0.1:${server_port}/api/auth/login" >"$test_root/admin-auth.json"
admin_token="$($NODE_BIN -e "const v=require('fs').readFileSync(process.argv[1],'utf8');const t=JSON.parse(v).token;if(!t)process.exit(1);process.stdout.write(t)" "$test_root/admin-auth.json")"

prepare_batch() {
  local batch="$1"
  local fixture="$2"
  local source_dir="$3"
  local artifacts="$4"
  mkdir -p "$batch/$source_dir"
  cp "$fixture" "$batch/$source_dir/manifest.json"
  "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" prepare --batch "$batch" --artifacts "$artifacts" --json >/dev/null
  "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" validate --batch "$batch" --artifacts "$artifacts" --json >/dev/null
}

first_batch="$test_root/submission-first-batch"
first_artifacts="$test_root/first-artifacts"
prepare_batch "$first_batch" "$root_dir/contracts/palette-ingestion/v1/fixtures/valid/submission-first/manifest.json" submission-first "$first_artifacts"
echo 'CLI HTTP E2E: first submission'
if ! FIGCOLOR_ADMIN_TOKEN="$admin_token" "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$first_batch" --artifacts "$first_artifacts" --api-base-url "http://127.0.0.1:${server_port}" --json >"$test_root/first-submit.json"; then
  cat "$test_root/first-submit.json" >&2
  exit 1
fi

first_palette_id="$($NODE_BIN -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].outcome!=='created')process.exit(1);process.stdout.write(r.packages[0].receipt.palette_id)" "$test_root/first-submit.json")"
first_slug="$($NODE_BIN -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));process.stdout.write(r.packages[0].receipt.slug)" "$test_root/first-submit.json")"
first_checkpoint="$first_artifacts/submission-first-batch/checkpoints/submission-first.json"
first_request="$first_artifacts/submission-first-batch/requests/submission-first.json"
first_receipt="$first_artifacts/submission-first-batch/receipts/submission-first.json"
first_key="$($NODE_BIN -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1])).idempotency_key)" "$first_checkpoint")"
first_fingerprint="$($NODE_BIN --input-type=module -e "import fs from 'node:fs';import {canonicalHashJSON,sha256Hex} from './scripts/palette-ingest/lib/jcs.mjs';const checkpoint=JSON.parse(fs.readFileSync(process.argv[1]));const request=fs.readFileSync(process.argv[2],'utf8');const receipt=fs.readFileSync(process.argv[3]);if(checkpoint.stage!=='submitted'||checkpoint.request_fingerprint!==canonicalHashJSON(request).hash||checkpoint.receipt_hash!==sha256Hex(receipt))process.exit(1);process.stdout.write(checkpoint.request_fingerprint)" "$first_checkpoint" "$first_request" "$first_receipt")"
[[ "$(db -Atqc "SELECT COUNT(*) FROM palettes WHERE id='${first_palette_id}' AND status='candidate' AND visibility='public' AND owner_user_id IS NULL AND chart_types @> ARRAY['bar_error']::text[] AND chart_applicability @> '[{\"chart_type\":\"bar_error\",\"suitability\":\"best_fit\",\"source\":\"curated\"}]'::jsonb")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_preview_cases WHERE palette_id='${first_palette_id}' AND status='draft' AND seed_strategy='stable_id' AND seed_value IS NULL")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_ingestion_records WHERE proposal_id='submission-first-batch/submission-first' AND idempotency_key='${first_key}' AND request_fingerprint='${first_fingerprint}' AND processing_state='succeeded' AND palette_id='${first_palette_id}' AND receipt->>'request_fingerprint'='${first_fingerprint}'")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_ingestion_attempts a JOIN palette_ingestion_records r ON r.id=a.ingestion_record_id WHERE r.proposal_id='submission-first-batch/submission-first'")" == "1" ]]

echo 'CLI HTTP E2E: same-key server replay and same-checkpoint resume'
"$CURL_BIN" --silent --fail-with-body -o "$test_root/first-replay.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer ${admin_token}" -H "Idempotency-Key: ${first_key}" --data-binary "@$first_request" "http://127.0.0.1:${server_port}/api/admin/palette-candidates" >"$test_root/first-replay.status"
[[ "$(cat "$test_root/first-replay.status")" == "200" ]]
"$NODE_BIN" -e "const fs=require('fs');const first=JSON.parse(fs.readFileSync(process.argv[1])).packages[0].receipt;const replay=JSON.parse(fs.readFileSync(process.argv[2]));if(JSON.stringify(first)!==JSON.stringify(replay))process.exit(1)" "$test_root/first-submit.json" "$test_root/first-replay.json"
"$NODE_BIN" -e "const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[1]));v.preview_cases[0].seed_value=null;fs.writeFileSync(process.argv[2],JSON.stringify(v))" "$first_request" "$test_root/null-seed-request.json"
"$CURL_BIN" --silent --fail-with-body -o "$test_root/null-seed-error.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer ${admin_token}" -H 'Idempotency-Key: 123e4567-e89b-42d3-a456-426614174100' --data-binary "@$test_root/null-seed-request.json" "http://127.0.0.1:${server_port}/api/admin/palette-candidates" >"$test_root/null-seed.status" || true
[[ "$(cat "$test_root/null-seed.status")" == "422" ]]
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.code!=='INVALID_INGESTION_REQUEST')process.exit(1)" "$test_root/null-seed-error.json"
[[ "$(db -Atqc 'SELECT COUNT(*) FROM palette_ingestion_records')" == "1" ]]

FIGCOLOR_ADMIN_TOKEN="$admin_token" "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$first_batch" --artifacts "$first_artifacts" --api-base-url "http://127.0.0.1:${server_port}" --resume --json >"$test_root/first-resume.json"
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].status!=='already_submitted')process.exit(1)" "$test_root/first-resume.json"
[[ "$(db -Atqc "SELECT COUNT(*) FROM palettes WHERE id='${first_palette_id}'")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_preview_cases WHERE palette_id='${first_palette_id}'")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_ingestion_records WHERE proposal_id='submission-first-batch/submission-first'")" == "1" ]]

loss_batch="$test_root/submission-loss-batch"
loss_artifacts="$test_root/loss-artifacts"
prepare_batch "$loss_batch" "$root_dir/contracts/palette-ingestion/v1/fixtures/valid/submission-loss/manifest.json" submission-loss "$loss_artifacts"
echo 'CLI HTTP E2E: response-loss and replay'
"$NODE_BIN" "$root_dir/scripts/palette-ingest/test/drop-response-proxy.mjs" "$proxy_port" "http://127.0.0.1:${server_port}" "$test_root/proxy.ready" &
proxy_pid="$!"
for _ in {1..100}; do [[ -f "$test_root/proxy.ready" ]] && break; sleep 0.05; done
[[ -f "$test_root/proxy.ready" ]]
if FIGCOLOR_ADMIN_TOKEN="$admin_token" "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$loss_batch" --artifacts "$loss_artifacts" --api-base-url "http://127.0.0.1:${proxy_port}" --json >"$test_root/lost-response.json"; then
  echo 'response-loss submission unexpectedly succeeded' >&2
  exit 1
fi
kill "$proxy_pid" 2>/dev/null || true
wait "$proxy_pid" 2>/dev/null || true
proxy_pid=""
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].status!=='submission_pending_or_unknown')process.exit(1)" "$test_root/lost-response.json"

loss_checkpoint="$loss_artifacts/submission-loss-batch/checkpoints/submission-loss.json"
loss_request="$loss_artifacts/submission-loss-batch/requests/submission-loss.json"
old_key="$($NODE_BIN -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1])).idempotency_key)" "$loss_checkpoint")"
loss_fingerprint="$($NODE_BIN --input-type=module -e "import fs from 'node:fs';import {canonicalHashJSON} from './scripts/palette-ingest/lib/jcs.mjs';const checkpoint=JSON.parse(fs.readFileSync(process.argv[1]));const request=fs.readFileSync(process.argv[2],'utf8');if(checkpoint.stage!=='submission_pending_or_unknown'||checkpoint.idempotency_key!==process.argv[3]||checkpoint.request_fingerprint!==canonicalHashJSON(request).hash)process.exit(1);process.stdout.write(checkpoint.request_fingerprint)" "$loss_checkpoint" "$loss_request" "$old_key")"
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_ingestion_records WHERE proposal_id='submission-loss-batch/submission-loss' AND idempotency_key='${old_key}' AND request_fingerprint='${loss_fingerprint}' AND processing_state='succeeded'")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palettes p JOIN palette_ingestion_records r ON r.palette_id=p.id WHERE r.proposal_id='submission-loss-batch/submission-loss'")" == "1" ]]

FIGCOLOR_ADMIN_TOKEN="$admin_token" "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$loss_batch" --artifacts "$loss_artifacts" --api-base-url "http://127.0.0.1:${server_port}" --resume --json >"$test_root/loss-resume.json"
loss_palette_id="$($NODE_BIN -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].outcome!=='replayed_or_recovered')process.exit(1);process.stdout.write(r.packages[0].receipt.palette_id)" "$test_root/loss-resume.json")"
loss_slug="$($NODE_BIN -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));process.stdout.write(r.packages[0].receipt.slug)" "$test_root/loss-resume.json")"
"$NODE_BIN" -e "const fs=require('fs'),checkpoint=JSON.parse(fs.readFileSync(process.argv[1])),result=JSON.parse(fs.readFileSync(process.argv[2])).packages[0];if(checkpoint.stage!=='submitted'||checkpoint.idempotency_key!==process.argv[3]||checkpoint.request_fingerprint!==process.argv[4]||result.receipt.request_fingerprint!==process.argv[4]||!checkpoint.receipt_path||!checkpoint.receipt_hash)process.exit(1)" "$loss_checkpoint" "$test_root/loss-resume.json" "$old_key" "$loss_fingerprint"
[[ "$(db -Atqc "SELECT COUNT(*) FROM palettes WHERE id='${loss_palette_id}'")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_preview_cases WHERE palette_id='${loss_palette_id}'")" == "1" ]]
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_ingestion_records WHERE proposal_id='submission-loss-batch/submission-loss' AND idempotency_key='${old_key}' AND request_fingerprint='${loss_fingerprint}' AND receipt->>'request_fingerprint'='${loss_fingerprint}'")" == "1" ]]

"$NODE_BIN" --input-type=module -e "import fs from 'node:fs';import {canonicalize} from './scripts/palette-ingest/lib/jcs.mjs';const p=process.argv[1],v=JSON.parse(fs.readFileSync(p));v.ingestion_metadata.validation_issues.push({path:'$.evidence',code:'REVIEW_EVIDENCE',message:'Changed evidence.',severity:'warning',source:'domain'});fs.writeFileSync(process.argv[2],canonicalize(v))" "$loss_request" "$test_root/changed-request.json"
"$CURL_BIN" --silent --fail-with-body -o "$test_root/payload-mismatch.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer ${admin_token}" -H "Idempotency-Key: ${old_key}" --data-binary "@$test_root/changed-request.json" "http://127.0.0.1:${server_port}/api/admin/palette-candidates" >"$test_root/payload-mismatch.status" || true
[[ "$(cat "$test_root/payload-mismatch.status")" == "409" ]]
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.code!=='IDEMPOTENCY_PAYLOAD_MISMATCH')process.exit(1)" "$test_root/payload-mismatch.json"
[[ "$(db -Atqc 'SELECT COUNT(*) FROM palettes')" == "2" ]]

auth_batch="$test_root/submission-auth-batch"
auth_artifacts="$test_root/auth-artifacts"
prepare_batch "$auth_batch" "$root_dir/contracts/palette-ingestion/v1/fixtures/valid/submission-loss/manifest.json" submission-loss "$auth_artifacts"
echo 'CLI HTTP E2E: authentication and visibility boundaries'
"$CURL_BIN" --silent --fail-with-body -H 'Content-Type: application/json' -d '{"email":"cli-user@figcolor.local","password":"userpass123"}' "http://127.0.0.1:${server_port}/api/auth/register" >"$test_root/user-auth.json"
user_token="$($NODE_BIN -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1])).token)" "$test_root/user-auth.json")"
if FIGCOLOR_ADMIN_TOKEN="$user_token" "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$auth_batch" --artifacts "$auth_artifacts" --api-base-url "http://127.0.0.1:${server_port}" --json >"$test_root/forbidden.json"; then exit 1; fi
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].status!=='authorization_failed')process.exit(1)" "$test_root/forbidden.json"
if FIGCOLOR_ADMIN_TOKEN='invalid-token' "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$auth_batch" --artifacts "$auth_artifacts" --api-base-url "http://127.0.0.1:${server_port}" --resume --json >"$test_root/unauthorized.json"; then exit 1; fi
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].status!=='authentication_failed')process.exit(1)" "$test_root/unauthorized.json"
expired_token="$($NODE_BIN -e "const fs=require('fs'),crypto=require('crypto');const token=JSON.parse(fs.readFileSync(process.argv[1])).token;const [header,payload]=token.split('.');const claims=JSON.parse(Buffer.from(payload,'base64url'));claims.exp=1;const body=header+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');process.stdout.write(body+'.'+crypto.createHmac('sha256','cli-http-test-secret').update(body).digest('base64url'))" "$test_root/admin-auth.json")"
if FIGCOLOR_ADMIN_TOKEN="$expired_token" "$NODE_BIN" "$root_dir/scripts/palette-ingest/cli.mjs" submit --batch "$auth_batch" --artifacts "$auth_artifacts" --api-base-url "http://127.0.0.1:${server_port}" --resume --json >"$test_root/expired.json"; then exit 1; fi
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));if(r.packages[0].status!=='authentication_failed')process.exit(1)" "$test_root/expired.json"
[[ "$(db -Atqc "SELECT COUNT(*) FROM palette_ingestion_records WHERE proposal_id='submission-auth-batch/submission-loss'")" == "0" ]]
"$NODE_BIN" -e "const fs=require('fs'),path=require('path');const root=process.argv[1],secrets=process.argv.slice(2);const roots=['first-artifacts','loss-artifacts','auth-artifacts'].map(name=>path.join(root,name));const outputs=['first-submit.json','first-resume.json','lost-response.json','loss-resume.json','forbidden.json','unauthorized.json','expired.json'];const files=[];const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);e.isDirectory()?walk(q):files.push(q)}};for(const value of roots)walk(value);for(const name of outputs)files.push(path.join(root,name));for(const file of files){const value=fs.readFileSync(file,'utf8');if(secrets.some(secret=>value.includes(secret)))process.exit(1)}" "$test_root" "$admin_token" "$user_token" "$expired_token"

"$CURL_BIN" --silent --fail -H "Authorization: Bearer ${admin_token}" "http://127.0.0.1:${server_port}/api/admin/palettes?status=candidate&page=1&page_size=100" >"$test_root/admin-candidates.json"
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));for(const id of process.argv.slice(2)){if(!r.palettes.some(p=>p.id===id&&p.status==='candidate'))process.exit(1)}" "$test_root/admin-candidates.json" "$first_palette_id" "$loss_palette_id"
[[ "$(db -Atqc "SELECT COUNT(*) FROM palettes WHERE id IN ('${first_palette_id}','${loss_palette_id}') AND status='candidate' AND visibility='public' AND owner_user_id IS NULL")" == "2" ]]
"$CURL_BIN" --silent --fail "http://127.0.0.1:${server_port}/api/palettes?page=1&page_size=100" >"$test_root/public-palettes.json"
"$NODE_BIN" -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));for(const id of process.argv.slice(2)){if(r.palettes.some(p=>p.id===id))process.exit(1)}" "$test_root/public-palettes.json" "$first_palette_id" "$loss_palette_id"
[[ "$("$CURL_BIN" --silent -o /dev/null -w '%{http_code}' "http://127.0.0.1:${server_port}/api/palettes/${first_slug}")" == "404" ]]
[[ "$("$CURL_BIN" --silent -o /dev/null -w '%{http_code}' "http://127.0.0.1:${server_port}/api/palettes/${loss_slug}")" == "404" ]]

[[ "$(db -Atqc 'SELECT COUNT(*) FROM palettes')" == "2" ]]
[[ "$(db -Atqc 'SELECT COUNT(*) FROM palette_preview_cases')" == "2" ]]
echo 'Node CLI -> authenticated HTTP -> PostgreSQL first-write/replay/visibility integration: PASS'
