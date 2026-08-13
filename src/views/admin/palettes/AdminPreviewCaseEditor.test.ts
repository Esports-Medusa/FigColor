import { validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { resolveExplicitPreviewCaseExportModel, toCssCustomProperties, toJsonExport, toPythonDictionary, toRNamedVector } from '@/lib/exports'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'
import editorSource from './AdminPreviewCaseEditor.vue?raw'
import {
  addArrayItem,
  moveArrayItemBy,
  parseEditorObjectJson,
  removeArrayItemAt,
  resolveLifecycleActionAvailability,
  upsertOptionalVisualReference
} from './AdminPreviewCaseEditor.logic'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const palette: CanonicalPalette = {
  id: 'palette-1',
  slug: 'palette-one',
  name: 'Palette One',
  status: 'published',
  colors: [
    { id: 'blue-id', hex: '#2458A6', rgb: [36, 88, 166], label: 'Blue', order: 0 },
    { id: 'orange-id', hex: '#D55E00', rgb: [213, 94, 0], label: 'Orange', order: 1 },
    { id: 'green-id', hex: '#009E73', rgb: [0, 158, 115], label: 'Green', order: 2 }
  ],
  color_count: 3,
  type: 'categorical',
  chart_types: ['bar_error', 'line_multiseries', 'heatmap_annotated'],
  journal_style: [],
  disciplines: [],
  use_cases: [],
  avoid_cases: [],
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  primary_preview_case: null,
  preview_cases: []
}

function previewCase(overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return {
    id: 'preview-1',
    palette_id: palette.id,
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups: [
        { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'blue-id' } },
        { key: 'treated', label: 'Treated', fill: { source: 'palette', color_id: 'orange-id' } }
      ],
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'foreground' },
        error_bar: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      orientation: 'vertical',
      sample_size: 24,
      error_type: 'sem',
      data_pattern: 'mixed'
    },
    seed_strategy: 'stable_id',
    seed_value: null,
    is_primary: false,
    status: 'draft',
    ...overrides
  }
}

function linePreviewCase(overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return previewCase({
    chart_type: 'line_multiseries',
    template_id: 'line_multiseries_v1',
    color_roles: {
      series: [
        { key: 'baseline', label: 'Baseline', line: { source: 'palette', color_id: 'blue-id' } },
        { key: 'treated', label: 'Treated', line: { source: 'palette', color_id: 'orange-id' } }
      ],
      elements: { axis: { source: 'theme', token: 'foreground' } }
    },
    preview_config: {
      point_count: 8,
      curve_shape: 'mixed',
      x_axis_label: 'Time',
      y_axis_label: 'Response'
    },
    ...overrides
  })
}

function heatmapPreviewCase(overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return previewCase({
    chart_type: 'heatmap_annotated',
    template_id: 'heatmap_annotated_v1',
    color_roles: {
      scale: {
        type: 'sequential',
        stops: [
          { position: 0, label: 'Low', color: { source: 'palette', color_id: 'blue-id' } },
          { position: 1, label: 'High', color: { source: 'palette', color_id: 'orange-id' } }
        ]
      },
      annotations: [],
      elements: { text: { source: 'theme', token: 'foreground' } }
    },
    preview_config: {
      rows: 6,
      columns: 6,
      cluster_rows: false,
      cluster_columns: false,
      show_row_labels: true,
      show_column_labels: true,
      show_values: false,
      data_pattern: 'mixed'
    },
    ...overrides
  })
}

function testGroupAndSeriesEditing(): void {
  const groups = [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' }
  ]
  const addedGroup = addArrayItem(groups, { key: 'c', label: 'C' })
  expect(addedGroup.map((group) => group.key).join(',') === 'a,b,c', 'group add should append')
  expect(removeArrayItemAt(addedGroup, 1, 1).map((group) => group.key).join(',') === 'a,c', 'group remove should delete selected item')
  expect(moveArrayItemBy(addedGroup, 2, -1).map((group) => group.key).join(',') === 'a,c,b', 'group reorder should move selected item')

  const series = [{ key: 's1' }, { key: 's2' }]
  const addedSeries = addArrayItem(series, { key: 's3' })
  expect(addedSeries.map((item) => item.key).join(',') === 's1,s2,s3', 'series add should append')
  expect(removeArrayItemAt(addedSeries, 0, 1).map((item) => item.key).join(',') === 's2,s3', 'series remove should delete selected item')
  expect(moveArrayItemBy(addedSeries, 0, 1).map((item) => item.key).join(',') === 's2,s1,s3', 'series reorder should move selected item')
}

function testLineConfidenceBandAndMarkerEditing(): void {
  let series: Record<string, unknown> = { key: 's1', label: 'S1', line: { source: 'palette', color_id: 'blue-id' } }
  series = upsertOptionalVisualReference(series, 'confidence_band', 'palette:green-id')
  series = upsertOptionalVisualReference(series, 'marker', 'theme:background')
  const valid = validatePreviewCaseAgainstRegistry(linePreviewCase({ color_roles: { series: [series], elements: {} } }))
  expect(valid.valid, 'line confidence_band and marker should accept palette and approved theme references')

  series = upsertOptionalVisualReference(series, 'marker', '')
  expect(!('marker' in series), 'line marker editing should support omission')
}

