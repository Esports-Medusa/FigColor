import { createServer } from 'vite'

const testModules = [
  '/src/lib/palette.preview-normalization.test.ts',
  '/src/lib/palette-cache-boundary.test.ts',
  '/src/lib/api/adminPreviewCases.test.ts',
  '/src/api/paletteAssistant.test.ts',
  '/src/views/admin/palette-assistant/workbench.test.ts',
  '/src/views/admin/palette-assistant/draftPreview.test.ts',
  '/src/lib/chart-types/previewDefaults.test.ts',
  '/src/views/admin/palette-assistant/draftPreviewRenderer.test.ts',
  '/src/lib/chart-types.registry.test.ts',
  '/src/lib/chart-types/structuredSchema.test.ts',
  '/src/lib/chart-types/bar-error/suggestion.test.ts',
  '/src/lib/chart-types/bar-error/admin.test.ts',
  '/src/lib/chart-types/bar-error/lifecycle.test.ts',
  '/src/lib/deterministic.test.ts',
  '/src/lib/exports/exports.test.ts',
  '/src/lib/phase1-final-verification.test.ts',
  '/src/lib/palette.resolve-colors.test.ts',
  '/src/lib/preview-vocabulary-consistency.test.ts',
  '/src/lib/renderers/dataRoles.test.ts',
  '/src/lib/renderers.test.ts',
  '/src/lib/scatter-violin.test.ts',
  '/src/components/palettes/PaletteChartPreview.test.ts',
  '/src/components/palettes/PalettePreviewIntegration.test.ts',
  '/src/components/project/FigureCreationFlow.test.ts',
  '/src/components/project/ProjectPalettePreview.test.ts',
  '/src/views/admin/palettes/AdminPalettesList.test.ts',
  '/src/views/admin/palettes/AdminCandidateReview.test.ts',
  '/src/views/admin/palettes/CandidatePublication.logic.test.ts',
  '/src/views/admin/palettes/CandidateRejection.logic.test.ts',
  '/src/views/admin/palettes/CandidateTransition.logic.test.ts',
  '/src/views/admin/palettes/AdminPreviewCaseEditor.test.ts',
  '/src/views/UnifiedPreviewEntryPoints.test.ts',
  '/src/views/palettesBrowseState.test.ts'
]

const server = await createServer({ logLevel: 'error' })

try {
  await server.pluginContainer.buildStart({})
  for (const testModule of testModules) {
    await server.ssrLoadModule(testModule)
    console.log(`ok ${testModule}`)
  }
} finally {
  await server.close()
}
