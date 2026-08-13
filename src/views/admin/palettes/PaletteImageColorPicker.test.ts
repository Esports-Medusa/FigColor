import appSource from '@/App.vue?raw'
import routerSource from '@/router/index.ts?raw'
import formSource from './AdminPaletteForm.vue?raw'
import pickerSource from './PaletteImageColorPicker.vue?raw'
import { appendCanonicalHex, MAX_LOCAL_IMAGE_BYTES, validateLocalImageFiles } from './imageColorInput'
import { mapContainedImagePoint, sampleMedianHex } from '../palette-assistant/imageColorPicker'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }
function file(name: string, type: string, size = 1): File { return new File([new Uint8Array(size)], name, { type }) }

expect(formSource.includes('<PaletteImageColorPicker v-if="!isEditing" @add-color="addSampledColor" />'), 'picker must render only on New Palette')
expect(formSource.includes('<AdminPreviewCaseEditor\n          v-if="isEditing"'), 'Scientific Preview Cases must only render after the Palette has been saved and opened for editing')
expect(!formSource.includes(':local-only="!isEditing"'), 'New Palette must not render a misleading local-only Preview Cases editor')
expect(!formSource.includes('ControlledVocabularySelect'), 'New/Edit Palette must retain its original single metadata inputs without Assistant controls')
expect(formSource.indexOf('id="colors"') < formSource.indexOf('<PaletteImageColorPicker'), 'picker must live immediately after the existing Colors source of truth')
expect(formSource.indexOf('<PaletteImageColorPicker') < formSource.indexOf('<div class="form-row">'), 'picker must stay in the main form column beside the Colors workflow')
expect(formSource.indexOf('<PaletteImageColorPicker') < formSource.indexOf('<!-- Preview Section -->'), 'picker must not render in the right Preview sidebar')
expect(formSource.includes('const result = appendCanonicalHex(colorsInput.value, hex)') && formSource.includes('colorsInput.value = result.value'), 'sampled HEX must update the existing Colors source of truth')
expect(formSource.includes('await createPalette(data)') && formSource.includes('const data = buildPalettePayload()'), 'existing New Palette create handler and payload path must remain')
expect(!pickerSource.includes('/analyze') && !pickerSource.includes('fetch(') && !pickerSource.includes('localStorage'), 'local picker must not upload or persist images')
expect(pickerSource.includes('URL.revokeObjectURL') && pickerSource.includes("emit('add-color'"), 'picker must release Blob URLs and emit only a HEX value')
expect(pickerSource.includes('@dragover.prevent') && pickerSource.includes('@drop.prevent') && pickerSource.includes('handleFiles(input.files') && pickerSource.includes('handleFiles(event.dataTransfer?.files'), 'click/drop must share validation and prevent navigation')
expect(!appSource.includes('>Assistant</router-link>'), 'Admin navigation must not expose Assistant')
expect(routerSource.includes("redirect: '/admin/palettes/new'") && routerSource.includes('requiresAdmin: true'), 'legacy Assistant route must safely redirect behind Admin guard')

expect(validateLocalImageFiles([]).error.length > 0, 'empty selection must fail')
expect(validateLocalImageFiles([file('a.png', 'image/png'), file('b.png', 'image/png')]).error.length > 0, 'multiple files must fail')
expect(validateLocalImageFiles([file('a.gif', 'image/gif')]).error.length > 0, 'invalid MIME must fail')
expect(validateLocalImageFiles([file('a.png', 'image/png', 0)]).error.length > 0, 'empty file must fail')
expect(validateLocalImageFiles([file('a.png', 'image/png', MAX_LOCAL_IMAGE_BYTES + 1)]).error.includes('6 MiB'), 'oversized file must fail')
expect(validateLocalImageFiles([file('a.jpg', 'image/jpeg')]).file !== null, 'JPEG must pass')

const appended = appendCanonicalHex('#4e79a7\n#F28E2B', '#59a14f')
expect(appended.added && appended.value === '#4e79a7\n#F28E2B\n#59A14F', 'sampled HEX must append canonically without rewriting existing text')
expect(!appendCanonicalHex(appended.value, '#59a14f').added, 'canonical duplicate must not append')
expect(appendCanonicalHex('#4E79A', '#59A14F').value === '#4E79A', 'incomplete input must remain untouched')
expect(appendCanonicalHex('#4E79A7', '#59A150').added, 'nearby but distinct HEX values must remain distinct')

expect(mapContainedImagePoint(500, 100, { left: 0, top: 0, width: 1000, height: 1000 }, 2000, 1000) === null, 'letterbox must not sample')
const pixels = new Uint8ClampedArray(25 * 4); for (let i = 0; i < 25; i++) pixels.set([20, 100, 200, 255], i * 4); pixels.set([255, 0, 0, 255], 12 * 4)
expect(sampleMedianHex(pixels, 5, 5, 2, 2, 5) === '#1464C8', 'median sample must reject one outlier')
expect(sampleMedianHex(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1, 0, 0, 5) === null, 'fully transparent sample must be ignored')
