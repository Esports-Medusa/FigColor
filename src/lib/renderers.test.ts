import { barErrorRenderer } from '@/lib/renderers/bar-error/renderer'
import { boxplotJitterRenderer } from '@/lib/renderers/boxplot-jitter/renderer'
import { heatmapAnnotatedRenderer } from '@/lib/renderers/heatmap-annotated/renderer'
import { lineMultiseriesRenderer } from '@/lib/renderers/line-multiseries/renderer'
import { renderPalettePreview } from '@/lib/renderers/renderPreview'
import { registerPreviewRenderers } from '@/lib/renderers/registry'
import type { ChartRenderer } from '@/lib/renderers/types'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

const requiredBarElementRoleKeys = ['axis', 'grid', 'text', 'error_bar', 'background'] as const
const optionalHeatmapElementRoleKeys = [
  'text',
  'grid',
  'border',
  'background',
  'annotation_text'
] as const

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const palette: CanonicalPalette = {
  id: 'palette-1',
  slug: 'escape-lab',
  name: 'Escape Lab',
  status: 'published',
  colors: [
    { id: 'color-1', hex: '#2458A6', rgb: [36, 88, 166], order: 0 },
    { id: 'color-2', hex: '#D55E00', rgb: [213, 94, 0], order: 1 },
    { id: 'color-3', hex: '#009E73', rgb: [0, 158, 115], order: 2 },
    { id: 'color-4', hex: '#CC79A7', rgb: [204, 121, 167], order: 3 },
    { id: 'color-5', hex: '#E69F00', rgb: [230, 159, 0], order: 4 }
  ],
  color_count: 5,
  type: 'categorical',
  chart_types: ['bar_error'],
  journal_style: ['general'],
  disciplines: [],
  use_cases: [],
  avoid_cases: [],
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  primary_preview_case: null,
  preview_cases: []
}

function barPreviewCase(
  overrides: Partial<PalettePreviewCase> = {},
  groupCount = 3
): PalettePreviewCase {
  const groups = [
    { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'color-1' } },
    { key: 'low', label: 'Low <Dose> & "A"', fill: { source: 'palette', color_id: 'color-2' } },
    { key: 'high', label: "High 'Dose'", fill: { source: 'palette', color_id: 'color-3' } },
    { key: 'rescue', label: 'Rescue', fill: { source: 'palette', color_id: 'color-4' } },
    { key: 'washout', label: 'Washout', fill: { source: 'palette', color_id: 'color-5' } }
  ].slice(0, groupCount)

  return {
    id: 'preview-1',
    palette_id: 'palette-1',
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups,
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' },
        error_bar: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      orientation: 'vertical',
      sample_size: 24,
      error_type: 'sem',
      data_pattern: 'treatment_higher'
    },
    seed_strategy: 'stable_id',
    seed_value: null,
    is_primary: true,
    status: 'published',
    ...overrides
  }
}

function clonePreviewCase(previewCase: PalettePreviewCase): PalettePreviewCase {
  return JSON.parse(JSON.stringify(previewCase)) as PalettePreviewCase
}

function boxplotPreviewCase(
  overrides: Partial<PalettePreviewCase> = {},
  groupCount = 3
): PalettePreviewCase {
  const groups = [
    { key: 'control', label: 'Control', color: { source: 'palette', color_id: 'color-1' } },
    { key: 'low', label: 'Low <Dose> & "A"', color: { source: 'palette', color_id: 'color-2' } },
    { key: 'high', label: "High 'Dose'", color: { source: 'palette', color_id: 'color-3' } },
    { key: 'rescue', label: 'Rescue', color: { source: 'palette', color_id: 'color-4' } },
    { key: 'washout', label: 'Washout', color: { source: 'palette', color_id: 'color-5' } }
  ].slice(0, groupCount)

  return {
    ...barPreviewCase(),
    id: 'boxplot-preview-1',
    chart_type: 'boxplot_jitter',
    template_id: 'boxplot_jitter_v1',
    color_roles: {
      groups,
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' },
        box_stroke: { source: 'theme', token: 'foreground' },
        median: { source: 'theme', token: 'foreground' },
        whisker: { source: 'theme', token: 'foreground' },
        jitter: { source: 'theme', token: 'muted_foreground' },
        outlier: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      jitter_density: 'medium',
      show_outliers: true
    },
    ...overrides
  }
}

function linePreviewCase(
  overrides: Partial<PalettePreviewCase> = {},
  seriesCount = 3
): PalettePreviewCase {
  const series = [
    { key: 'baseline', label: 'Baseline', line: { source: 'palette', color_id: 'color-1' } },
    { key: 'low', label: 'Low <Dose> & "A"', line: { source: 'palette', color_id: 'color-2' } },
    { key: 'high', label: "High 'Dose'", line: { source: 'palette', color_id: 'color-3' } },
    { key: 'rescue', label: 'Rescue', line: { source: 'palette', color_id: 'color-4' } },
    { key: 'washout', label: 'Washout', line: { source: 'palette', color_id: 'color-5' } }
  ].slice(0, seriesCount)

  return {
    ...barPreviewCase(),
    id: 'line-preview-1',
    chart_type: 'line_multiseries',
    template_id: 'line_multiseries_v1',
    color_roles: {
      series,
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' },
        marker_stroke: { source: 'theme', token: 'background' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      point_count: 8,
      curve_shape: 'increasing'
    },
    ...overrides
  }
}

function heatmapPreviewCase(overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return {
    ...barPreviewCase(),
    id: 'heatmap-preview-1',
    chart_type: 'heatmap_annotated',
    template_id: 'heatmap_annotated_v1',
    color_roles: {
      scale: {
        type: 'sequential',
        stops: [
          { position: 0, color: { source: 'palette', color_id: 'color-1' } },
          { position: 1, color: { source: 'palette', color_id: 'color-2' } }
        ]
      },
      elements: {
        text: { source: 'theme', token: 'muted_foreground' },
        grid: { source: 'theme', token: 'grid' },
        border: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' },
        annotation_text: { source: 'theme', token: 'foreground' }
      }
    },
    preview_config: {
      rows: 6,
      columns: 6,
      cluster_rows: false,
      cluster_columns: false,
      show_row_labels: true,
      show_column_labels: true,
      show_values: true,
      data_pattern: 'gradient'
    },
    ...overrides
  }
}

function testValidBarErrorRendersSvg(): void {
  const result = renderPalettePreview(palette, barPreviewCase())
  expect(result.ok, `valid bar_error preview should render: ${JSON.stringify(result)}`)
  if (result.ok) {
    expect(result.kind === 'svg', 'bar_error should render svg')
    expect(result.width === 360 && result.height === 220, 'bar_error should use fixed dimensions')
    expect(result.markup.includes('<svg'), 'svg markup should include an svg root')
    expect(result.markup.includes('#2458A6'), 'svg should use resolved palette colors')
  }
}

function testDeterminismAndSeedChanges(): void {
  const first = renderPalettePreview(palette, barPreviewCase())
  const second = renderPalettePreview(palette, barPreviewCase())
  const changed = renderPalettePreview(palette, barPreviewCase({ id: 'preview-2' }))

  expect(first.ok && second.ok && first.markup === second.markup, 'same input should produce identical markup')
  expect(first.ok && changed.ok && first.markup !== changed.markup, 'different stable seed should change generated values')
}

function testFixedSeedIsHonored(): void {
  const first = renderPalettePreview(palette, barPreviewCase({ id: 'preview-fixed-1', seed_strategy: 'fixed', seed_value: 77 }))
  const second = renderPalettePreview(palette, barPreviewCase({ id: 'preview-fixed-2', seed_strategy: 'fixed', seed_value: 77 }))

  expect(first.ok && second.ok && first.markup === second.markup, 'fixed seed should override stable identifiers')
}

function testValidationAndColorFailuresStopBeforeRenderer(): void {
  const throwingRenderer: ChartRenderer = {
    ...barErrorRenderer,
    render() {
      throw new Error('renderer should not be called')
    }
  }

  const invalidRegistry = renderPalettePreview(
    palette,
    barPreviewCase({ template_version: 2 }),
    { renderers: [throwingRenderer] }
  )
  expect(!invalidRegistry.ok && invalidRegistry.kind === 'invalid', 'registry validation failure should return invalid')
  expect(!invalidRegistry.ok && !!invalidRegistry.issues?.some((issue) => issue.code === 'UNSUPPORTED_TEMPLATE_VERSION'), 'registry validation issues should be preserved')

  const invalidColor = renderPalettePreview(
    palette,
    barPreviewCase({
      color_roles: {
        groups: [
          { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'missing' } },
          { key: 'low', label: 'Low', fill: { source: 'palette', color_id: 'color-2' } },
          { key: 'high', label: 'High', fill: { source: 'palette', color_id: 'color-3' } }
        ],
        elements: {
          axis: { source: 'theme', token: 'foreground' },
          grid: { source: 'theme', token: 'grid' },
          text: { source: 'theme', token: 'muted_foreground' },
          error_bar: { source: 'theme', token: 'foreground' },
          background: { source: 'theme', token: 'background' }
        }
      }
    }),
    { renderers: [throwingRenderer] }
  )
  expect(!invalidColor.ok && invalidColor.code === 'COLOR_RESOLUTION_FAILED', 'color resolution failure should return invalid before rendering')
  expect(!invalidColor.ok && !!invalidColor.issues?.some((issue) => issue.code === 'COLOR_NOT_FOUND'), 'color resolution issues should be preserved')
}

