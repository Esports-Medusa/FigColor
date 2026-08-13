import controlledVocabularies from '../../../../contracts/palette-ingestion/v1/controlled-vocabularies.json'

export type AssistantMetadataField = 'disciplines' | 'use_cases' | 'avoid_cases' | 'tags'

export const ASSISTANT_CONTROLLED_VOCABULARIES: Readonly<Record<AssistantMetadataField, readonly string[]>> = Object.freeze({
  disciplines: Object.freeze([...controlledVocabularies.disciplines]),
  use_cases: Object.freeze([...controlledVocabularies.use_cases]),
  avoid_cases: Object.freeze([...controlledVocabularies.avoid_cases]),
  tags: Object.freeze([...controlledVocabularies.tags])
})

export function vocabularyLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
}

export function selectableVocabularyValues(field: AssistantMetadataField, selected: readonly string[], query: string): string[] {
  const normalized = query.trim().toLocaleLowerCase()
  return ASSISTANT_CONTROLLED_VOCABULARIES[field].filter((value) => !selected.includes(value) && (!normalized || vocabularyLabel(value).toLocaleLowerCase().includes(normalized) || value.toLocaleLowerCase().includes(normalized)))
}

export function isAuthoritativeVocabularyValue(field: AssistantMetadataField, value: string): boolean {
  return ASSISTANT_CONTROLLED_VOCABULARIES[field].includes(value)
}
