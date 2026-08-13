export interface RectLike { left: number; top: number; width: number; height: number }
export interface ImagePoint { x: number; y: number; contentLeft: number; contentTop: number; contentWidth: number; contentHeight: number }

export function mapContainedImagePoint(
  clientX: number,
  clientY: number,
  rect: RectLike,
  naturalWidth: number,
  naturalHeight: number
): ImagePoint | null {
  if (rect.width <= 0 || rect.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
  const contentWidth = naturalWidth * scale
  const contentHeight = naturalHeight * scale
  const contentLeft = rect.left + (rect.width - contentWidth) / 2
  const contentTop = rect.top + (rect.height - contentHeight) / 2
  if (clientX < contentLeft || clientX >= contentLeft + contentWidth || clientY < contentTop || clientY >= contentTop + contentHeight) return null
  return {
    x: Math.min(naturalWidth - 1, Math.max(0, Math.floor((clientX - contentLeft) / scale))),
    y: Math.min(naturalHeight - 1, Math.max(0, Math.floor((clientY - contentTop) / scale))),
    contentLeft, contentTop, contentWidth, contentHeight
  }
}

export function sampleMedianHex(data: Uint8ClampedArray, width: number, height: number, centerX: number, centerY: number, sampleSize = 5): string | null {
  if (width <= 0 || height <= 0 || data.length !== width * height * 4 || sampleSize < 1 || sampleSize % 2 === 0) return null
  const radius = Math.floor(sampleSize / 2)
  const channels: [number[], number[], number[]] = [[], [], []]
  for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y++) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x++) {
      const offset = (y * width + x) * 4
      const alpha = data[offset + 3] / 255
      if (alpha === 0) continue
      channels[0].push(Math.round(data[offset] * alpha + 255 * (1 - alpha)))
      channels[1].push(Math.round(data[offset + 1] * alpha + 255 * (1 - alpha)))
      channels[2].push(Math.round(data[offset + 2] * alpha + 255 * (1 - alpha)))
    }
  }
  if (channels[0].length === 0) return null
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  return `#${channels.map((values) => median(values).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function drawMagnifier(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  devicePixelRatio = window.devicePixelRatio || 1
): void {
  const cssSize = 96
  canvas.width = cssSize * devicePixelRatio
  canvas.height = cssSize * devicePixelRatio
  canvas.style.width = `${cssSize}px`
  canvas.style.height = `${cssSize}px`
  const context = canvas.getContext('2d')
  if (!context) return
  context.imageSmoothingEnabled = false
  const sourceSize = 11
  context.drawImage(source, x - Math.floor(sourceSize / 2), y - Math.floor(sourceSize / 2), sourceSize, sourceSize, 0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#ffffff'
  context.lineWidth = Math.max(1, devicePixelRatio)
  context.strokeRect(canvas.width / 2 - 4 * devicePixelRatio, canvas.height / 2 - 4 * devicePixelRatio, 8 * devicePixelRatio, 8 * devicePixelRatio)
}
