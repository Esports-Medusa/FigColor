<template>
  <Teleport to="body">
    <div class="confirm-overlay" @click.self="onCancel">
      <section
        ref="dialogPanel"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="describedBy"
        @keydown="onKeydown"
      >
        <h3 :id="titleId">{{ title }}</h3>
        <p :id="messageId" class="confirm-message">{{ message }}</p>
        <p v-if="description" :id="descriptionId" class="confirm-description">{{ description }}</p>
        <p v-if="statusChange" class="confirm-status" aria-label="Status change">{{ statusChange }}</p>
        <div class="confirm-actions">
          <button
            ref="cancelButton"
            type="button"
            class="btn-cancel"
            :disabled="pending"
            @click="onCancel"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            :class="confirmButtonClass"
            :disabled="pending"
            @click="onConfirm"
          >
            {{ pending ? pendingText : confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

let dialogInstance = 0

const props = withDefaults(defineProps<{
  title: string
  message: string
  description?: string
  statusChange?: string
  confirmText?: string
  cancelText?: string
  pending?: boolean
  pendingText?: string
  tone?: 'primary' | 'danger'
}>(), {
  description: '',
  statusChange: '',
  confirmText: 'Yes, remove',
  cancelText: 'Cancel',
  pending: false,
  pendingText: 'Working…',
  tone: 'danger'
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const instanceId = ++dialogInstance
const titleId = `confirm-dialog-title-${instanceId}`
const messageId = `confirm-dialog-message-${instanceId}`
const descriptionId = `confirm-dialog-description-${instanceId}`
const describedBy = computed(() => props.description ? `${messageId} ${descriptionId}` : messageId)
const confirmButtonClass = computed(() => props.tone === 'primary' ? 'btn-confirm-primary' : 'btn-danger')
const dialogPanel = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const previouslyFocused = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null
let previousBodyOverflow = ''

function onConfirm() {
  if (!props.pending) emit('confirm')
}

function onCancel() {
  if (!props.pending) emit('cancel')
}

function focusableElements(): HTMLElement[] {
  if (!dialogPanel.value) return []
  return Array.from(dialogPanel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('hidden'))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onCancel()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = focusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  cancelButton.value?.focus()
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow
  previouslyFocused?.focus()
})
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.52);
}

.confirm-dialog {
  width: min(100%, 440px);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.5rem;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.24);
}

.confirm-dialog h3 {
  margin: 0 0 0.75rem;
  color: var(--color-text, #1f2937);
  font-size: 1.125rem;
  line-height: 1.4;
}

.confirm-message,
.confirm-description {
  margin: 0;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.5;
}

.confirm-description {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.confirm-status {
  display: inline-block;
  margin: 1rem 0 0;
  padding: 0.35rem 0.6rem;
  color: var(--color-text, #374151);
  background: #f3f4f6;
  border-radius: var(--radius-md, 6px);
  font-size: 0.8125rem;
  font-weight: 600;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.confirm-actions button {
  min-height: 40px;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-md, 6px);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.confirm-actions button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.28);
  outline-offset: 2px;
}

.confirm-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-confirm-primary {
  color: #fff;
  background: var(--color-primary, #2563eb);
  border: 1px solid transparent;
}

.btn-confirm-primary:hover:not(:disabled) {
  background: var(--color-primary-dark, #1d4ed8);
}

.btn-danger {
  color: #fff;
  background: #c44;
  border: 1px solid transparent;
}

.btn-danger:hover:not(:disabled) {
  background: #a33;
}

.btn-cancel {
  color: var(--color-text-secondary, #4b5563);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #d1d5db);
}

.btn-cancel:hover:not(:disabled) {
  background: #f3f4f6;
}

@media (max-width: 480px) {
  .confirm-dialog {
    padding: 1.25rem;
  }

  .confirm-actions {
    flex-direction: column-reverse;
  }

  .confirm-actions button {
    width: 100%;
  }
}
</style>
