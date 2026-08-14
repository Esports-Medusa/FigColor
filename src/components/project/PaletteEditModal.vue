<template>
  <div class="modal-overlay" @click.self="onCancel">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Edit Palette: {{ paletteName }}</h3>
        <button class="btn-close" @click="onCancel">×</button>
      </div>

      <div class="modal-body">
        <div v-if="saveError" class="save-error" role="alert">{{ saveError }}</div>
        <!-- Palette Name -->
        <div class="form-group">
          <label>Palette Name</label>
          <input 
            v-model="localPaletteName" 
            type="text" 
            class="input-field"
            :class="{ error: nameError }"
            placeholder="Enter palette name"
          />
          <span v-if="nameError" class="error-text">Palette name is required</span>
        </div>

        <!-- Color Rows -->
        <div class="colors-section">
          <label>Colors</label>
          <div class="color-rows">
            <div 
              v-for="(role, idx) in localRoles" 
              :key="role.tempId"
              class="color-row"
            >
              <div class="color-picker-wrapper">
                <input 
                  type="color" 
                  :value="role.color"
                  @input="updateRoleColor(idx, ($event.target as HTMLInputElement).value)"
                  class="color-picker"
                />
                <div 
                  class="color-swatch-preview" 
                  :style="{ backgroundColor: role.color }"
                ></div>
              </div>
              
              <div class="color-inputs">
                <div class="input-group">
                  <label>HEX</label>
                  <input 
                    v-model="role.color"
                    type="text"
                    :class="['hex-input', { error: roleHexErrors[role.tempId] }]"
                    placeholder="#RRGGBB"
                    @input="validateHex(role.tempId)"
                  />
                </div>
                
                <div class="input-group">
                  <label>Role Label</label>
                  <input 
                    v-model="role.label"
                    type="text"
                    :class="['label-input', { error: !role.label.trim() }]"
                    placeholder="e.g., Control, Treatment"
                  />
                </div>

              </div>

              <button 
                class="btn-delete-color"
                @click="deleteRole(idx)"
                :disabled="localRoles.length <= 2"
                title="Delete color"
              >
                ×
              </button>
            </div>
          </div>

          <button class="btn-add-color" @click="addColor">
            + Add Color
          </button>
        </div>

        <!-- Preview -->
        <div class="preview-section">
          <label>Preview</label>
          <div class="preview-colors">
            <div 
              v-for="role in localRoles" 
              :key="role.tempId"
              class="preview-item"
            >
              <div 
                class="preview-swatch" 
                :style="{ backgroundColor: role.color }"
              ></div>
              <span class="preview-label">{{ role.label || 'Unnamed' }}</span>
              <span class="preview-hex">{{ role.color }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="onCancel">Cancel</button>
        <button 
          class="btn-save" 
          :disabled="!isValid || saving"
          @click="onSave"
        >
          {{ saving ? 'Saving…' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ProjectPalette, PaletteRole } from '@/types/project'
import { createUniqueRoleKey } from './paletteRoleKeys'

const props = defineProps<{
  palette: ProjectPalette
  saving?: boolean
  saveError?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', palette: ProjectPalette): void
}>()

// Local state with deep copy to avoid mutating original
interface LocalRole {
  tempId: string
  id: string
  key: string
  label: string
  color: string
  roleType: 'semantic' | 'group' | 'ui' | 'custom'
  order: number
  isNew: boolean
}

const localPaletteName = ref(props.palette.name)
const paletteName = localPaletteName  // For display in header
const nameError = ref(false)
const localRoles = ref<LocalRole[]>(
  props.palette.roles.map((r) => ({
    tempId: crypto.randomUUID(),
    id: r.id,
    key: r.key,
    label: r.label,
    color: r.color,
    roleType: r.roleType,
    order: r.order,
    isNew: false
  }))
)

const roleHexErrors = ref<Record<string, boolean>>({})

// Validate hex format
function validateHex(tempId: string) {
  const role = localRoles.value.find(r => r.tempId === tempId)
  if (role) {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/
    roleHexErrors.value[tempId] = !hexPattern.test(role.color)
  }
}

function updateRoleColor(idx: number, color: string) {
  localRoles.value[idx].color = color
  validateHex(localRoles.value[idx].tempId)
}

function addColor() {
  const maxOrder = Math.max(...localRoles.value.map(r => r.order), -1)
  const newRole: LocalRole = {
    tempId: crypto.randomUUID(),
    id: crypto.randomUUID(),
    key: '',
    label: '',
    color: '#808080',
    roleType: 'custom',
    order: maxOrder + 1,
    isNew: true
  }
  localRoles.value.push(newRole)
}

function deleteRole(idx: number) {
  if (localRoles.value.length <= 2) return
  localRoles.value.splice(idx, 1)
}

// Validation
const isValid = computed(() => {
  const hasName = localPaletteName.value.trim().length > 0
  const hasValidColors = localRoles.value.every(role => {
    return /^#[0-9A-Fa-f]{6}$/.test(role.color) && role.label.trim().length > 0
  })
  const noHexErrors = Object.values(roleHexErrors.value).every(e => !e)
  
  return hasName && hasValidColors && noHexErrors
})

function onCancel() {
  emit('close')
}

function onSave() {
  if (!isValid.value) return

  // Existing keys are stable compatibility identifiers. Generate keys only
  // for newly-added roles and never rewrite a key because its label changed.
  const usedKeys = localRoles.value.filter(role => !role.isNew).map(role => role.key)
  for (const role of localRoles.value) {
    validateHex(role.tempId)
    if (role.isNew) {
      role.key = createUniqueRoleKey(role.label, usedKeys)
      usedKeys.push(role.key)
    }
  }

  // Build updated roles
  const updatedRoles: PaletteRole[] = localRoles.value.map((role, index) => ({
    id: role.id,
    paletteId: props.palette.id,
    key: role.key,
    label: role.label,
    color: role.color,
    roleType: role.roleType,
    order: index,
    createdAt: props.palette.roles.find(r => r.id === role.id)?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }))

  const updatedPalette: ProjectPalette = {
    ...props.palette,
    name: localPaletteName.value.trim(),
    roles: updatedRoles,
    updatedAt: new Date().toISOString()
  }

  console.log('[PaletteEditModal] Saving palette:', updatedPalette)
  emit('update', updatedPalette)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
  padding: 0;
  line-height: 1;
}

.btn-close:hover {
  color: #666;
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.input-field {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
}

.input-field:focus {
  outline: none;
  border-color: #4A90A4;
}

.input-field.error {
  border-color: #E57373;
}

.error-text {
  font-size: 0.8rem;
  color: #E57373;
  margin-top: 0.25rem;
  display: block;
}

.save-error { margin-bottom: 1rem; padding: .75rem; border: 1px solid #f0b9b5; border-radius: var(--fc-radius-control); background: #fff5f4; color: var(--fc-danger); font-size: .875rem; }

.colors-section {
  margin-bottom: 1.5rem;
}

.colors-section > label {
  display: block;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: #333;
}

.color-rows {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
}

.color-picker-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
}

.color-picker {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.color-swatch-preview {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  pointer-events: none;
}

.color-inputs {
  flex: 1;
  display: flex;
  gap: 0.75rem;
}

.input-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.input-group label {
  font-size: 0.75rem;
  color: #888;
}

.hex-input,
.label-input {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: monospace;
}

.hex-input.error,
.label-input.error {
  border-color: #E57373;
  background: #FFEBEE;
}

.btn-delete-color {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  padding: 0.5rem;
}

.btn-delete-color:hover:not(:disabled) {
  color: #E57373;
}

.btn-delete-color:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-add-color {
  background: none;
  border: 1px dashed #4A90A4;
  color: #4A90A4;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  width: 100%;
  margin-top: 0.5rem;
  font-size: 0.95rem;
}

.btn-add-color:hover {
  background: #f0f7f9;
}

.preview-section {
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
}

.preview-section > label {
  display: block;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: #333;
}

.preview-colors {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.preview-swatch {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.preview-label {
  font-size: 0.8rem;
  color: #555;
}

.preview-hex {
  font-size: 0.75rem;
  font-family: monospace;
  color: #888;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e0e0e0;
}

.btn-cancel,
.btn-save {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: white;
  border: 1px solid #ddd;
  color: #666;
}

.btn-cancel:hover {
  background: #f5f5f5;
}

.btn-save {
  background: #4A90A4;
  border: none;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #3d7a8a;
}

.btn-save:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
