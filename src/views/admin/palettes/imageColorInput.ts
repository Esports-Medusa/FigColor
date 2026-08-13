export const MAX_LOCAL_IMAGE_BYTES = 6 * 1024 * 1024

export function validateLocalImageFiles(files: ArrayLike<File>): { file: File | null; error: string } {
  if (files.length !== 1) return { file: null, error: 'Choose exactly one PNG or JPEG image.' }
  const file = files[0]
  if (!['image/png', 'image/jpeg'].includes(file.type)) return { file: null, error: 'Only PNG and JPEG images are supported.' }
  if (file.size === 0) return { file: null, error: 'The selected image is empty.' }
  if (file.size > MAX_LOCAL_IMAGE_BYTES) return { file: null, error: 'The encoded image must not exceed 6 MiB.' }
  return { file, error: '' }
}

export function appendCanonicalHex(colorsInput: string, sampledHex: string): { value: string; added: boolean; error: string } {
  const hex = sampledHex.trim().toUpperCase()
  if (!/^#[0-9A-F]{6}$/.test(hex)) return { value: colorsInput, added: false, error: 'The sampled color is not a valid six-digit HEX value.' }
  const nonEmptyLines = colorsInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (nonEmptyLines.some((line) => !/^#[0-9A-Fa-f]{6}$/.test(line))) {
    return { value: colorsInput, added: false, error: 'Fix the incomplete or invalid Colors value before adding a sampled color.' }
  }
  if (nonEmptyLines.some((line) => line.toUpperCase() === hex)) return { value: colorsInput, added: false, error: 'This color is already in the palette.' }
  const separator = colorsInput.length > 0 && !colorsInput.endsWith('\n') ? '\n' : ''
  return { value: `${colorsInput}${separator}${hex}`, added: true, error: '' }
}