function testMissingBarElementRolesFailValidation(): void {
  requiredBarElementRoleKeys.forEach((roleKey) => {
    const previewCase = clonePreviewCase(barPreviewCase())
    const colorRoles = previewCase.color_roles as {
      elements: Record<typeof requiredBarElementRoleKeys[number], unknown>
    }
    delete colorRoles.elements[roleKey]

    const result = renderPalettePreview(palette, previewCase)
    expect(!result.ok && result.kind === 'invalid', `missing ${roleKey} should return invalid`)
    expect(!result.ok && result.code === 'PREVIEW_CASE_INVALID', `missing ${roleKey} should fail template validation`)
    expect(!result.ok && !!result.issues?.some((issue) => issue.path === `color_roles.elements.${roleKey}`), `missing ${roleKey} should preserve role issue`)
  })
}

function testInvalidBarElementRolesFailValidation(): void {
  requiredBarElementRoleKeys.forEach((roleKey) => {
    const previewCase = clonePreviewCase(barPreviewCase())
    const colorRoles = previewCase.color_roles as {
      elements: Record<typeof requiredBarElementRoleKeys[number], unknown>
    }
    colorRoles.elements[roleKey] = {}

    const result = renderPalettePreview(palette, previewCase)
    expect(!result.ok && result.kind === 'invalid', `invalid ${roleKey} should return invalid`)
    expect(!result.ok && result.code === 'PREVIEW_CASE_INVALID', `invalid ${roleKey} should fail template validation`)
    expect(!result.ok && !!result.issues?.some((issue) => issue.path === `color_roles.elements.${roleKey}`), `invalid ${roleKey} should preserve role issue`)
  })
}

function testRendererUsesRequiredThemeColorsWithoutFallback(): void {
  const result = renderPalettePreview(palette, barPreviewCase(), {
    themeTokens: {
      foreground: '#010203',
      muted_foreground: '#040506',
      grid: '#070809',
      background: '#0A0B0C'
    }
  })

  expect(result.ok, 'complete bar preview should render with custom theme tokens')
  if (!result.ok) {
    return
  }

  expect(result.markup.includes('#010203'), 'axis and error bar should use resolved foreground token')
  expect(result.markup.includes('#040506'), 'text should use resolved muted foreground token')
  expect(result.markup.includes('#070809'), 'grid should use resolved grid token')
  expect(result.markup.includes('#0A0B0C'), 'background should use resolved background token')
  expect(!barErrorRenderer.render.toString().includes('#111827'), 'renderer should not contain old hardcoded axis fallback')
  expect(!barErrorRenderer.render.toString().includes('#D1D5DB'), 'renderer should not contain old hardcoded grid fallback')
  expect(!barErrorRenderer.render.toString().includes('#374151'), 'renderer should not contain old hardcoded text fallback')
  expect(!barErrorRenderer.render.toString().includes('#FFFFFF'), 'renderer should not contain old hardcoded background fallback')
}

function testValidBoxplotJitterRendersSvg(): void {
  const result = renderPalettePreview(palette, boxplotPreviewCase())
  expect(result.ok, `valid boxplot_jitter preview should render: ${JSON.stringify(result)}`)
  if (result.ok) {
    expect(result.kind === 'svg', 'boxplot_jitter should render svg')
    expect(result.width === 360 && result.height === 220, 'boxplot_jitter should use fixed dimensions')
    expect(result.markup.includes('<svg'), 'boxplot svg markup should include an svg root')
    expect(result.markup.includes('class="boxplot-group"'), 'boxplot svg should render groups')
    expect(result.markup.includes('#2458A6'), 'boxplot should use resolved group fill colors')
  }
}

function testBoxplotDeterminismAndSeedChanges(): void {
  const first = renderPalettePreview(palette, boxplotPreviewCase())
  const second = renderPalettePreview(palette, boxplotPreviewCase())
  const changed = renderPalettePreview(palette, boxplotPreviewCase({ id: 'boxplot-preview-2' }))

  expect(first.ok && second.ok && first.markup === second.markup, 'same boxplot input should produce identical markup')
  expect(first.ok && changed.ok && first.markup !== changed.markup, 'different boxplot seed should change generated values')
}

function testBoxplotDensityAffectsPointCount(): void {
  const low = renderPalettePreview(palette, boxplotPreviewCase({
    preview_config: { jitter_density: 'low', show_outliers: true }
  }))
  const medium = renderPalettePreview(palette, boxplotPreviewCase({
    preview_config: { jitter_density: 'medium', show_outliers: true }
  }))
  const high = renderPalettePreview(palette, boxplotPreviewCase({
    preview_config: { jitter_density: 'high', show_outliers: true }
  }))

  expect(low.ok && medium.ok && high.ok, 'all boxplot densities should render')
  if (low.ok && medium.ok && high.ok) {
    const lowCount = countOccurrences(low.markup, 'class="jitter-point"')
    const mediumCount = countOccurrences(medium.markup, 'class="jitter-point"')
    const highCount = countOccurrences(high.markup, 'class="jitter-point"')
    expect(lowCount < mediumCount && mediumCount < highCount, 'jitter density should increase rendered point count')
  }
}

function testBoxplotOutlierVisibility(): void {
  const hidden = renderPalettePreview(palette, boxplotPreviewCase({
    preview_config: { jitter_density: 'medium', show_outliers: false }
  }))
  const visible = renderPalettePreview(palette, boxplotPreviewCase({
    preview_config: { jitter_density: 'medium', show_outliers: true }
  }))

  expect(hidden.ok && visible.ok, 'boxplot outlier visibility cases should render')
  if (hidden.ok && visible.ok) {
    expect(!hidden.markup.includes('class="outlier-point"'), 'show_outliers=false should hide outlier markers')
    expect(!visible.markup.includes('class="outlier-point"'), 'reference mock data should not invent statistical outliers')
    expect(countOccurrences(visible.markup, 'class="jitter-point"') === 36, 'reference mock data should show all 12 observations in each group')
  }
}

