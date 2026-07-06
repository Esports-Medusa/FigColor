<template>
  <aside class="filter-sidebar">
    <h2 class="sidebar-title">Filters</h2>
    
    <div class="filter-section">
      <h3 class="filter-heading">Journal Style</h3>
      <ul class="filter-list">
        <li v-for="style in journalStyles" :key="style" class="filter-item">{{ style }}</li>
      </ul>
    </div>

    <div class="filter-section">
      <h3 class="filter-heading">Chart Type</h3>
      <ul class="filter-list">
        <li v-for="type in chartTypes" :key="type" class="filter-item">{{ type }}</li>
      </ul>
    </div>

    <div class="filter-section">
      <h3 class="filter-heading">Color Count</h3>
      <ul class="filter-list">
        <li v-for="count in colorCounts" :key="count" class="filter-item">{{ count }} colors</li>
      </ul>
    </div>

    <div class="filter-section">
      <h3 class="filter-heading">Use Case</h3>
      <ul class="filter-list">
        <li v-for="use in useCases" :key="use" class="filter-item">{{ use }}</li>
      </ul>
    </div>

    <div class="filter-section">
      <h3 class="filter-heading">Discipline</h3>
      <ul class="filter-list">
        <li v-for="discipline in disciplines" :key="discipline" class="filter-item">{{ discipline }}</li>
      </ul>
    </div>

    <div class="filter-section">
      <h3 class="filter-heading">Tags</h3>
      <div class="filter-tags">
        <span v-for="tag in tags" :key="tag" class="filter-tag">{{ tag }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { 
  JOURNAL_STYLES, 
  CHART_TYPES, 
  USE_CASES, 
  DISCIPLINES, 
  TAGS 
} from '@/types/palette'

const journalStyles = JOURNAL_STYLES
const chartTypes = CHART_TYPES
const colorCounts = [2, 3, 4, 5, 6, 8, 10]
const useCases = USE_CASES
const disciplines = DISCIPLINES
const tags = TAGS
</script>

<style scoped>
.filter-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.sidebar-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #333;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e5e7;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-heading {
  font-size: 0.875rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.filter-item {
  padding: 0.375rem 0;
  font-size: 0.875rem;
  color: #333;
  cursor: pointer;
  transition: color 0.15s;
}

.filter-item:hover {
  color: #0066cc;
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.filter-tag {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 4px;
  background-color: #f0f0f2;
  color: #666;
  cursor: pointer;
  transition: background-color 0.15s;
}

.filter-tag:hover {
  background-color: #e0e0e2;
}
</style>
