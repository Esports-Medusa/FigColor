import projectDetail from '@/views/ProjectDetailView.vue?raw'
import adminForm from '@/views/admin/palettes/AdminPaletteForm.vue?raw'
import adminEditor from '@/views/admin/palettes/AdminPreviewCaseEditor.vue?raw'
import registry from '@/lib/chart-types/registry.ts?raw'
import projectPreviewLogic from '@/components/project/ProjectPalettePreview.logic.ts?raw'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function testProjectsUseAuthenticatedBasePalettePreview(): void {
  expect(projectDetail.includes('<PaletteChartPreview'), 'project palette cards should use the shared preview component')
  expect(
    projectPreviewLogic.includes('palette.previewPalette?.id === palette.basePaletteId'),
    'project previews should distinguish the relationship id from the underlying base palette id'
  )
  expect(
    projectPreviewLogic.includes('normalizePaletteToCanonical(palette.previewPalette)'),
    'project previews should normalize the authenticated base-palette payload'
  )
  expect(!projectDetail.includes('renderPalettePreview('), 'project pages should not contain a page-specific renderer')
}

function testAdminDraftReviewUsesEveryRegisteredChartType(): void {
  for (const chartType of [
    'bar_error',
    'boxplot_jitter',
    'line_multiseries',
    'heatmap_annotated',
    'scatter_grouped',
    'violin_distribution'
  ]) {
    expect(registry.includes(`chartType: '${chartType}'`), `${chartType} should be registered`)
    expect(adminEditor.includes(`chartType: '${chartType}'`), `${chartType} should be editable in admin review`)
  }
  expect(
    adminEditor.includes(':public-only="false"'),
    'admin review should explicitly retain draft rendering'
  )
  expect(
    adminEditor.includes('<PreviewValidationIssues :issues="allIssues" />'),
    'admin review should keep actionable validation issues visible'
  )
}

function testPaletteAddUsesUnsavedCanonicalInputAndRegistryOptions(): void {
  expect(
    adminForm.includes('CHART_TYPE_DEFINITIONS.map'),
    'palette add chart type options should come from the shared registry'
  )
  expect(
    adminForm.includes(':local-only="!isEditing"'),
    'palette add should render an unsaved local preview without premature persistence'
  )
  expect(
    adminForm.includes(':palette="canonicalPaletteForPreview"'),
    'palette add should convert form data to the canonical shared preview input'
  )
}

testProjectsUseAuthenticatedBasePalettePreview()
testAdminDraftReviewUsesEveryRegisteredChartType()
testPaletteAddUsesUnsavedCanonicalInputAndRegistryOptions()
