import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  PREVIEW_VALIDATOR_ARTIFACT,
  buildPreviewValidatorArtifact
} from './palette-ingest/lib/preview-validator-artifact.mjs'

test('generated preview validator matches the authoritative TypeScript registry', async () => {
  const committed = fs.readFileSync(PREVIEW_VALIDATOR_ARTIFACT, 'utf8')
  assert.equal(await buildPreviewValidatorArtifact(), committed)
})
