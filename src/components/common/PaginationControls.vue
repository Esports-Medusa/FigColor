<template>
  <nav v-if="totalPages > 1" class="pagination" :aria-label="ariaLabel">
    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === 1 || disabled"
      aria-label="First page"
      title="First page"
      @click="emitPage(1)"
    >
      &lt;&lt;
    </button>
    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === 1 || disabled"
      aria-label="Previous page"
      title="Previous page"
      @click="emitPage(currentPage - 1)"
    >
      &lt;
    </button>

    <div class="page-buttons" aria-label="Page numbers">
      <button
        v-for="page in visiblePages"
        :key="page"
        class="pagination-btn page-btn"
        type="button"
        :class="{ active: page === currentPage }"
        :disabled="page === currentPage || disabled"
        :aria-current="page === currentPage ? 'page' : undefined"
        @click="emitPage(page)"
      >
        {{ page }}
      </button>
    </div>

    <label class="page-jump">
      <span>Page</span>
      <input
        v-model="pageInput"
        type="number"
        inputmode="numeric"
        min="1"
        :max="totalPages"
        :disabled="disabled"
        @keyup.enter="jumpToInputPage"
        @blur="syncPageInput"
      />
      <span>of {{ totalPages }}</span>
    </label>
    <button
      class="pagination-btn jump-btn"
      type="button"
      :disabled="disabled"
      @click="jumpToInputPage"
    >
      Go
    </button>

    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === totalPages || disabled"
      aria-label="Next page"
      title="Next page"
      @click="emitPage(currentPage + 1)"
    >
      &gt;
    </button>
    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === totalPages || disabled"
      aria-label="Last page"
      title="Last page"
      @click="emitPage(totalPages)"
    >
      &gt;&gt;
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  currentPage: number
  totalPages: number
  disabled?: boolean
  ariaLabel?: string
}>(), {
  disabled: false,
  ariaLabel: 'Pagination'
})

const emit = defineEmits<{
  go: [page: number]
}>()

const pageInput = ref(String(props.currentPage))

const visiblePages = computed(() => {
  const total = Math.max(1, props.totalPages)
  const current = clampPage(props.currentPage)
  const windowSize = 5
  let start = Math.max(1, current - Math.floor(windowSize / 2))
  const end = Math.min(total, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

watch(
  () => props.currentPage,
  () => {
    syncPageInput()
  }
)

function emitPage(page: number) {
  const target = clampPage(page)
  if (target === props.currentPage || props.disabled) {
    return
  }
  emit('go', target)
}

function jumpToInputPage() {
  emitPage(Number(pageInput.value))
  syncPageInput()
}

function syncPageInput() {
  pageInput.value = String(clampPage(Number(pageInput.value) || props.currentPage))
}

function clampPage(page: number): number {
  const total = Math.max(1, props.totalPages)
  if (!Number.isFinite(page)) {
    return props.currentPage
  }
  return Math.min(total, Math.max(1, Math.trunc(page)))
}
</script>

<style scoped>
.pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.page-buttons {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.pagination-btn {
  height: 2.5rem;
  min-width: 2.5rem;
  padding: 0 0.75rem;
  border: 1px solid #d8e1ec;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.pagination-btn:hover:not(:disabled),
.pagination-btn.active {
  border-color: #4A90A4;
  color: #24576a;
  background: #eef9fc;
}

.pagination-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
  background: #f8fafc;
}

.icon-btn {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.page-jump {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #64748b;
  font-size: 0.875rem;
}

.page-jump input {
  width: 4rem;
  height: 2.5rem;
  border: 1px solid #d8e1ec;
  border-radius: 8px;
  color: #334155;
  text-align: center;
  font-size: 0.875rem;
}

.page-jump input:disabled {
  color: #94a3b8;
  background: #f8fafc;
}

.jump-btn {
  min-width: 3rem;
}

@media (max-width: 640px) {
  .page-buttons {
    order: 3;
    width: 100%;
    justify-content: center;
  }
}
</style>
