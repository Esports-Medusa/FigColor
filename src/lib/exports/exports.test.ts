import paletteDetailSource from '@/views/PaletteDetailView.vue?raw'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'
import {
  resolvePaletteExportModel,
  sanitizeExportIdentifier,
  toCssCustomProperties,
  toExportHexArray,
  toExportRgbTuples,
  toGgplotFillScale,
  toMatplotlibSnippet,
  toPythonDictionary,
  toPythonList,
  toRNamedVector,
  toSeabornSnippet
} from './index'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const colors = [
  { id: 'blue-id', hex: '#2458A6', rgb: [36, 88, 166] as [number, number, number], label: 'Blue', order: 0 },
  { id: 'orange-id', hex: '#D55E00', rgb: [213, 94, 0] as [number, number, number], label: 'Orange', order: 1 },
  { id: 'green-id', hex: '#009E73', rgb: [0, 158, 115] as [number, number, number], label: 'Green', order: 2 }
]

function palette(overrides: Partial<CanonicalPalette> = {}): CanonicalPalette {
  return {
    id: 'palette-1',
    slug: 'palette-one',
    name: 'Palette One',
    status: 'published',
    colors,
    color_count: colors.length,
    type: 'categorical',
    chart_types: ['bar_error'],
    journal_style: [],
    disciplines: [],
    use_cases: [],
    avoid_cases: [],
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    primary_preview_case: previewCase(),
    preview_cases: [],
    ...overrides
  }
}

function previewCase(overrides: Partial<PalettePreviewCase> = {}): PalettePreviewCase {
  return {
    id: 'preview-1',
    palette_id: 'palette-1',
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups: [
        { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'blue-id' } },
        { key: 'treated', label: 'Treated', fill: { source: 'palette', color_id: 'orange-id' } },
        { key: 'rescue', label: 'Rescue', fill: { source: 'palette', color_id: 'green-id' } }
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
      sample_size: 12,
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

function testRoleAwareResolver(): void {
  const model = resolvePaletteExportModel(palette())
  expect(model.source === 'bar_error_roles', 'valid published primary bar_error_v1 should use role-aware exports')
  expect(model.colors.map((color) => color.key).join(',') === 'control,treated,rescue', 'group role order should be preserved')
  expect(model.colors.map((color) => color.colorId).join(',') === 'blue-id,orange-id,green-id', 'stable color_id should be preserved')
  expect(model.colors.map((color) => color.hex).join(',') === '#2458A6,#D55E00,#009E73', 'stable color_id should resolve to role colors')
  expect(model.namedColors.control === '#2458A6', 'namedColors should preserve original role keys')
}

function testDuplicateRoleColorsArePreserved(): void {
  const model = resolvePaletteExportModel(palette({
    primary_preview_case: previewCase({
      color_roles: {
        ...(previewCase().color_roles as Record<string, unknown>),
        groups: [
          { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'blue-id' } },
          { key: 'treated', label: 'Treated', fill: { source: 'palette', color_id: 'blue-id' } }
        ]
      }
    })
  }))

  expect(model.source === 'bar_error_roles', 'duplicate color IDs should be allowed for distinct roles')
  expect(model.colors.length === 2, 'duplicate role colors should not be dropped')
  expect(model.colors[0].hex === model.colors[1].hex, 'duplicate role colors should preserve repeated hex values')
}

function testFallbackSelection(): void {
  const fallbackCases: Array<[string, CanonicalPalette]> = [
    ['no primary', palette({ primary_preview_case: null, preview_cases: [previewCase()] })],
    ['draft primary', palette({ primary_preview_case: previewCase({ status: 'draft' }) })],
    ['archived primary', palette({ primary_preview_case: previewCase({ status: 'archived' }) })],
    ['non-bar primary', palette({ primary_preview_case: previewCase({ chart_type: 'boxplot_jitter', template_id: 'boxplot_jitter_v1' }) })],
    ['invalid preview', palette({ primary_preview_case: previewCase({ preview_config: { orientation: 'diagonal' } }) })],
    ['missing color', palette({
      primary_preview_case: previewCase({
        color_roles: {
          ...(previewCase().color_roles as Record<string, unknown>),
          groups: [{ key: 'missing', label: 'Missing', fill: { source: 'palette', color_id: 'missing-id' } }]
        }
      })
    })],
    ['duplicate role key', palette({
      primary_preview_case: previewCase({
        color_roles: {
          ...(previewCase().color_roles as Record<string, unknown>),
          groups: [
            { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'blue-id' } },
            { key: 'control', label: 'Control duplicate', fill: { source: 'palette', color_id: 'orange-id' } }
          ]
        }
      })
    })]
  ]

  fallbackCases.forEach(([name, input]) => {
    const model = resolvePaletteExportModel(input)
    expect(model.source === 'palette_order_fallback', `${name} should use palette-order fallback`)
    expect(model.colors.map((color) => color.key).join(',') === 'color_1,color_2,color_3', `${name} fallback should use stable fallback keys`)
    expect(model.colors.map((color) => color.hex).join(',') === '#2458A6,#D55E00,#009E73', `${name} fallback should preserve canonical palette order`)
    expect(model.warnings.length > 0, `${name} should include debug warnings`)
  })
}

