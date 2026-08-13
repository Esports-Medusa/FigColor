<template>
  <div class="image-picker-card">
    <h3>Pick colors from image</h3>
    <p class="helper">The image stays in this browser and is never submitted with the palette.</p>
    <input ref="fileInput" class="visually-hidden" type="file" accept="image/png,image/jpeg" @change="onFileChange" />
    <div class="drop-zone" :class="{ dragging }" role="button" tabindex="0" @click="openChooser" @keydown.enter.prevent="openChooser" @keydown.space.prevent="openChooser" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
      <strong>Drop one PNG or JPEG here, or choose an image</strong>
      <span>Maximum encoded size: 6 MiB</span>
    </div>
    <p v-if="error" class="picker-error" role="alert">{{ error }}</p>
    <template v-if="imageUrl">
      <div ref="stage" class="image-stage" :class="{ picking }" @mousemove="onPointerMove" @mouseleave="hover = null" @click="lockSample">
        <img ref="image" :src="imageUrl" alt="Local image for color picking" @load="onImageLoad" @error="onImageError" />
        <div v-if="picking && hover" class="magnifier-popover" :style="{ left: `${hover.offsetX + 14}px`, top: `${hover.offsetY + 14}px` }">
          <canvas ref="magnifier" />
          <span><i :style="{ background: hover.hex }" />{{ hover.hex }}</span>
        </div>
      </div>
      <canvas ref="sourceCanvas" class="visually-hidden" />
      <div class="image-meta"><strong>{{ imageName }}</strong><span>{{ dimensions }}</span></div>
      <div class="picker-actions">
        <button type="button" class="btn btn-primary" :disabled="!ready" @click="togglePicking">{{ picking ? 'Done picking' : 'Start picking' }}</button>
        <button type="button" class="btn btn-secondary" @click="removeImage">Remove image</button>
      </div>
      <p v-if="picking" class="helper">Move over the image and click to lock a 5×5 median sample. Press Escape to finish.</p>
      <div v-if="pendingHex" class="pending-color">
        <span><i :style="{ background: pendingHex }" /><strong>{{ pendingHex }}</strong></span>
        <button type="button" class="btn btn-primary" @click="addPending">Add to palette</button>
        <button type="button" class="btn btn-secondary" @click="pendingHex = ''">Cancel</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { drawMagnifier, mapContainedImagePoint, sampleMedianHex } from '../palette-assistant/imageColorPicker'
import { validateLocalImageFiles } from './imageColorInput'

const emit = defineEmits<{ (event: 'add-color', hex: string): void }>()
const fileInput = ref<HTMLInputElement | null>(null)
const image = ref<HTMLImageElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const sourceCanvas = ref<HTMLCanvasElement | null>(null)
const magnifier = ref<HTMLCanvasElement | null>(null)
const imageUrl = ref('')
const imageName = ref('')
const dimensions = ref('')
const error = ref('')
const dragging = ref(false)
const ready = ref(false)
const picking = ref(false)
const pendingHex = ref('')
const hover = ref<{ hex: string; x: number; y: number; offsetX: number; offsetY: number } | null>(null)
let dragDepth = 0

