import { createDeterministicRandom } from '@/lib/deterministic/random'
import { derivePreviewSeed, resolvePreviewSeed } from '@/lib/deterministic/seed'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const seedInput = {
  paletteId: 'palette-1',
  previewCaseId: 'preview-1',
  chartType: 'bar_error' as const,
  templateId: 'bar_error_v1',
  templateVersion: 1,
  schemaVersion: 1
}

function testStableSeedUsesStableIdentifiers(): void {
  const first = derivePreviewSeed(seedInput)
  const second = derivePreviewSeed({ ...seedInput })
  const changed = derivePreviewSeed({ ...seedInput, previewCaseId: 'preview-2' })

  expect(first === second, 'same stable identifiers should produce the same seed')
  expect(first !== changed, 'different preview case IDs should produce different seeds')
  expect(Number.isInteger(first) && first >= 0, 'seed should be an unsigned 32-bit integer')
}

function testFixedSeedStrategy(): void {
  const fixedSeed = resolvePreviewSeed({ ...seedInput, seedStrategy: 'fixed', seedValue: 123 })
  const stableSeed = resolvePreviewSeed({ ...seedInput, seedStrategy: 'stable_id', seedValue: null })

  expect(fixedSeed === 123, 'fixed seed strategy should use seed_value')
  expect(stableSeed === derivePreviewSeed(seedInput), 'stable_id strategy should derive from stable identifiers')
}

function testPrngDeterminism(): void {
  const first = createDeterministicRandom(42)
  const second = createDeterministicRandom(42)
  const third = createDeterministicRandom(43)

  const firstSequence = [first.next(), first.next(), first.next()]
  const secondSequence = [second.next(), second.next(), second.next()]
  const thirdSequence = [third.next(), third.next(), third.next()]

  expect(firstSequence.join(',') === secondSequence.join(','), 'same seed should produce same sequence')
  expect(firstSequence.join(',') !== thirdSequence.join(','), 'different seeds should produce different sequence')
}

function testPrngHelpers(): void {
  const random = createDeterministicRandom(7)
  const items = ['a', 'b', 'c', 'd']
  const shuffled = random.shuffle(items)

  expect(random.int(1, 3) >= 1 && random.int(1, 3) <= 3, 'int should stay inside inclusive range')
  expect(random.float(1, 2) >= 1 && random.float(1, 2) < 2, 'float should stay inside range')
  expect(items.join(',') === 'a,b,c,d', 'shuffle should not mutate input array')
  expect(shuffled.length === items.length, 'shuffle should preserve item count')
  expect(items.includes(random.pick(items)), 'pick should return an input item')
}

function testPreviewInfrastructureDoesNotUseMathRandom(): void {
  expect(!createDeterministicRandom.toString().includes('Math.random'), 'deterministic PRNG must not use Math.random')
}

testStableSeedUsesStableIdentifiers()
testFixedSeedStrategy()
testPrngDeterminism()
testPrngHelpers()
testPreviewInfrastructureDoesNotUseMathRandom()
