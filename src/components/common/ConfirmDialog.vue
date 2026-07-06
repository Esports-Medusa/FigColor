<template>
  <div class="confirm-overlay" @click.self="onCancel">
    <div class="confirm-dialog">
      <h3>{{ title }}</h3>
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button class="btn-danger" @click="onConfirm">
          {{ confirmText }}
        </button>
        <button class="btn-cancel" @click="onCancel">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  message: string
  confirmText?: string
}>(), {
  confirmText: 'Yes, remove'
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  emit('cancel')
}

// Expose props for template
const { title, message, confirmText } = props
void title; void message; void confirmText // suppress unused warning
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.confirm-dialog {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.confirm-dialog h3 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.confirm-message {
  color: #666;
  margin: 0 0 1.5rem;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.btn-danger {
  background: #c44;
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
}

.btn-danger:hover {
  background: #a33;
}

.btn-cancel {
  background: white;
  border: 1px solid #ddd;
  color: #666;
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
}

.btn-cancel:hover {
  background: #f5f5f5;
}
</style>