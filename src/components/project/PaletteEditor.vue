<template>
  <div class="palette-editor">
    <div class="palette-header">
      <h3>{{ palette.name }}</h3>
      <button class="btn-close" @click="$emit('close')">×</button>
    </div>

    <div class="roles-list">
      <div v-for="role in palette.roles" :key="role.id" class="role-item">
        <div class="role-color-wrapper">
          <input
            type="color"
            :value="role.color"
            @input="updateColor(role.id, ($event.target as HTMLInputElement).value)"
            class="color-input"
          />
          <span class="color-preview" :style="{ backgroundColor: role.color }"></span>
        </div>
        <div class="role-info">
          <input
            v-model="role.label"
            class="role-label-input"
            placeholder="Role label"
            @change="updateRole(role)"
          />
          <span class="role-key">{{ role.key }}</span>
          <span class="color-hex">{{ role.color }}</span>
        </div>
      </div>
    </div>

    <div class="editor-actions">
      <button class="btn-save" @click="saveChanges">Save Changes</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ProjectPalette, PaletteRole } from '@/types/project'
import { projectApi } from '@/lib/projectApi'

const props = defineProps<{
  palette: ProjectPalette
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', palette: ProjectPalette): void
}>()

const localRoles = ref([...props.palette.roles.map(r => ({ ...r }))])

function updateColor(roleId: string, color: string) {
  const role = localRoles.value.find(r => r.id === roleId)
  if (role) {
    role.color = color
  }
}

function updateRole(role: PaletteRole) {
  const idx = localRoles.value.findIndex(r => r.id === role.id)
  if (idx !== -1) {
    localRoles.value[idx] = { ...role }
  }
}

async function saveChanges() {
  for (const role of localRoles.value) {
    const original = props.palette.roles.find(r => r.id === role.id)
    if (original && original.color !== role.color) {
      try {
        await projectApi.updateRoleColor(props.projectId, props.palette.id, role.id, { color: role.color })
      } catch (e) {
        console.error('Failed to update role color:', e)
      }
    }
  }
  
  emit('update', { ...props.palette, roles: localRoles.value })
  emit('close')
}
</script>

<style scoped>
.palette-editor {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
}

.palette-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.palette-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
}

.roles-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: #f9f9f9;
  border-radius: 6px;
}

.role-color-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
}

.color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.color-preview {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  pointer-events: none;
}

.role-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.role-label-input {
  border: 1px solid #ddd;
  padding: 0.5rem;
  border-radius: 4px;
  width: 150px;
}

.role-key {
  font-family: monospace;
  font-size: 0.85rem;
  color: #666;
}

.color-hex {
  font-family: monospace;
  font-size: 0.85rem;
  color: #999;
}

.editor-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
}

.btn-save {
  background: #4A90A4;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
}
</style>