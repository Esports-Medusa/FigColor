#!/usr/bin/env node
import process from 'node:process'
import { runBatch } from './lib/pipeline.mjs'
import { submitBatch } from './lib/submission.mjs'

const [command, ...argv] = process.argv.slice(2)
const supported = new Set(['scan', 'prepare', 'validate', 'status', 'submit'])

if (!supported.has(command)) {
  usage()
  process.exitCode = 2
} else {
  try {
    const options = parseOptions(argv)
    if (!options.batch) throw new Error('--batch is required')
    const result = command === 'submit' ? await submitBatch(options) : runBatch(command, options)
    if (options.json) console.log(JSON.stringify(result))
    else printSummary(command, result)
    const failed = command === 'submit'
      ? result.packages.some((entry) => !['submitted', 'already_submitted', 'dry_run'].includes(entry.status))
      : (result.counts.validation_failed ?? 0) > 0
    process.exitCode = failed ? 1 : 0
  } catch (error) {
    console.error(`palette-ingest: ${error.message}`)
    process.exitCode = 2
  }
}

function parseOptions(args) {
  const options = { dryRun: false, resume: false, failFast: false, json: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--batch') options.batch = args[++index]
    else if (arg === '--artifacts') options.artifacts = args[++index]
    else if (arg === '--api-base-url') options.apiBaseUrl = args[++index]
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--resume') options.resume = true
    else if (arg === '--fail-fast') options.failFast = true
    else if (arg === '--json') options.json = true
    else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

function printSummary(commandName, result) {
  const counts = Object.entries(result.counts).map(([status, count]) => `${status}=${count}`).join(' ')
  console.log(`${commandName}: batch=${result.batch_id} ${counts || 'packages=0'}`)
  for (const item of result.packages) {
    console.log(`- ${item.source_key}: ${item.status}${item.resumed ? ' (resumed)' : ''}`)
    for (const problem of item.issues ?? []) console.log(`  ${problem.code} ${problem.path}: ${problem.message}`)
  }
}

function usage() {
  console.error('Usage: node scripts/palette-ingest/cli.mjs <scan|prepare|validate|status|submit> --batch <path> [--artifacts <path>] [--api-base-url <url>] [--dry-run] [--resume] [--fail-fast] [--json]')
}