function testHeatmapStopsAndAnnotations(): void {
  const heatmap = heatmapPreviewCase()
  const roles = heatmap.color_roles as Record<string, any>
  roles.scale.stops = removeArrayItemAt(roles.scale.stops, 1, 2)
  expect(roles.scale.stops.length === 2, 'heatmap stop removal should respect the UI minimum count')
  roles.scale.stops = roles.scale.stops.slice(0, 1)
  expect(!validatePreviewCaseAgainstRegistry(heatmap).valid, 'heatmap should reject fewer than the contract minimum stop count')
  roles.scale.stops = addArrayItem(roles.scale.stops, { position: 1, label: 'High', color: { source: 'palette', color_id: 'orange-id' } })
  roles.annotations = addArrayItem(roles.annotations, { key: 'batch', label: 'Batch', color: { source: 'palette', color_id: 'green-id' } })
  expect(validatePreviewCaseAgainstRegistry(heatmap).valid, 'heatmap stop add and annotation editing should produce a valid preview')
  roles.annotations = removeArrayItemAt(roles.annotations, 0, 0)
  expect(validatePreviewCaseAgainstRegistry(heatmap).valid, 'heatmap annotation removal should remain valid')
}

function testInvalidAdvancedJsonPreservesPreviousValidState(): void {
  const previous = { groups: [{ key: 'control' }] }
  const result = parseEditorObjectJson('{"groups":', previous)
  expect(result.value === previous, 'invalid Advanced JSON should preserve previous valid object')
  expect(result.error.length > 0, 'invalid Advanced JSON should report an error')
}

function testDuplicateKeyBlocksSaveAndPublish(): void {
  const duplicate = previewCase({
    color_roles: {
      ...(previewCase().color_roles as Record<string, unknown>),
      groups: [
        { key: 'dup', label: 'A', fill: { source: 'palette', color_id: 'blue-id' } },
        { key: 'dup', label: 'B', fill: { source: 'palette', color_id: 'orange-id' } }
      ]
    }
  })
  const validation = validatePreviewCaseAgainstRegistry(duplicate)
  const availability = resolveLifecycleActionAvailability(duplicate, !validation.valid)
  expect(!validation.valid, 'duplicate key should be invalid')
  expect(!availability.saveDraft && !availability.publish, 'duplicate key should block save and publish')
}

function testArchivedReadOnlyAndLifecycleAvailability(): void {
  const archived = previewCase({ status: 'archived' })
  const archivedActions = resolveLifecycleActionAvailability(archived, false)
  expect(archivedActions.readOnly, 'archived preview cases should be read-only')
  expect(!archivedActions.archive, 'archived preview cases should not be archivable again')
  expect(!archivedActions.deleteDraft, 'delete should remain draft-only')

  const draftActions = resolveLifecycleActionAvailability(previewCase(), false)
  expect(draftActions.saveDraft && draftActions.publish && draftActions.deleteDraft, 'draft should allow save publish and delete')
  expect(!draftActions.setPrimary, 'set-primary should not be available for draft')

  const publishedActions = resolveLifecycleActionAvailability(previewCase({ status: 'published', is_primary: false }), false)
  expect(publishedActions.setPrimary, 'set-primary should be available for non-primary published preview')
  expect(!publishedActions.deleteDraft && !publishedActions.publish, 'published preview should not allow delete or publish')
}

function testNarrowAdminLayoutKeepsPreviewOutOfLifecycleControls(): void {
  expect(editorSource.includes('grid-template-columns: minmax(0, 1fr);'), 'Preview Case editor should use one bounded column inside the Admin form')
  expect(editorSource.includes('.live-preview {\n  grid-row: 1;'), 'live preview should render above the lifecycle and structured fields')
  expect(editorSource.includes('max-width: 100%;') && editorSource.includes('overflow: hidden;'), 'live preview must not overflow across lifecycle controls')
}

function testCurrentDraftRolesChangeRuntimeExport(): void {
  const draft = previewCase({
    status: 'draft',
    is_primary: false,
    color_roles: {
      ...(previewCase().color_roles as Record<string, unknown>),
      groups: [
        { key: 'draft_green', label: 'Draft Green', fill: { source: 'palette', color_id: 'green-id' } },
        { key: 'draft_blue', label: 'Draft Blue', fill: { source: 'palette', color_id: 'blue-id' } }
      ]
    }
  })
  const model = resolveExplicitPreviewCaseExportModel(palette, draft)
  expect(model.source !== 'palette_order_fallback', 'draft export should not fall back to palette order')
  expect(model.colors.map((color) => color.colorId).join(',') === 'green-id,blue-id', 'draft export should follow preview-case role order')
  expect(toJsonExport(model).includes('"draft_green"'), 'JSON should reflect current draft role')
  expect(toPythonDictionary(model).includes('"draft_green": "#009E73"'), 'Python should reflect current draft role')
  expect(toRNamedVector(model).includes('draft_green = "#009E73"'), 'R should reflect current draft role')
  expect(toCssCustomProperties(model).includes('--figcolor-draft_green: #009E73;'), 'CSS should reflect current draft role')
}

testGroupAndSeriesEditing()
testLineConfidenceBandAndMarkerEditing()
testHeatmapStopsAndAnnotations()
testInvalidAdvancedJsonPreservesPreviousValidState()
testDuplicateKeyBlocksSaveAndPublish()
testArchivedReadOnlyAndLifecycleAvailability()
testNarrowAdminLayoutKeepsPreviewOutOfLifecycleControls()
testCurrentDraftRolesChangeRuntimeExport()
