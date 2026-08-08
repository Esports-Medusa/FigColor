import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

import { CONTRACT_ROOT } from './constants.mjs'

const schemaFiles = {
  sourcePackage: 'source-package.schema.json',
  proposal: 'proposal.schema.json',
  ingestionRequest: 'ingestion-request.schema.json',
  receipt: 'receipt.schema.json',
  errorResponse: 'error-response.schema.json',
  validationReport: 'validation-report.schema.json',
  checkpoint: 'checkpoint.schema.json',
  batchState: 'batch-state.schema.json',
  catalogComparisonSnapshot: 'catalog-comparison-snapshot.schema.json',
  exactDuplicateIndex: 'exact-duplicate-index.schema.json',
  perceptualSimilarityIndex: 'perceptual-similarity-index.schema.json'
}

const ajv = new Ajv2020({ allErrors: true, strict: true, validateSchema: true })
const schemas = Object.fromEntries(Object.entries(schemaFiles).map(([name, filename]) => [name, JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, filename), 'utf8'))]))
for (const schema of Object.values(schemas)) ajv.addSchema(schema)
const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.getSchema(schema.$id)]))

export function validateContract(name, value) {
  const validator = validators[name]
  if (!validator) throw new Error(`Unknown ingestion contract: ${name}`)
  const valid = validator(value)
  return { valid: Boolean(valid), issues: valid ? [] : validator.errors.map(schemaErrorToIssue) }
}

export function assertSchemasValid() {
  for (const schema of Object.values(schemas)) {
    if (!ajv.validateSchema(schema)) throw new Error(`Invalid JSON Schema ${schema.$id}: ${ajv.errorsText()}`)
  }
  return true
}

function schemaErrorToIssue(error) {
  const pathValue = jsonPointerToPath(error.instancePath, error.keyword === 'required' ? error.params.missingProperty : error.keyword === 'additionalProperties' ? error.params.additionalProperty : null)
  const code = error.keyword === 'additionalProperties'
    ? 'UNKNOWN_FIELD'
    : error.keyword === 'required'
      ? 'REQUIRED_FIELD_MISSING'
      : 'SCHEMA_VALIDATION_FAILED'
  return {
    path: pathValue,
    code,
    message: error.message ?? 'JSON Schema validation failed.',
    severity: 'error',
    source: 'input'
  }
}

function jsonPointerToPath(pointer, property = null) {
  const segments = pointer.split('/').slice(1).map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  if (property !== null) segments.push(property)
  return segments.reduce((result, segment) => /^\d+$/.test(segment) ? `${result}[${segment}]` : `${result}.${segment}`, '$')
}