function testBoxplotQuartilesAndWhiskers(): void {
  const result = renderPalettePreview(palette, boxplotPreviewCase())
  expect(result.ok, 'boxplot should render for quartile assertions')
  if (!result.ok) {
    return
  }

  const stats = extractBoxplotStats(result.markup)
  expect(stats.length === 3, 'default boxplot should expose stats for 3 groups')
  stats.forEach((stat) => {
    expect(stat.q1 <= stat.median && stat.median <= stat.q3, 'boxplot quartiles should be ordered')
    expect(stat.lowerWhisker <= stat.q1, 'lower whisker should not exceed q1')
    expect(stat.upperWhisker >= stat.q3, 'upper whisker should not be below q3')
    expect(stat.lowerWhisker >= 0 && stat.upperWhisker <= 140, 'whiskers should stay within rendered data range')
  })
}

function testBoxplotGroupCountBounds(): void {
  const one = renderPalettePreview(palette, boxplotPreviewCase({}, 1))
  const two = renderPalettePreview(palette, boxplotPreviewCase({}, 2))
  const three = renderPalettePreview(palette, boxplotPreviewCase({}, 3))
  const five = renderPalettePreview(palette, boxplotPreviewCase({}, 5))
  const none = renderPalettePreview(palette, boxplotPreviewCase({
    color_roles: {
      ...(boxplotPreviewCase().color_roles as Record<string, unknown>),
      groups: []
    }
  }, 0))

  expect(one.ok && countOccurrences(one.markup, 'class="boxplot-group"') === 1, '1 group should render')
  expect(two.ok && countOccurrences(two.markup, 'class="boxplot-group"') === 2, '2 groups should render')
  expect(three.ok && countOccurrences(three.markup, 'class="boxplot-group"') === 3, '3 groups should render')
  expect(five.ok && countOccurrences(five.markup, 'class="boxplot-group"') === 5, '5 groups should render')
  expect(!none.ok && none.code === 'PREVIEW_CASE_INVALID', 'empty groups should fail validation')
}

function testBoxplotMissingGroupColorFailsValidation(): void {
  const previewCase = clonePreviewCase(boxplotPreviewCase())
  const colorRoles = previewCase.color_roles as { groups: Array<{ color: unknown }> }
  colorRoles.groups[0].color = {}

  const result = renderPalettePreview(palette, previewCase)
  expect(!result.ok && result.code === 'PREVIEW_CASE_INVALID', 'missing boxplot group color_id should fail template validation')
  expect(!result.ok && !!result.issues?.some((issue) => issue.path === 'color_roles.groups[0].color'), 'missing boxplot group color should name path')
}

function testBoxplotOptionalElementsAndConfig(): void {
  const previewCase = clonePreviewCase(boxplotPreviewCase({
    preview_config: {
      jitter_density: 'medium',
      show_outliers: true,
      // Legacy payloads may still contain this key, but boxplot rendering must ignore it.
      show_violin: true,
      y_axis_label: 'Response <units>'
    }
  }))
  const colorRoles = previewCase.color_roles as { elements?: unknown }
  delete colorRoles.elements

  const result = renderPalettePreview(palette, previewCase)
  expect(result.ok, `boxplot optional elements may be omitted: ${JSON.stringify(result)}`)
  if (result.ok) {
    expect(!result.markup.includes('violin-density'), 'legacy show_violin must not add a density silhouette')
    expect(result.markup.includes('Response &lt;units&gt;'), 'y_axis_label should render escaped label')
  }
}

function testBoxplotDuplicateKeysAndOpacityValidation(): void {
  const duplicate = renderPalettePreview(palette, boxplotPreviewCase({
    color_roles: {
      ...(boxplotPreviewCase().color_roles as Record<string, unknown>),
      groups: [
        { key: 'dup', label: 'Duplicate A', color: { source: 'palette', color_id: 'color-1' } },
        { key: 'dup', label: 'Duplicate B', color: { source: 'palette', color_id: 'color-2' } }
      ]
    }
  }))
  const invalidOpacity = renderPalettePreview(palette, boxplotPreviewCase({
    color_roles: {
      ...(boxplotPreviewCase().color_roles as Record<string, unknown>),
      groups: [
        { key: 'control', label: 'Control', color: { source: 'palette', color_id: 'color-1', opacity: 1.2 } }
      ]
    }
  }, 1))

  expect(!duplicate.ok && duplicate.code === 'PREVIEW_CASE_INVALID', 'duplicate boxplot group keys should fail validation')
  expect(!duplicate.ok && !!duplicate.issues?.some((issue) => issue.path === 'color_roles.groups[1].key'), 'duplicate boxplot key path should be preserved')
  expect(!invalidOpacity.ok && invalidOpacity.code === 'PREVIEW_CASE_INVALID', 'invalid boxplot opacity should fail validation')
  expect(!invalidOpacity.ok && !!invalidOpacity.issues?.some((issue) => issue.path === 'color_roles.groups[0].color.opacity'), 'invalid boxplot opacity path should be preserved')
}

function testBoxplotUsesRequiredThemeColorsWithoutFallback(): void {
  const result = renderPalettePreview(palette, boxplotPreviewCase(), {
    themeTokens: {
      foreground: '#010203',
      muted_foreground: '#040506',
      grid: '#070809',
      background: '#0A0B0C'
    }
  })

  expect(result.ok, 'complete boxplot preview should render with custom theme tokens')
  if (!result.ok) {
    return
  }

  expect(result.markup.includes('#010203'), 'box stroke, median, whisker, outlier, and axis should use resolved foreground token')
  expect(result.markup.includes('#040506'), 'boxplot text and jitter should use resolved muted foreground token')
  expect(result.markup.includes('#0A0B0C'), 'boxplot background should use resolved background token')
}

function testBoxplotSvgQualityAndEscaping(): void {
  const result = renderPalettePreview(palette, boxplotPreviewCase())
  expect(result.ok, 'boxplot should render for SVG quality assertions')
  if (!result.ok) {
    return
  }

  expect(!result.markup.includes('NaN'), 'boxplot svg should not contain NaN')
  expect(!result.markup.includes('undefined'), 'boxplot svg should not contain undefined')
  expect(!result.markup.includes('[object Object]'), 'boxplot svg should not contain object stringification')
  expect(result.markup.includes('Low &lt;Dose&gt; &amp; &quot;A&quot;'), 'boxplot text should escape special characters')
  expect(result.markup.includes('High &#39;Dose&#39;'), 'boxplot text should escape apostrophes')
  expect(result.markup.includes('class="significance-comparison"'), 'boxplot should show planned pairwise comparisons')
  expect(result.markup.includes('font-style="italic">n = 12'), 'boxplot should show sample counts')
  expect(result.markup.includes('fill-opacity="0.12"'), 'boxplot boxes should use subtle palette-tinted fills')
  expect(result.markup.includes('stroke-width="0.65" opacity="0.92"'), 'raw observations should use white-edged markers')
  expect(!result.markup.includes('<ellipse'), 'boxplot SVG must not contain ellipses')
  expect(!result.markup.includes('violin'), 'boxplot SVG must not contain violin elements')
  expect(!result.markup.includes('density'), 'boxplot SVG must not contain density elements')
}

function testBoxplotFiveColorPaletteUsesFiveGroups(): void {
  const result = renderPalettePreview(palette, boxplotPreviewCase({}, 5))
  expect(result.ok, 'five-color boxplot preview should render')
  if (!result.ok) {
    return
  }

  expect(countOccurrences(result.markup, 'class="boxplot-group"') === 5, 'five palette colors should render five boxplot groups')
  palette.colors.forEach((color) => {
    expect(result.markup.includes(color.hex), `boxplot should use palette color ${color.hex}`)
  })
}

function testBoxplotRendererDoesNotMutateInputs(): void {
  const previewCase = boxplotPreviewCase()
  const paletteBefore = JSON.stringify(palette)
  const previewBefore = JSON.stringify(previewCase)

  renderPalettePreview(palette, previewCase)

  expect(JSON.stringify(palette) === paletteBefore, 'boxplot render pipeline should not mutate palette')
  expect(JSON.stringify(previewCase) === previewBefore, 'boxplot render pipeline should not mutate preview case')
}

