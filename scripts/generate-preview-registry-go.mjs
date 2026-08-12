#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const target = path.join(root, 'backend/internal/paletteassistant/preview_registry_generated.go')

export function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`
  throw new Error('Preview registry projection contains a non-JSON value.')
}

export async function loadProjectionModule(code) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'figcolor-preview-registry-'))
  const temporary = path.join(temporaryDirectory, 'projection.mjs')
  try {
    fs.writeFileSync(temporary, code)
    const loaded = await import(pathToFileURL(temporary).href)
    if (typeof loaded.createPreviewRegistryProjection !== 'function') throw new Error('Bundled registry does not export structured projection authority.')
    return loaded.createPreviewRegistryProjection()
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }) }
}

export async function buildArtifact(projectionOverride) {
  let projection = projectionOverride
  if (projection === undefined) {
    const result = await build({ configFile: false, logLevel: 'silent', resolve: { alias: { '@': path.join(root, 'src') } }, build: { write: false, minify: false, lib: { entry: path.join(root, 'src/lib/chart-types/registry.ts'), formats: ['es'], fileName: () => 'registry.mjs' } } })
    const chunk = (Array.isArray(result) ? result : [result]).flatMap(entry => entry.output).find(entry => entry.type === 'chunk' && entry.isEntry)
    if (!chunk || chunk.type !== 'chunk') throw new Error('TypeScript registry bundle did not produce an entry chunk.')
    projection = await loadProjectionModule(chunk.code)
  }
  if (!projection || projection.projection_format_version !== 1 || !Array.isArray(projection.charts) || projection.charts.length !== 6) throw new Error('Preview registry projection is incomplete or unsupported.')
  const canonical = canonicalJSON(projection)
  const fingerprint = createHash('sha256').update(canonical).digest('hex')
  return `// Code generated from src/lib/chart-types/registry.ts structured authority. DO NOT EDIT.\n\npackage paletteassistant\n\nconst PreviewRegistryProjectionFormatVersion = 1\nconst PreviewRegistryFingerprint = "${fingerprint}"\nconst previewRegistryProjectionJSON = \`${canonical}\`\n`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(target, await buildArtifact(), 'utf8')
  console.log(target)
}
