<template>
  <div class="filter-panel">
    <!-- Search Box with Expand/Collapse -->
    <div class="search-container">
      <input
        type="text"
        class="search-input"
        placeholder="Search palette name, tags, chart type..."
        :value="searchQuery"
        @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
      <button class="toggle-btn" @click="$emit('update:expanded', !expanded)">
        {{ expanded ? 'Collapse' : 'Expand Filters' }}
        <span class="toggle-icon">{{ expanded ? '▲' : '▼' }}</span>
      </button>
    </div>

    <!-- Filter Groups (collapsible) -->
    <div v-show="expanded" class="filter-groups">
      <!-- Journal Style -->
      <div class="filter-group">
        <span class="filter-label">Journal Style</span>
        <div class="filter-pills">
          <button
            v-for="option in journalStyleOptions"
            :key="option"
            class="filter-pill"
            :class="{ active: selectedJournalStyle === getFilterValue('journalStyle', option) }"
            @click="$emit('update:selectedJournalStyle', getFilterValue('journalStyle', option))"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <!-- Chart Type -->
      <div class="filter-group">
        <span class="filter-label">Chart Type</span>
        <div class="filter-pills">
          <button
            v-for="option in chartTypeOptions"
            :key="option"
            class="filter-pill"
            :class="{ active: selectedChartType === getFilterValue('chartType', option) }"
            @click="$emit('update:selectedChartType', getFilterValue('chartType', option))"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <!-- Color Count -->
      <div class="filter-group">
        <span class="filter-label">Color Count</span>
        <div class="filter-pills">
          <button
            v-for="option in colorCountOptions"
            :key="option.value"
            class="filter-pill"
            :class="{ active: selectedColorCount === option.value }"
            @click="$emit('update:selectedColorCount', option.value as any)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- Use Case -->
      <div class="filter-group">
        <span class="filter-label">Use Case</span>
        <div class="filter-pills">
          <button
            v-for="option in useCaseOptions"
            :key="option"
            class="filter-pill"
            :class="{ active: selectedUseCase === getFilterValue('useCase', option) }"
            @click="$emit('update:selectedUseCase', getFilterValue('useCase', option))"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <!-- Discipline -->
      <div class="filter-group">
        <span class="filter-label">Discipline</span>
        <div class="filter-pills">
          <button
            v-for="option in disciplineOptions"
            :key="option"
            class="filter-pill"
            :class="{ active: selectedDiscipline === getFilterValue('discipline', option) }"
            @click="$emit('update:selectedDiscipline', getFilterValue('discipline', option))"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <!-- Tags -->
      <div class="filter-group">
        <span class="filter-label">Tags</span>
        <div class="filter-pills">
          <button
            v-for="option in tagOptions"
            :key="option"
            class="filter-pill"
            :class="{ active: selectedTag === getFilterValue('tag', option) }"
            @click="$emit('update:selectedTag', getFilterValue('tag', option))"
          >
            {{ option }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { 
  JOURNAL_STYLES, 
  CHART_TYPES, 
  USE_CASES, 
  DISCIPLINES, 
  TAGS 
} from '@/types/palette'

defineProps<{
  searchQuery: string
  selectedJournalStyle: string
  selectedChartType: string
  selectedColorCount: number | ''
  selectedUseCase: string
  selectedDiscipline: string
  selectedTag: string
  expanded: boolean
}>()

defineEmits<{
  'update:searchQuery': [value: string]
  'update:selectedJournalStyle': [value: string]
  'update:selectedChartType': [value: string]
  'update:selectedColorCount': [value: number | '']
  'update:selectedUseCase': [value: string]
  'update:selectedDiscipline': [value: string]
  'update:selectedTag': [value: string]
  'update:expanded': [value: boolean]
}>()

const journalStyleOptions = ['All', ...JOURNAL_STYLES]
const chartTypeOptions = ['All', ...CHART_TYPES]
const colorCountOptions = [
  { label: 'All', value: '' },
  { label: '2 colors', value: 2 },
  { label: '3 colors', value: 3 },
  { label: '4 colors', value: 4 },
  { label: '5 colors', value: 5 },
  { label: '6 colors', value: 6 },
  { label: '8 colors', value: 8 },
  { label: '10 colors', value: 10 }
]
const useCaseOptions = ['All', ...USE_CASES]
const disciplineOptions = ['All', ...DISCIPLINES]
const tagOptions = ['All', ...TAGS]

function getFilterValue(_group: string, option: string): string {
  if (option === 'All') return ''
  return option
}
</script>

<style scoped>
.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.search-container {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.search-input {
  flex: 1;
  height: 48px;
  padding: 0 1.25rem;
  font-size: 0.9375rem;
  border: 2px solid transparent;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 1rem;
  height: 48px;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.toggle-btn:hover {
  border-color: #cbd5e1;
  color: #475569;
}

.toggle-icon {
  font-size: 0.625rem;
}

.filter-groups {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-top: 0.5rem;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.filter-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-pill {
  padding: 0.4375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1.5px solid #e2e8f0;
  border-radius: 9999px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-pill:hover {
  border-color: #cbd5e1;
  color: #475569;
}

.filter-pill.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #2563eb;
}
</style>