function testValidLineMultiseriesRendersSvg(): void {
  const result = renderPalettePreview(palette, linePreviewCase())
  expect(result.ok, `valid line_multiseries preview should render: ${JSON.stringify(result)}`)
  if (result.ok) {
    expect(result.kind === 'svg', 'line_multiseries should render svg')
    expect(result.width === 360 && result.height === 220, 'line_multiseries should use fixed dimensions')
    expect(result.markup.includes('<svg'), 'line svg markup should include an svg root')
    expect(result.markup.includes('class="line-series"'), 'line svg should render series')
    expect(result.markup.includes('<path'), 'line svg should render path elements')
    expect(result.markup.includes('#2458A6'), 'line should use resolved series colors')
  }
}

function testLineDeterminismAndSeeds(): void {
  const first = renderPalettePreview(palette, linePreviewCase())
  const second = renderPalettePreview(palette, linePreviewCase())
  const changed = renderPalettePreview(palette, linePreviewCase({ id: 'line-preview-2' }))
  const fixedA = renderPalettePreview(palette, linePreviewCase({ id: 'line-fixed-a', seed_strategy: 'fixed', seed_value: 808 }))
  const fixedB = renderPalettePreview(palette, linePreviewCase({ id: 'line-fixed-b', seed_strategy: 'fixed', seed_value: 808 }))

  expect(first.ok && second.ok && first.markup === second.markup, 'same line input should produce identical markup')
  expect(first.ok && changed.ok && first.markup !== changed.markup, 'different line seed should change generated values')
  expect(fixedA.ok && fixedB.ok && fixedA.markup === fixedB.markup, 'fixed line seed should override stable identifiers')
}

function testLineSeriesBounds(): void {
  const one = renderPalettePreview(palette, linePreviewCase({}, 1))
  const two = renderPalettePreview(palette, linePreviewCase({}, 2))
  const five = renderPalettePreview(palette, linePreviewCase({}, 5))
  const none = renderPalettePreview(palette, linePreviewCase({
    color_roles: {
      ...(linePreviewCase().color_roles as Record<string, unknown>),
      series: []
    }
  }, 0))

  expect(one.ok && countOccurrences(one.markup, 'class="line-series"') === 1, '1 line series should render')
  expect(two.ok && countOccurrences(two.markup, 'class="line-series"') === 2, '2 line series should render')
  expect(five.ok && countOccurrences(five.markup, 'class="line-series"') === 5, '5 line series should render')
  expect(!none.ok && none.code === 'PREVIEW_CASE_INVALID', 'empty line series should fail validation')
}

function testLinePointCountValidation(): void {
  const six = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 6, curve_shape: 'increasing' }
  }))
  const twelve = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 12, curve_shape: 'increasing' }
  }))
  const five = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 5, curve_shape: 'increasing' }
  }))
  const thirteen = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 13, curve_shape: 'increasing' }
  }))

  expect(six.ok && extractLineSeries(six.markup)[0].values.length === 6, 'point_count 6 should render')
  expect(twelve.ok && extractLineSeries(twelve.markup)[0].values.length === 12, 'point_count 12 should render')
  expect(!five.ok && five.code === 'PREVIEW_CASE_INVALID', 'point_count below 6 should fail validation')
  expect(!thirteen.ok && thirteen.code === 'PREVIEW_CASE_INVALID', 'point_count above 12 should fail validation')
}

function testLineCurvePatterns(): void {
  const increasing = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 8, curve_shape: 'increasing' }
  }))
  const decreasing = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 8, curve_shape: 'decreasing' }
  }))
  const sigmoid = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 9, curve_shape: 'sigmoid' }
  }))
  const peak = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 9, curve_shape: 'peak' }
  }))
  const mixed = renderPalettePreview(palette, linePreviewCase({
    preview_config: { point_count: 8, curve_shape: 'mixed' }
  }, 4))

  expect(increasing.ok && decreasing.ok && sigmoid.ok && peak.ok && mixed.ok, 'line curve pattern cases should render')
  if (increasing.ok && decreasing.ok && sigmoid.ok && peak.ok && mixed.ok) {
    const increasingSeries = extractLineSeries(increasing.markup)[0]
    const decreasingSeries = extractLineSeries(decreasing.markup)[0]
    const sigmoidSeries = extractLineSeries(sigmoid.markup)[0]
    const peakSeries = extractLineSeries(peak.markup)[0]
    const mixedShapes = new Set(extractLineSeries(mixed.markup).map((series) => series.shape))

    expect(increasingSeries.lastValue > increasingSeries.firstValue, 'increasing pattern should trend upward overall')
    expect(decreasingSeries.lastValue < decreasingSeries.firstValue, 'decreasing pattern should trend downward overall')
    expect(sigmoidSeries.values[1] - sigmoidSeries.values[0] < sigmoidSeries.values[5] - sigmoidSeries.values[3], 'sigmoid pattern should accelerate through the middle')
    expect(Math.max(...peakSeries.values) > peakSeries.firstValue && Math.max(...peakSeries.values) > peakSeries.lastValue, 'peak pattern should rise then fall')
    expect(mixedShapes.size >= 2, 'mixed pattern should produce at least two distinct series behaviors')
  }
}

function testLineMissingSeriesColorFailsValidation(): void {
  const previewCase = clonePreviewCase(linePreviewCase())
  const colorRoles = previewCase.color_roles as { series: Array<{ line: unknown }> }
  colorRoles.series[0].line = {}

  const result = renderPalettePreview(palette, previewCase)
  expect(!result.ok && result.code === 'PREVIEW_CASE_INVALID', 'missing line color_id should fail template validation')
  expect(!result.ok && !!result.issues?.some((issue) => issue.path === 'color_roles.series[0].line'), 'missing line color should name path')
}

function testLineOptionalRolesAndElements(): void {
  const previewCase = clonePreviewCase(linePreviewCase({
    preview_config: {
      point_count: 8,
      curve_shape: 'increasing',
      x_axis_label: 'Time <h>',
      y_axis_label: 'Signal'
    }
  }))
  const colorRoles = previewCase.color_roles as {
    series: Array<Record<string, unknown>>
    elements?: Record<string, unknown>
  }
  colorRoles.series[0].confidence_band = { source: 'palette', color_id: 'color-1', opacity: 0.2 }
  colorRoles.series[0].marker = { source: 'palette', color_id: 'color-4' }
  colorRoles.elements = {
    reference_line: { source: 'theme', token: 'muted_foreground' }
  }

  const result = renderPalettePreview(palette, previewCase)
  expect(result.ok, `line optional roles should render: ${JSON.stringify(result)}`)
  if (result.ok) {
    expect(result.markup.includes('class="confidence-band"'), 'confidence_band role should render subordinate band')
    expect(result.markup.includes('class="line-marker"'), 'marker role should render deterministic markers')
    expect(result.markup.includes('class="reference-line"'), 'reference_line element should render')
    expect(result.markup.includes('Time &lt;h&gt;'), 'x_axis_label should render escaped text')
  }
}

