import controlledVocabularies from '../../contracts/palette-ingestion/v1/controlled-vocabularies.json'
import goValidationSource from '../../backend/internal/palette/validation.go?raw'
import { CHART_TYPE_DEFINITIONS } from '@/lib/chart-types/registry'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const registryTypes = CHART_TYPE_DEFINITIONS.map((definition) => definition.chartType)

expect(
  registryTypes.join(',') === controlledVocabularies.chart_types.join(','),
  'TypeScript registry and controlled chart vocabulary must remain byte-order consistent'
)

for (const chartType of registryTypes) {
  expect(
    goValidationSource.includes(`= "${chartType}"`),
    `Go chart vocabulary must register ${chartType}`
  )
}
