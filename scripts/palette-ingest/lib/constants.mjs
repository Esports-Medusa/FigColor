import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA_VERSION = 1
export const PIPELINE_VERSION = 'palette-ingest-wp5-reporting.1'
export const MAX_MANIFEST_BYTES = 64 * 1024
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
export const ALLOWED_REFERENCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
export const REPOSITORY_ROOT = path.resolve(moduleDir, '../../..')
export const CONTRACT_ROOT = path.join(REPOSITORY_ROOT, 'contracts/palette-ingestion/v1')
export const DEFAULT_ARTIFACT_ROOT = path.join(REPOSITORY_ROOT, 'artifacts/palette-ingestion')

export function loadVocabularies() {
  return JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, 'controlled-vocabularies.json'), 'utf8'))
}