function testLineDuplicateKeysAndOpacityValidation(): void {
  const duplicate = renderPalettePreview(palette, linePreviewCase({
    color_roles: {
      ...(linePreviewCase().color_roles as Record<string, unknown>),
      series: [
        { key: 'dup', label: 'Duplicate A', line: { source: 'palette', color_id: 'color-1' } },
        { key: 'dup', label: 'Duplicate B', line: { source: 'palette', color_id: 'color-2' } }
      ]
    }
  }))
  const invalidOpacity = renderPalettePreview(palette, linePreviewCase({
    color_roles: {
      ...(linePreviewCase().color_roles as Record<string, unknown>),
      series: [
        { key: 'baseline', label: 'Baseline', line: { source: 'palette', color_id: 'color-1', opacity: -0.1 } }
      ]
    }
  }, 1))

  expect(!duplicate.ok && duplicate.code === 'PREVIEW_CASE_INVALID', 'duplicate line series keys should fail validation')
  expect(!duplicate.ok && !!duplicate.issues?.some((issue) => issue.path === 'color_roles.series[1].key'), 'duplicate line key path should be preserved')
  expect(!invalidOpacity.ok && invalidOpacity.code === 'PREVIEW_CASE_INVALID', 'invalid line opacity should fail validation')
  expect(!invalidOpacity.ok && !!invalidOpacity.issues?.some((issue) => issue.path === 'color_roles.series[0].line.opacity'), 'invalid line opacity path should be preserved')
}

function testLineUsesRequiredThemeColorsWithoutFallback(): void {
  const result = renderPalettePreview(palette, linePreviewCase(), {
    themeTokens: {
      foreground: '#010203',
      muted_foreground: '#040506',
      grid: '#070809',
      background: '#0A0B0C'
    }
  })

  expect(result.ok, 'complete line preview should render with custom theme tokens')
  if (!result.ok) {
    return
  }

  expect(result.markup.includes('#010203'), 'line axis should use resolved foreground token')
  expect(result.markup.includes('#040506'), 'line text should use resolved muted foreground token')
  expect(result.markup.includes('#070809'), 'line grid should use resolved grid token')
  expect(result.markup.includes('#0A0B0C'), 'line background should use resolved background token')
}

function testLineSvgQualityEscapingAndMutation(): void {
  const previewCase = linePreviewCase()
  const paletteBefore = JSON.stringify(palette)
  const previewBefore = JSON.stringify(previewCase)
  const result = renderPalettePreview(palette, previewCase)

  expect(result.ok, 'line should render for SVG quality assertions')
  expect(JSON.stringify(palette) === paletteBefore, 'line render pipeline should not mutate palette')
  expect(JSON.stringify(previewCase) === previewBefore, 'line render pipeline should not mutate preview case')
  if (!result.ok) {
    return
  }

  expect(!result.markup.includes('NaN'), 'line svg should not contain NaN')
  expect(!result.markup.includes('undefined'), 'line svg should not contain undefined')
  expect(!result.markup.includes('[object Object]'), 'line svg should not contain object stringification')
  expect(result.markup.includes('Low &lt;Dose&gt; &amp; &quot;A&quot;'), 'line text should escape special characters')
  expect(result.markup.includes('High &#39;Dose&#39;'), 'line text should escape apostrophes')
}

function testDiscreteRenderersFollowResolvedDataRoleCounts(): void {
  const cases = [
    {
      name: 'bar_error',
      create: (count: number) => barPreviewCase({}, count),
      groupClass: 'class="bar-data-mark"',
      colorAttribute: 'fill'
    },
    {
      name: 'boxplot_jitter',
      create: (count: number) => boxplotPreviewCase({}, count),
      groupClass: 'class="boxplot-group"',
      colorAttribute: 'fill'
    },
    {
      name: 'line_multiseries',
      create: (count: number) => linePreviewCase({}, count),
      groupClass: 'class="line-series"',
      colorAttribute: 'stroke'
    }
  ] as const

  for (const rendererCase of cases) {
    for (const count of [1, 2, 4, 5]) {
      const previewCase = rendererCase.create(count)
      const first = renderPalettePreview(palette, previewCase)
      const second = renderPalettePreview(palette, previewCase)
      expect(first.ok && second.ok, `${rendererCase.name} should render ${count} resolved data roles`)
      if (!first.ok || !second.ok) {
        continue
      }

      expect(first.width === 360 && first.height === 220, `${rendererCase.name} should remain 360 × 220`)
      expect(first.markup === second.markup, `${rendererCase.name} with ${count} roles should be deterministic`)
      expect(countOccurrences(first.markup, rendererCase.groupClass) === count, `${rendererCase.name} visible mark count should equal ${count}`)
      palette.colors.slice(0, count).forEach((color) => {
        expect(
          first.markup.includes(`${rendererCase.colorAttribute}="${color.hex}"`),
          `${rendererCase.name} should use ${color.hex} in a meaningful data mark`
        )
      })
      expectSvgCoordinateAttributesWithinCanvas(first.markup, rendererCase.name)
    }
  }
}

function testValidHeatmapsRenderSvg(): void {
  const sequential = renderPalettePreview(palette, heatmapPreviewCase())
  const diverging = renderPalettePreview(palette, heatmapPreviewCase({
    color_roles: {
      scale: {
        type: 'diverging',
        stops: [
          { position: 0, color: { source: 'palette', color_id: 'color-1' } },
          { position: 0.5, color: { source: 'palette', color_id: 'color-3' } },
          { position: 1, color: { source: 'palette', color_id: 'color-2' } }
        ]
      },
      elements: (heatmapPreviewCase().color_roles as { elements: unknown }).elements
    }
  }))

  expect(sequential.ok, `valid sequential heatmap should render: ${JSON.stringify(sequential)}`)
  expect(diverging.ok, `valid diverging heatmap should render: ${JSON.stringify(diverging)}`)
  if (sequential.ok && diverging.ok) {
    expect(sequential.markup.includes('<svg'), 'sequential heatmap should include svg root')
    expect(sequential.markup.includes('class="heatmap-cell"'), 'sequential heatmap should render cells')
    expect(diverging.markup.includes('#009E73'), 'diverging heatmap should use midpoint stop color')
  }
}

function testHeatmapDeterminismAndSeeds(): void {
  const first = renderPalettePreview(palette, heatmapPreviewCase())
  const second = renderPalettePreview(palette, heatmapPreviewCase())
  const changed = renderPalettePreview(palette, heatmapPreviewCase({ id: 'heatmap-preview-2' }))
  const fixedA = renderPalettePreview(palette, heatmapPreviewCase({ id: 'heatmap-fixed-a', seed_strategy: 'fixed', seed_value: 404 }))
  const fixedB = renderPalettePreview(palette, heatmapPreviewCase({ id: 'heatmap-fixed-b', seed_strategy: 'fixed', seed_value: 404 }))

  expect(first.ok && second.ok && first.markup === second.markup, 'same heatmap input should produce identical markup')
  expect(first.ok && changed.ok && extractHeatmapValues(first.markup).join(',') !== extractHeatmapValues(changed.markup).join(','), 'different heatmap seed should change matrix values')
  expect(fixedA.ok && fixedB.ok && fixedA.markup === fixedB.markup, 'fixed heatmap seed should override stable identifiers')
}

function testHeatmapSizeValidation(): void {
  const four = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, rows: 4, columns: 4 } }))
  const eight = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, rows: 8, columns: 8 } }))
  const rowsLow = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, rows: 3 } }))
  const rowsHigh = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, rows: 9 } }))
  const columnsLow = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, columns: 3 } }))
  const columnsHigh = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, columns: 9 } }))

  expect(four.ok && countOccurrences(four.markup, 'class="heatmap-cell"') === 16, '4x4 heatmap should render')
  expect(eight.ok && countOccurrences(eight.markup, 'class="heatmap-cell"') === 64, '8x8 heatmap should render')
  expect(!rowsLow.ok && rowsLow.code === 'PREVIEW_CASE_INVALID', 'rows below 4 should fail validation')
  expect(!rowsHigh.ok && rowsHigh.code === 'PREVIEW_CASE_INVALID', 'rows above 8 should fail validation')
  expect(!columnsLow.ok && columnsLow.code === 'PREVIEW_CASE_INVALID', 'columns below 4 should fail validation')
  expect(!columnsHigh.ok && columnsHigh.code === 'PREVIEW_CASE_INVALID', 'columns above 8 should fail validation')
}

