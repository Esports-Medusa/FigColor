export interface DeterministicRandom {
  next(): number
  int(min: number, max: number): number
  float(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
}

export function createDeterministicRandom(seed: number): DeterministicRandom {
  let state = seed >>> 0

  const next = (): number => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(min: number, max: number): number {
      assertRange(min, max)
      return Math.floor(next() * (max - min + 1)) + min
    },
    float(min: number, max: number): number {
      assertRange(min, max)
      return next() * (max - min) + min
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('Cannot pick from an empty array.')
      }
      return items[this.int(0, items.length - 1)]
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items]
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = this.int(0, index)
        const current = copy[index]
        copy[index] = copy[swapIndex]
        copy[swapIndex] = current
      }
      return copy
    }
  }
}

function assertRange(min: number, max: number): void {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error(`Invalid deterministic random range: ${min}..${max}.`)
  }
}
