import figureFormSource from './FigureForm.vue?raw'
import figureCardSource from './FigureAssignmentCard.vue?raw'
import addPaletteModalSource from './AddPaletteModal.vue?raw'
import projectDetailSource from '@/views/ProjectDetailView.vue?raw'
import projectApiSource from '@/lib/projectApi.ts?raw'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function testFigureFormSubmitsBasePaletteId(): void {
  expect(
    figureFormSource.includes('paletteId: selectedPalette.value.basePaletteId'),
    'FigureForm should submit ProjectPalette.basePaletteId as CreateFigureRequest.paletteId'
  )
  expect(
    figureFormSource.includes('does not have a basePaletteId'),
    'FigureForm should show an explicit error when a project palette lacks basePaletteId'
  )
  expect(
    figureFormSource.includes('palette.id === paletteId || palette.basePaletteId === paletteId'),
    'FigureForm should resolve existing figures by either project palette id or base palette id'
  )
}

function testProjectDetailHandlesCreateFigureErrorsInline(): void {
  expect(
    projectDetailSource.includes(':submitError="figureFormError"'),
    'ProjectDetailView should pass create/update errors into FigureForm'
  )
  expect(
    projectDetailSource.includes('await loadProject()'),
    'ProjectDetailView should refresh project detail after creating a figure'
  )
  expect(
    !projectDetailSource.includes("alert('Failed to create figure')"),
    'ProjectDetailView should not use a native alert for create figure failures'
  )
  expect(
    projectDetailSource.includes("figureFormError.value = e?.message || 'Failed to create figure'"),
    'ProjectDetailView should surface backend create figure errors'
  )
}

function testFigureCardResolvesBasePaletteId(): void {
  expect(
    figureCardSource.includes('palette.id === paletteId || palette.basePaletteId === paletteId'),
    'FigureAssignmentCard should match figures to project palettes by basePaletteId'
  )
}

function testAddPalettePersistsProjectPalette(): void {
  expect(
    projectApiSource.includes('createProjectPalette(projectId: string, data: CreateProjectPaletteRequest)'),
    'projectApi should expose createProjectPalette'
  )
  expect(
    addPaletteModalSource.includes('projectApi.createProjectPalette'),
    'AddPaletteModal should persist selected base palettes through the backend'
  )
  expect(
    addPaletteModalSource.includes('Custom project palettes do not have a basePaletteId yet'),
    'AddPaletteModal should not silently create unsupported custom project palettes'
  )
}

testFigureFormSubmitsBasePaletteId()
testProjectDetailHandlesCreateFigureErrorsInline()
testFigureCardResolvesBasePaletteId()
testAddPalettePersistsProjectPalette()