function testHeatmapPatternsAndClustering(): void {
  const twoClusters = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, data_pattern: 'two_clusters', rows: 6, columns: 6 } }))
  const threeClusters = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, data_pattern: 'three_clusters', rows: 6, columns: 6 } }))
  const gradient = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, data_pattern: 'gradient', rows: 6, columns: 6 } }))
  const mixed = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, data_pattern: 'mixed', rows: 6, columns: 6 } }))
  const clusteredRows = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, data_pattern: 'two_clusters', cluster_rows: true } }))
  const clusteredColumns = renderPalettePreview(palette, heatmapPreviewCase({ preview_config: { ...heatmapPreviewCase().preview_config as Record<string, unknown>, data_pattern: 'two_clusters', cluster_columns: true } }))

  expect(twoClusters.ok && threeClusters.ok && gradient.ok && mixed.ok && clusteredRows.ok && clusteredColumns.ok, 'heatmap pattern and clustering cases should render')
  if (twoClusters.ok && threeClusters.ok && gradient.ok && mixed.ok && clusteredRows.ok && clusteredColumns.ok) {
    const two = extractHeatmapCells(twoClusters.markup)
    const three = extractHeatmapCells(threeClusters.markup)
    const gradientValues = extractHeatmapCells(gradient.markup)

    expect(cellValue(two, 0, 0) > cellValue(two, 0, 5) && cellValue(two, 5, 5) > cellValue(two, 5, 0), 'two_clusters should show block structure')
    expect(cellValue(three, 0, 0) > cellValue(three, 0, 5) && cellValue(three, 3, 3) > cellValue(three, 3, 0), 'three_clusters should show three-region structure')
    expect(cellValue(gradientValues, 5, 5) > cellValue(gradientValues, 0, 0), 'gradient should show monotonic progression')
    expect(extractHeatmapValues(mixed.markup).join(',') !== extractHeatmapValues(gradient.markup).join(','), 'mixed should differ from simple gradient')
    expect(extractRowOrder(clusteredRows.markup).join(',') !== '0,1,2,3,4,5', 'cluster_rows should change deterministic row order')
    expect(extractColumnOrder(clusteredColumns.markup).join(',') !== '0,1,2,3,4,5', 'cluster_columns should change deterministic column order')
    expect(clusteredRows.markup.indexOf('R' + (extractRowOrder(clusteredRows.markup)[0] + 1)) >= 0, 'row labels should follow clustered order')
    expect(clusteredColumns.markup.indexOf('C' + (extractColumnOrder(clusteredColumns.markup)[0] + 1)) >= 0, 'column labels should follow clustered order')
  }
}

function testHeatmapLabelsAndAnnotations(): void {
  const hidden = renderPalettePreview(palette, heatmapPreviewCase({
    preview_config: {
      ...heatmapPreviewCase().preview_config as Record<string, unknown>,
      show_row_labels: false,
      show_column_labels: false,
      show_values: false
    }
  }))
  const visible = renderPalettePreview(palette, heatmapPreviewCase({
    preview_config: {
      ...heatmapPreviewCase().preview_config as Record<string, unknown>,
      show_row_labels: true,
      show_column_labels: true,
      show_values: true
    }
  }))

  expect(hidden.ok && visible.ok, 'heatmap label and annotation cases should render')
  if (hidden.ok && visible.ok) {
    expect(!hidden.markup.includes('class="heatmap-row-label"'), 'show_row_labels=false should hide row labels')
    expect(!hidden.markup.includes('class="heatmap-column-label"'), 'show_column_labels=false should hide column labels')
    expect(!hidden.markup.includes('class="heatmap-annotation"'), 'show_values=false should hide annotations')
    expect(visible.markup.includes('class="heatmap-row-label"'), 'show_row_labels=true should render row labels')
    expect(visible.markup.includes('class="heatmap-column-label"'), 'show_column_labels=true should render column labels')
    expect(/class="heatmap-annotation"[^>]*>-?\d\.\d<\/text>/.test(visible.markup), 'show_values=true should render formatted annotations')
  }
}

function testHeatmapScaleValidationAndInterpolation(): void {
  const sequential = renderPalettePreview(palette, heatmapPreviewCase({ seed_strategy: 'fixed', seed_value: 1 }))
  const diverging = renderPalettePreview(palette, heatmapPreviewCase({
    seed_strategy: 'fixed',
    seed_value: 1,
    color_roles: {
      scale: {
        type: 'diverging',
        stops: [
          { position: 0, color: { source: 'palette', color_id: 'color-1' } },
          { position: 0.5, color: { source: 'palette', color_id: 'color-3' } },
          { position: 1, color: { source: 'palette', color_id: 'color-2' } }
        ]
      },
      elements: (heatmapPreviewCase().color_roles as { elements: unknown }).elements
    }
  }))
  const tooFew = renderPalettePreview(palette, heatmapPreviewCase({ color_roles: { scale: { type: 'sequential', stops: [{ position: 0, color: { source: 'palette', color_id: 'color-1' } }] }, elements: (heatmapPreviewCase().color_roles as { elements: unknown }).elements } }))
  const nonIncreasing = renderPalettePreview(palette, heatmapPreviewCase({ color_roles: { scale: { type: 'sequential', stops: [{ position: 0, color: { source: 'palette', color_id: 'color-1' } }, { position: 0, color: { source: 'palette', color_id: 'color-2' } }] }, elements: (heatmapPreviewCase().color_roles as { elements: unknown }).elements } }))
  const outside = renderPalettePreview(palette, heatmapPreviewCase({ color_roles: { scale: { type: 'sequential', stops: [{ position: 0, color: { source: 'palette', color_id: 'color-1' } }, { position: 1.2, color: { source: 'palette', color_id: 'color-2' } }] }, elements: (heatmapPreviewCase().color_roles as { elements: unknown }).elements } }))
  const missingStopColor = renderPalettePreview(palette, heatmapPreviewCase({ color_roles: { scale: { type: 'sequential', stops: [{ position: 0, color: {} }, { position: 1, color: { source: 'palette', color_id: 'color-2' } }] }, elements: (heatmapPreviewCase().color_roles as { elements: unknown }).elements } }))

  expect(sequential.ok && sequential.markup.includes('#2458A6') && sequential.markup.includes('#D55E00'), 'sequential scale should preserve endpoint colors')
  expect(diverging.ok && diverging.markup.includes('#009E73'), 'diverging scale should use midpoint stop')
  expect(!tooFew.ok && tooFew.code === 'PREVIEW_CASE_INVALID', 'too few scale stops should fail validation')
  expect(!nonIncreasing.ok && nonIncreasing.code === 'PREVIEW_CASE_INVALID', 'non-increasing scale stops should fail validation')
  expect(!outside.ok && outside.code === 'PREVIEW_CASE_INVALID', 'scale stop outside range should fail validation')
  expect(!missingStopColor.ok && missingStopColor.code === 'PREVIEW_CASE_INVALID', 'missing stop color_id should fail validation')
}

