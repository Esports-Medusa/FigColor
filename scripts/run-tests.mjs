import { createServer } from 'vite'

const testModules = [
  '/src/lib/palette.preview-normalization.test.ts',
  '/src/lib/api/adminPreviewCases.test.ts',
  '/src/lib/chart-types.registry.test.ts',
  '/src/lib/chart-types/bar-error/suggestion.test.ts',
  '/src/lib/chart-types/bar-error/admin.test.ts',
  '/src/lib/chart-types/bar-error/lifecycle.test.ts',
  '/src/lib/deterministic.test.ts',
  '/src/lib/exports/exports.test.ts',
  '/src/lib/palette.resolve-colors.test.ts',
  '/src/lib/renderers.test.ts',
  '/src/components/palettes/PaletteChartPreview.test.ts',
  '/src/components/palettes/PalettePreviewIntegration.test.ts'
]

const server = await createServer({ logLevel: 'error' })

try {
  for (const testModule of testModules) {
    await server.ssrLoadModule(testModule)
    console.log(`ok ${testModule}`)
  }
} finally {
  await server.close()
}
