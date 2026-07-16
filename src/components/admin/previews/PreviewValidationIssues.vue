<template>
  <div v-if="issues.length > 0" class="validation-issues" role="alert">
    <div v-for="group in groupedIssues" :key="group.title" class="issue-group">
      <h4>{{ group.title }}</h4>
      <ul>
        <li v-for="issue in group.issues" :key="`${issue.path}:${issue.code}:${issue.message}`">
          <code>{{ issue.path }}</code>
          <span>{{ issue.message }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ValidationIssue } from '@/types/palette'

interface Props {
  issues: ValidationIssue[]
}

const props = defineProps<Props>()

const groupedIssues = computed(() => {
  const groups = new Map<string, ValidationIssue[]>()
  props.issues.forEach((issue) => {
    const title = issue.path.startsWith('color_roles')
      ? 'Roles'
      : issue.path.startsWith('preview_config')
        ? 'Config'
        : 'Preview'
    groups.set(title, [...(groups.get(title) ?? []), issue])
  })

  return Array.from(groups.entries()).map(([title, issues]) => ({ title, issues }))
})
</script>

<style scoped>
.validation-issues {
  display: grid;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff1f2;
}

.issue-group h4 {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #991b1b;
}

.issue-group ul {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.issue-group li {
  display: grid;
  gap: 0.2rem;
  color: #7f1d1d;
  font-size: 0.75rem;
}

.issue-group code {
  width: fit-content;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
  background: rgba(127, 29, 29, 0.08);
  color: #7f1d1d;
  font-size: 0.6875rem;
}
</style>