function testHeatmapColorContractAndTheme(): void {
  const withoutElements = clonePreviewCase(heatmapPreviewCase())
  delete (withoutElements.color_roles as { elements?: unknown }).elements
  const withoutElementsResult = renderPalettePreview(palette, withoutElements)
  expect(withoutElementsResult.ok, 'heatmap optional elements may be omitted')

  optionalHeatmapElementRoleKeys.forEach((roleKey) => {
    const previewCase = clonePreviewCase(heatmapPreviewCase())
    const colorRoles = previewCase.color_roles as {
      elements: Record<typeof optionalHeatmapElementRoleKeys[number], unknown>
    }
    colorRoles.elements[roleKey] = {}
    const result = renderPalettePreview(palette, previewCase)
    expect(!result.ok && result.code === 'PREVIEW_CASE_INVALID', `malformed heatmap ${roleKey} should fail validation`)
    expect(!result.ok && !!result.issues?.some((issue) => issue.path === `color_roles.elements.${roleKey}`), `malformed heatmap ${roleKey} should name path`)
  })

  const themed = renderPalettePreview(palette, heatmapPreviewCase(), {
    themeTokens: {
      foreground: '#010203',
      muted_foreground: '#040506',
      grid: '#070809',
      background: '#0A0B0C'
    }
  })
  expect(themed.ok, 'heatmap should render with custom theme tokens')
  if (themed.ok) {
    expect(themed.markup.includes('#010203'), 'heatmap border and annotation text should use resolved foreground token')
    expect(themed.markup.includes('#040506'), 'heatmap text should use resolved muted foreground token')
    expect(themed.markup.includes('#070809'), 'heatmap grid should use resolved grid token')
    expect(themed.markup.includes('#0A0B0C'), 'heatmap background should use resolved background token')
  }
}

function testHeatmapAnnotationsAndOpacityValidation(): void {
  const annotated = renderPalettePreview(palette, heatmapPreviewCase({
    color_roles: {
      ...(heatmapPreviewCase().color_roles as Record<string, unknown>),
      annotations: [
        { key: 'batch', label: 'Batch', color: { source: 'palette', color_id: 'color-3' } },
        { key: 'condition', label: 'Condition', color: { source: 'palette', color_id: 'color-4' } }
      ]
    }
  }))
  const invalidOpacity = renderPalettePreview(palette, heatmapPreviewCase({
    color_roles: {
      ...(heatmapPreviewCase().color_roles as Record<string, unknown>),
      scale: {
        type: 'sequential',
        stops: [
          { position: 0, color: { source: 'palette', color_id: 'color-1', opacity: 2 } },
          { position: 1, color: { source: 'palette', color_id: 'color-2' } }
        ]
      }
    }
  }))

  expect(annotated.ok, `heatmap annotations should render: ${JSON.stringify(annotated)}`)
  if (annotated.ok) {
    expect(countOccurrences(annotated.markup, 'class="heatmap-annotation-track"') === 2, 'variable heatmap annotations should render tracks')
    expect(annotated.markup.includes('Batch') && annotated.markup.includes('Condition'), 'annotation labels should render')
  }
  expect(!invalidOpacity.ok && invalidOpacity.code === 'PREVIEW_CASE_INVALID', 'invalid heatmap stop opacity should fail validation')
  expect(!invalidOpacity.ok && !!invalidOpacity.issues?.some((issue) => issue.path === 'color_roles.scale.stops[0].color.opacity'), 'invalid heatmap opacity path should be preserved')
}

function testHeatmapColumnGroupLabelsDoNotOverlap(): void {
  const cohortPreview = heatmapPreviewCase({
    color_roles: {
      ...(heatmapPreviewCase().color_roles as Record<string, unknown>),
      annotations: [
        { key: 'cohort_a', label: 'Cohort A', color: { source: 'palette', color_id: 'color-3' } },
        { key: 'cohort_b', label: 'Cohort B', color: { source: 'palette', color_id: 'color-4' } }
      ]
    },
    preview_config: {
      ...heatmapPreviewCase().preview_config as Record<string, unknown>,
      columns: 8,
      cluster_columns: false
    }
  })
  const result = renderPalettePreview(palette, cohortPreview)

  expect(result.ok, `heatmap cohort column groups should render: ${JSON.stringify(result)}`)
  if (!result.ok) {
    return
  }

  const groupLabels = extractHeatmapColumnGroupLabels(result.markup)
  const groupTracks = extractHeatmapAnnotationTracks(result.markup)
  expect(groupLabels.length === 2, 'heatmap should render one column group label per annotation')
  expect(groupLabels.map((label) => label.text).join(',') === 'Cohort A,Cohort B', 'heatmap column group labels should preserve annotation text')
  expect(countOccurrences(result.markup, 'Cohort A') === 1, 'Cohort A should be rendered exactly once')
  expect(countOccurrences(result.markup, 'Cohort B') === 1, 'Cohort B should be rendered exactly once')
  expect(groupTracks.length === 2, 'heatmap should render one annotation track per column group')
  expect(groupTracks[0].startColumn === 0 && groupTracks[0].endColumn === 3, 'first cohort should span the first half of 8 columns')
  expect(groupTracks[1].startColumn === 4 && groupTracks[1].endColumn === 7, 'second cohort should span the second half of 8 columns')

  const minLabelGap = estimatedTextWidth(groupLabels[0].text, 7) / 2 +
    estimatedTextWidth(groupLabels[1].text, 7) / 2 +
    4
  expect(Math.abs(groupLabels[1].x - groupLabels[0].x) > minLabelGap, 'cohort labels should not horizontally overlap')
  expect(groupLabels.every((label) => label.x > 54 && label.x < 292), 'cohort labels should stay within heatmap plot bounds')
}

function testHeatmapSvgQualityEscapingAndMutation(): void {
  const previewCase = heatmapPreviewCase()
  const paletteBefore = JSON.stringify(palette)
  const previewBefore = JSON.stringify(previewCase)
  const result = renderPalettePreview(palette, previewCase)

  expect(result.ok, 'heatmap should render for SVG quality assertions')
  expect(JSON.stringify(palette) === paletteBefore, 'heatmap render pipeline should not mutate palette')
  expect(JSON.stringify(previewCase) === previewBefore, 'heatmap render pipeline should not mutate preview case')
  if (!result.ok) {
    return
  }

  expect(!result.markup.includes('NaN'), 'heatmap svg should not contain NaN')
  expect(!result.markup.includes('undefined'), 'heatmap svg should not contain undefined')
  expect(!result.markup.includes('[object Object]'), 'heatmap svg should not contain object stringification')
  expect(!heatmapAnnotatedRenderer.render.toString().includes('Math.random'), 'heatmap renderer should not use Math.random()')
}

function testUnsupportedAndPlaceholders(): void {
  const missingRenderer = renderPalettePreview(palette, barPreviewCase(), { renderers: [] })
  expect(!missingRenderer.ok && missingRenderer.kind === 'unsupported', 'unknown renderer should return unsupported')

  expect(boxplotJitterRenderer.render !== lineMultiseriesRenderer.render, 'boxplot renderer should no longer be placeholder')
  expect(!barErrorRenderer.render.toString().includes('RENDERER_NOT_IMPLEMENTED'), 'bar renderer should be implemented')
  expect(!boxplotJitterRenderer.render.toString().includes('RENDERER_NOT_IMPLEMENTED'), 'boxplot renderer should be implemented')
  expect(!lineMultiseriesRenderer.render.toString().includes('RENDERER_NOT_IMPLEMENTED'), 'line renderer should be implemented')
  expect(!heatmapAnnotatedRenderer.render.toString().includes('RENDERER_NOT_IMPLEMENTED'), 'heatmap renderer should be implemented')
}

function testRendererRegistrationValidation(): void {
  let duplicateRejected = false
  try {
    registerPreviewRenderers([barErrorRenderer, barErrorRenderer])
  } catch {
    duplicateRejected = true
  }
  expect(duplicateRejected, 'duplicate renderer registration should be rejected')

  let mismatchRejected = false
  try {
    registerPreviewRenderers([{ ...barErrorRenderer, templateVersion: 2 }])
  } catch {
    mismatchRejected = true
  }
  expect(mismatchRejected, 'renderer metadata mismatch should be rejected')
}

function testSvgQualityAndEscaping(): void {
  const result = renderPalettePreview(palette, barPreviewCase())
  expect(result.ok, 'bar_error should render for SVG quality assertions')
  if (!result.ok) {
    return
  }

  expect(!result.markup.includes('NaN'), 'svg should not contain NaN')
  expect(!result.markup.includes('undefined'), 'svg should not contain undefined')
  expect(!result.markup.includes('[object Object]'), 'svg should not contain object stringification')
  expect(result.markup.includes('Low &lt;Dose&gt; &amp; &quot;A&quot;'), 'svg text should escape special characters')
  expect(result.markup.includes('High &#39;Dose&#39;'), 'svg text should escape apostrophes')
}

