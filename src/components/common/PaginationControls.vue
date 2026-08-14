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
      <span aria-hidden="true">«</span>
    </button>
    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === 1 || disabled"
      aria-label="Previous page"
      title="Previous page"
      @click="emitPage(currentPage - 1)"
    >
      <span aria-hidden="true">‹</span>
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

    <div class="jump-cluster">
      <label class="page-jump">
        <span>Page</span>
        <input
          v-model="pageInput"
          type="number"
          inputmode="numeric"
          min="1"
          :max="totalPages"
          :disabled="disabled"
          :aria-label="`Page number, ${totalPages} pages total`"
          @keyup.enter="jumpToInputPage"
          @blur="syncPageInput"
        />
        <span class="page-total">of {{ totalPages }}</span>
      </label>
      <button
        class="pagination-btn jump-btn"
        type="button"
        :disabled="disabled"
        @click="jumpToInputPage"
      >
        Go
      </button>
    </div>

    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === totalPages || disabled"
      aria-label="Next page"
      title="Next page"
      @click="emitPage(currentPage + 1)"
    >
      <span aria-hidden="true">›</span>
    </button>
    <button
      class="pagination-btn icon-btn"
      type="button"
      :disabled="currentPage === totalPages || disabled"
      aria-label="Last page"
      title="Last page"
      @click="emitPage(totalPages)"
    >
      <span aria-hidden="true">»</span>
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
  gap: 0.625rem;
  padding-top: 1rem;
}

.page-buttons {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.pagination-btn {
  height: 2.375rem;
  min-width: 2.375rem;
  padding: 0 0.75rem;
  border: 1px solid #d8e1ec;
  border-radius: var(--fc-radius-control);
  background: #fff;
  color: #334155;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.pagination-btn:hover:not(:disabled),
.pagination-btn.active {
  border-color: var(--fc-primary);
  color: var(--fc-primary);
  background: var(--fc-primary-soft);
}

.pagination-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
  background: #f8fafc;
}

.icon-btn {
  padding: 0;
  font-family: inherit;
  font-size: 1.15rem;
}

.jump-cluster {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  white-space: nowrap;
}

.page-jump {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #64748b;
  font-size: 0.875rem;
  white-space: nowrap;
}

.page-jump input {
  flex: 0 0 3.5rem;
  width: 3.5rem !important;
  min-width: 3.5rem !important;
  height: 2.375rem;
  border: 1px solid #d8e1ec;
  border-radius: var(--fc-radius-control);
  color: #334155;
  text-align: center;
  font-size: 0.875rem;
}

.page-jump input:disabled {
  color: #94a3b8;
  background: #f8fafc;
}

.jump-btn {
  min-width: 2.75rem;
}

@media (max-width: 640px) {
  .page-buttons {
    order: 3;
    width: 100%;
    justify-content: center;
  }

  .jump-cluster {
    order: 4;
  }
}
</style>
