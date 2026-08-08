import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const PREVIEW_VALIDATOR_ARTIFACT = path.join(
  repositoryRoot,
  'scripts/palette-ingest/generated/preview-registry-validation.mjs'
)

export async function buildPreviewValidatorArtifact() {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@': path.join(repositoryRoot, 'src') } },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(repositoryRoot, 'src/lib/chart-types/registry.ts'),
        formats: ['es'],
        fileName: () => 'preview-registry-validation.mjs'
      }
    }
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output)
  const chunk = outputs.find((entry) => entry.type === 'chunk' && entry.isEntry)
  if (!chunk || chunk.type !== 'chunk') throw new Error('Vite did not produce the preview registry validation entry chunk.')
  return `// Generated from src/lib/chart-types/registry.ts. Do not edit by hand.\n${chunk.code}`
}

export async function writePreviewValidatorArtifact() {
  const code = await buildPreviewValidatorArtifact()
  fs.mkdirSync(path.dirname(PREVIEW_VALIDATOR_ARTIFACT), { recursive: true })
  fs.writeFileSync(PREVIEW_VALIDATOR_ARTIFACT, code, 'utf8')
  return PREVIEW_VALIDATOR_ARTIFACT
}
