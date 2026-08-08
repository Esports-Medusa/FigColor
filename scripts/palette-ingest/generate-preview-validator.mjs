#!/usr/bin/env node
import { writePreviewValidatorArtifact } from './lib/preview-validator-artifact.mjs'

const outputPath = await writePreviewValidatorArtifact()
console.log(outputPath)