function openChooser() { fileInput.value?.click() }
function onFileChange(event: Event) { const input = event.target as HTMLInputElement; handleFiles(input.files ?? []); input.value = '' }
function handleFiles(files: ArrayLike<File>) {
  const result = validateLocalImageFiles(files)
  error.value = result.error
  if (!result.file) return
  setImage(result.file)
}
function setImage(file: File) {
  revokeUrl()
  resetInspection()
  imageName.value = file.name
  imageUrl.value = URL.createObjectURL(file)
}
function revokeUrl() { if (imageUrl.value) URL.revokeObjectURL(imageUrl.value); imageUrl.value = '' }
function removeImage() { revokeUrl(); resetInspection(); imageName.value = ''; dimensions.value = ''; error.value = '' }
function resetInspection() { ready.value = false; picking.value = false; pendingHex.value = ''; hover.value = null }
function onDragEnter() { dragDepth += 1; dragging.value = true }
function onDragOver(event: DragEvent) { event.preventDefault(); dragging.value = true; if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy' }
function onDragLeave() { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) dragging.value = false }
function onDrop(event: DragEvent) { event.preventDefault(); dragDepth = 0; dragging.value = false; handleFiles(event.dataTransfer?.files ?? []) }
function onImageLoad() {
  const element = image.value, canvas = sourceCanvas.value
  if (!element || !canvas) return
  canvas.width = element.naturalWidth; canvas.height = element.naturalHeight
  canvas.getContext('2d', { willReadFrequently: true })?.drawImage(element, 0, 0)
  dimensions.value = `${element.naturalWidth} × ${element.naturalHeight}px`; ready.value = true
}
function onImageError() { revokeUrl(); resetInspection(); imageName.value = ''; dimensions.value = ''; error.value = 'The selected image could not be decoded.' }
function togglePicking() { picking.value = !picking.value; pendingHex.value = ''; hover.value = null }
function sample(event: MouseEvent) {
  const canvas = sourceCanvas.value, container = stage.value
  if (!picking.value || !ready.value || !canvas || !container) return null
  const point = mapContainedImagePoint(event.clientX, event.clientY, container.getBoundingClientRect(), canvas.width, canvas.height)
  if (!point) return null
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return null
  const radius = 2, startX = Math.max(0, point.x - radius), startY = Math.max(0, point.y - radius)
  const width = Math.min(canvas.width - startX, 5), height = Math.min(canvas.height - startY, 5)
  const pixels = context.getImageData(startX, startY, width, height)
  const hex = sampleMedianHex(pixels.data, width, height, point.x - startX, point.y - startY, 5)
  if (!hex) return null
  const rect = container.getBoundingClientRect()
  return { hex, x: point.x, y: point.y, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
}
function onPointerMove(event: MouseEvent) { hover.value = sample(event); if (hover.value && magnifier.value && sourceCanvas.value) drawMagnifier(magnifier.value, sourceCanvas.value, hover.value.x, hover.value.y) }
function lockSample(event: MouseEvent) { const result = sample(event); if (result) pendingHex.value = result.hex }
function addPending() { if (!pendingHex.value) return; emit('add-color', pendingHex.value); pendingHex.value = '' }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape' && picking.value) togglePicking() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); revokeUrl() })
</script>

<style scoped>
.image-picker-card{margin-top:1rem;padding:1.25rem;background:#fff;border:1px solid #e5e7eb;border-radius:8px}.image-picker-card h3{margin:0 0 .4rem}.helper{font-size:.75rem;color:#6b7280}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.drop-zone{display:grid;gap:.3rem;margin:.9rem 0;padding:1rem;text-align:center;border:2px dashed #cbd5e1;border-radius:8px;cursor:pointer}.drop-zone.dragging{border-color:#2563eb;background:#eff6ff}.drop-zone span{font-size:.75rem;color:#6b7280}.picker-error{color:#dc2626;font-size:.8rem}.image-stage{position:relative;width:100%;height:min(500px,55vh);overflow:hidden;background:#f3f4f6;border-radius:8px}.image-stage.picking{cursor:crosshair}.image-stage>img{width:100%;height:100%;display:block;object-fit:contain}.magnifier-popover{position:absolute;z-index:2;pointer-events:none;padding:.35rem;background:white;border-radius:7px;box-shadow:0 5px 18px #0003}.magnifier-popover canvas{display:block;border-radius:50%;border:2px solid white}.magnifier-popover span,.pending-color span{display:flex;align-items:center;gap:.4rem;font-family:monospace}.magnifier-popover i,.pending-color i{width:1.25rem;height:1.25rem;border:1px solid #d1d5db;border-radius:4px}.image-meta{display:flex;justify-content:space-between;gap:.5rem;margin:.6rem 0;font-size:.75rem;color:#6b7280}.picker-actions,.pending-color{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}.pending-color{margin-top:.75rem;padding:.75rem;background:#f9fafb;border-radius:7px}.pending-color span{margin-right:auto}
</style>