function testNoAutoSelectionFromPreviewCases(): void {
  const model = resolvePaletteExportModel(palette({
    primary_preview_case: null,
    preview_cases: [previewCase()]
  }))
  expect(model.source === 'palette_order_fallback', 'resolver should not auto-select from preview_cases')
}

function testGeneratedOutputs(): void {
  const model = resolvePaletteExportModel(palette())
  expect(toExportHexArray(model) === '[\n  "#2458A6",\n  "#D55E00",\n  "#009E73"\n]', 'HEX output should be ordered and copy-ready')
  expect(toExportRgbTuples(model) === '[\n  (36, 88, 166),\n  (213, 94, 0),\n  (0, 158, 115)\n]', 'RGB tuple output should be ordered')
  expect(toPythonList(model) === 'colors = ["#2458A6", "#D55E00", "#009E73"]', 'Python list output should be correct')
  expect(toPythonDictionary(model).includes('"control": "#2458A6"'), 'Python dictionary output should preserve role keys')
  expect(toMatplotlibSnippet(model).includes('import matplotlib.pyplot as plt'), 'Matplotlib output should import pyplot')
  expect(toMatplotlibSnippet(model).includes('bar_colors = [colors[key] for key in group_order]'), 'Matplotlib output should be copy-ready')
  expect(toSeabornSnippet(model).includes('import seaborn as sns'), 'Seaborn output should import seaborn')
  expect(toSeabornSnippet(model).includes('sns.set_palette(colors)'), 'Seaborn output should set the ordered palette')
  expect(toRNamedVector(model).includes('control = "#2458A6"'), 'R named vector should include role names')
  expect(toGgplotFillScale(model).startsWith('scale_fill_manual('), 'ggplot2 output should be a fill scale')
  expect(toCssCustomProperties(model).includes('--figcolor-control: #2458A6;'), 'CSS output should include role custom properties')
}

function testIdentifierSanitization(): void {
  const model = resolvePaletteExportModel(palette({
    primary_preview_case: previewCase({
      color_roles: {
        ...(previewCase().color_roles as Record<string, unknown>),
        groups: [
          { key: '1 control', label: 'Quote "label"', fill: { source: 'palette', color_id: 'blue-id' } },
          { key: '1-control', label: 'Slash \\ label', fill: { source: 'palette', color_id: 'orange-id' } },
          { key: '!!!', label: 'Empty', fill: { source: 'palette', color_id: 'green-id' } }
        ]
      }
    })
  }))

  expect(sanitizeExportIdentifier('1 control', 'python') === 'color_1_control', 'Python identifiers beginning with digits should be prefixed')
  expect(sanitizeExportIdentifier('class', 'python') === 'class_color', 'Python reserved words should be suffixed')
  expect(sanitizeExportIdentifier('1 control', 'css') === 'color-1-control', 'CSS identifiers beginning with digits should be prefixed')
  expect(toRNamedVector(model).includes('color_1_control = "#2458A6"'), 'R output should sanitize invalid characters')
  expect(toRNamedVector(model).includes('color_1_control_2 = "#D55E00"'), 'duplicate sanitized R identifiers should receive suffixes')
  expect(toCssCustomProperties(model).includes('--figcolor-color-1-control_2: #D55E00;'), 'duplicate sanitized CSS identifiers should receive suffixes')
  expect(toCssCustomProperties(model).includes('--figcolor-color: #009E73;'), 'empty sanitized CSS identifiers should use a safe fallback')
  expect(toPythonDictionary(model).includes('"1 control": "#2458A6"'), 'Python dictionary should preserve and escape original keys')
}

function testNoMutation(): void {
  const input = palette()
  const before = JSON.stringify(input)
  const model = resolvePaletteExportModel(input)
  toExportHexArray(model)
  toPythonDictionary(model)
  toRNamedVector(model)
  toCssCustomProperties(model)
  expect(JSON.stringify(input) === before, 'export generation should not mutate palette or preview case')
}

function testPaletteDetailWiring(): void {
  expect(paletteDetailSource.includes("from '@/lib/exports'"), 'PaletteDetailView should use shared export generators')
  expect(paletteDetailSource.includes('resolvePaletteExportModel'), 'PaletteDetailView should resolve the shared export model')
  expect(paletteDetailSource.includes("label: 'RGB'"), 'PaletteDetailView should include the RGB tab')
  expect(paletteDetailSource.includes("label: 'Seaborn'"), 'PaletteDetailView should preserve the Seaborn copy tab')
  expect(paletteDetailSource.includes('toSeabornSnippet'), 'PaletteDetailView should generate Seaborn from the shared export model')
  expect(!paletteDetailSource.includes('toSeabornPalette'), 'PaletteDetailView should not use old palette-only Seaborn copy block')
}

testRoleAwareResolver()
testDuplicateRoleColorsArePreserved()
testFallbackSelection()
testNoAutoSelectionFromPreviewCases()
testGeneratedOutputs()
testIdentifierSanitization()
testNoMutation()
testPaletteDetailWiring()
