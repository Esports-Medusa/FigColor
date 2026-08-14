import detailSource from '@/views/ProjectDetailView.vue?raw'
import apiSource from '@/lib/projectApi.ts?raw'
import modalSource from './PaletteEditModal.vue?raw'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

expect(apiSource.includes('async updateProjectPalette'), 'Project API should expose palette persistence')
expect(apiSource.includes("method: 'PUT'"), 'Project palette persistence should use the scoped PUT endpoint')
expect(detailSource.includes('await projectApi.updateProjectPalette'), 'Palette edits should be persisted before updating UI state')
expect(detailSource.includes('await loadProject()'), 'Successful palette edits should reload authoritative server state')
expect(detailSource.includes('existingRoleIds.has(role.id) ? { id: role.id } : {}'), 'New client roles should not send temporary IDs as database identity')
expect(detailSource.includes('paletteSaveError.value = error instanceof Error'), 'Palette API failures should remain visible in the editor')
expect(!detailSource.includes('palettes.value[idx] = updatedPalette'), 'Unsaved palette edits should not be treated as persisted state')
expect(modalSource.includes("saving ? 'Saving…' : 'Save Changes'"), 'Palette editor should expose its saving state')
expect(!modalSource.includes("emit('update', updatedPalette)\n  emit('close')"), 'Palette editor should not close before persistence succeeds')