function testRenderPipelineDoesNotMutateInputs(): void {
  const previewCase = barPreviewCase()
  const paletteBefore = JSON.stringify(palette)
  const previewBefore = JSON.stringify(previewCase)

  renderPalettePreview(palette, previewCase)

  expect(JSON.stringify(palette) === paletteBefore, 'render pipeline should not mutate palette')
  expect(JSON.stringify(previewCase) === previewBefore, 'render pipeline should not mutate preview case')
}

function testRenderersDoNotUseMathRandom(): void {
  const renderers = [
    barErrorRenderer,
    boxplotJitterRenderer,
    lineMultiseriesRenderer,
    heatmapAnnotatedRenderer
  ]

  renderers.forEach((renderer) => {
    expect(!renderer.render.toString().includes('Math.random'), `${renderer.templateId} should not use Math.random()`)
  })
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function expectSvgCoordinateAttributesWithinCanvas(markup: string, rendererName: string): void {
  const attributes = /\b(x|x1|x2|cx|y|y1|y2|cy)="(-?\d+(?:\.\d+)?)"/g
  let match = attributes.exec(markup)
  while (match) {
    const value = Number(match[2])
    const maximum = match[1].startsWith('x') || match[1] === 'cx' ? 360 : 220
    expect(value >= 0 && value <= maximum, `${rendererName} ${match[1]}=${value} should remain inside the SVG canvas`)
    match = attributes.exec(markup)
  }
}

function estimatedTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56
}

function extractBoxplotStats(markup: string): Array<{
  q1: number
  median: number
  q3: number
  lowerWhisker: number
  upperWhisker: number
}> {
  const stats: Array<{
    q1: number
    median: number
    q3: number
    lowerWhisker: number
    upperWhisker: number
  }> = []
  const pattern = /data-q1="([^"]+)" data-median="([^"]+)" data-q3="([^"]+)" data-lower-whisker="([^"]+)" data-upper-whisker="([^"]+)"/g
  let match = pattern.exec(markup)
  while (match) {
    stats.push({
      q1: Number(match[1]),
      median: Number(match[2]),
      q3: Number(match[3]),
      lowerWhisker: Number(match[4]),
      upperWhisker: Number(match[5])
    })
    match = pattern.exec(markup)
  }
  return stats
}

function extractLineSeries(markup: string): Array<{
  shape: string
  values: number[]
  firstValue: number
  lastValue: number
}> {
  const series: Array<{
    shape: string
    values: number[]
    firstValue: number
    lastValue: number
  }> = []
  const pattern = /class="line-series"[^>]*data-shape="([^"]+)"[^>]*data-values="([^"]+)"[^>]*data-first-value="([^"]+)"[^>]*data-last-value="([^"]+)"/g
  let match = pattern.exec(markup)
  while (match) {
    series.push({
      shape: match[1],
      values: match[2].split(',').map(Number),
      firstValue: Number(match[3]),
      lastValue: Number(match[4])
    })
    match = pattern.exec(markup)
  }
  return series
}

function extractHeatmapCells(markup: string): Array<{
  row: number
  column: number
  value: number
}> {
  const cells: Array<{
    row: number
    column: number
    value: number
  }> = []
  const pattern = /class="heatmap-cell" data-row-index="([^"]+)" data-column-index="([^"]+)" data-value="([^"]+)"/g
  let match = pattern.exec(markup)
  while (match) {
    cells.push({
      row: Number(match[1]),
      column: Number(match[2]),
      value: Number(match[3])
    })
    match = pattern.exec(markup)
  }
  return cells
}

function extractHeatmapValues(markup: string): number[] {
  return extractHeatmapCells(markup).map((cell) => cell.value)
}

function cellValue(cells: Array<{ row: number; column: number; value: number }>, row: number, column: number): number {
  const cell = cells.find((candidate) => candidate.row === row && candidate.column === column)
  if (!cell) {
    throw new Error(`Missing heatmap cell ${row},${column}`)
  }
  return cell.value
}

function extractRowOrder(markup: string): number[] {
  const match = markup.match(/data-row-order="([^"]+)"/)
  return match ? match[1].split(',').map(Number) : []
}

function extractColumnOrder(markup: string): number[] {
  const match = markup.match(/data-column-order="([^"]+)"/)
  return match ? match[1].split(',').map(Number) : []
}

function extractHeatmapColumnGroupLabels(markup: string): Array<{ text: string; x: number; y: number }> {
  const labels: Array<{ text: string; x: number; y: number }> = []
  const pattern = /class="heatmap-column-group-label" x="([^"]+)" y="([^"]+)"[^>]*>([^<]+)<\/text>/g
  let match = pattern.exec(markup)
  while (match) {
    labels.push({
      x: Number(match[1]),
      y: Number(match[2]),
      text: match[3]
    })
    match = pattern.exec(markup)
  }
  return labels
}

function extractHeatmapAnnotationTracks(markup: string): Array<{ startColumn: number; endColumn: number }> {
  const tracks: Array<{ startColumn: number; endColumn: number }> = []
  const pattern = /class="heatmap-annotation-track"[^>]*data-start-column="([^"]+)" data-end-column="([^"]+)"/g
  let match = pattern.exec(markup)
  while (match) {
    tracks.push({
      startColumn: Number(match[1]),
      endColumn: Number(match[2])
    })
    match = pattern.exec(markup)
  }
  return tracks
}

testValidBarErrorRendersSvg()
testDeterminismAndSeedChanges()
testFixedSeedIsHonored()
testValidationAndColorFailuresStopBeforeRenderer()
testMissingBarElementRolesFailValidation()
testInvalidBarElementRolesFailValidation()
testRendererUsesRequiredThemeColorsWithoutFallback()
testValidBoxplotJitterRendersSvg()
testBoxplotDeterminismAndSeedChanges()
testBoxplotDensityAffectsPointCount()
testBoxplotOutlierVisibility()
testBoxplotQuartilesAndWhiskers()
testBoxplotGroupCountBounds()
testBoxplotMissingGroupColorFailsValidation()
testBoxplotOptionalElementsAndConfig()
testBoxplotDuplicateKeysAndOpacityValidation()
testBoxplotUsesRequiredThemeColorsWithoutFallback()
testBoxplotSvgQualityAndEscaping()
testBoxplotFiveColorPaletteUsesFiveGroups()
testBoxplotRendererDoesNotMutateInputs()
testValidLineMultiseriesRendersSvg()
testLineDeterminismAndSeeds()
testLineSeriesBounds()
testLinePointCountValidation()
testLineCurvePatterns()
testLineMissingSeriesColorFailsValidation()
testLineOptionalRolesAndElements()
testLineDuplicateKeysAndOpacityValidation()
testLineUsesRequiredThemeColorsWithoutFallback()
testLineSvgQualityEscapingAndMutation()
testDiscreteRenderersFollowResolvedDataRoleCounts()
testValidHeatmapsRenderSvg()
testHeatmapDeterminismAndSeeds()
testHeatmapSizeValidation()
testHeatmapPatternsAndClustering()
testHeatmapLabelsAndAnnotations()
testHeatmapScaleValidationAndInterpolation()
testHeatmapColorContractAndTheme()
testHeatmapAnnotationsAndOpacityValidation()
testHeatmapColumnGroupLabelsDoNotOverlap()
testHeatmapSvgQualityEscapingAndMutation()
testUnsupportedAndPlaceholders()
testRendererRegistrationValidation()
testSvgQualityAndEscaping()
testRenderPipelineDoesNotMutateInputs()
testRenderersDoNotUseMathRandom()
