import type { AdminPalette } from '@/api/admin'
import {
  createCandidatePublicationController,
  createCandidatePublicationState,
  isCandidatePublicationEligible,
  type CandidatePublicationEligibility
} from './CandidatePublication.logic'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function palette(status: AdminPalette['status'] = 'candidate', overrides: Partial<AdminPalette> = {}): AdminPalette {
  return {
    id: 'candidate-1', slug: 'candidate-1', name: 'Candidate', colors: [], color_count: 1,
    type: 'categorical', chart_types: [], journal_style: [], discipline: [], use_case: [], tags: [],
    accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false },
    source_type: 'curated', status, visibility: 'public', created_at: '', updated_at: '', ...overrides
  }
}

function eligibility(overrides: Partial<CandidatePublicationEligibility> = {}): CandidatePublicationEligibility {
  return { editing: true, authenticatedAdmin: true, canonicalStatus: 'candidate', dirty: false, publishing: false, ...overrides }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function testEligibilityDirtyAndConfirmation(): Promise<void> {
  expect(isCandidatePublicationEligible(eligibility()), 'canonical candidate should be eligible')
  for (const input of [
    eligibility({ editing: false }), eligibility({ authenticatedAdmin: false }),
    eligibility({ canonicalStatus: 'draft' }), eligibility({ canonicalStatus: 'published' }),
    eligibility({ dirty: true }), eligibility({ publishing: true })
  ]) expect(!isCandidatePublicationEligible(input), 'non-candidate, dirty, non-admin, or publishing state must be ineligible')

  let confirmations = 0
  let publications = 0
  let current = eligibility({ dirty: true })
  const state = createCandidatePublicationState()
  const controller = createCandidatePublicationController({
    state, paletteID: () => 'candidate-1', eligibility: () => current,
    confirm: () => { confirmations++; return true },
    publish: async () => { publications++; return palette('published') },
    reload: async () => palette(), applyCanonical: () => {}
  })
  expect(await controller.attempt() === 'ineligible', 'dirty form should be rejected')
  expect(confirmations === 0 && publications === 0, 'dirty form must not confirm or call publication API')
  current = eligibility()
  const cancelled = createCandidatePublicationController({
    state, paletteID: () => 'candidate-1', eligibility: () => current,
    confirm: () => { confirmations++; return false },
    publish: async () => { publications++; return palette('published') },
    reload: async () => palette(), applyCanonical: () => {}
  })
  expect(await cancelled.attempt() === 'cancelled', 'cancelled confirmation should stop publication')
  expect(publications === 0, 'cancelled confirmation must not call publication API')
}

async function testSuccessDuplicateProtectionAndMalformedResponse(): Promise<void> {
  const pending = deferred<AdminPalette>()
  const state = createCandidatePublicationState()
  let calls = 0
  let confirmations = 0
  const applied: AdminPalette[] = []
  const controller = createCandidatePublicationController({
    state, paletteID: () => 'candidate-1', eligibility: () => eligibility({ publishing: state.publishing }),
    confirm: () => { confirmations++; return true }, publish: async () => { calls++; return pending.promise },
    reload: async () => palette(), applyCanonical: (value) => { applied.push(value) }
  })
  const first = controller.attempt()
  const second = controller.attempt()
  expect(await second === 'duplicate', 'same-tick second trigger must be rejected')
  expect(confirmations === 1 && calls === 1, 'same-tick triggers must produce one confirmation and one request')
  pending.resolve(palette('published'))
  expect(await first === 'published', 'valid canonical response should publish')
  expect(applied[0]?.status === 'published' && !state.publishing && state.message.length > 0, 'success must apply canonical published state and clear loading')
  expect(!isCandidatePublicationEligible(eligibility({ canonicalStatus: applied[0].status })), 'published canonical state must remove eligibility')

  const malformedState = createCandidatePublicationState()
  const malformed = createCandidatePublicationController({
    state: malformedState, paletteID: () => 'candidate-1', eligibility,
    confirm: () => true, publish: async () => palette('published', { id: 'different-id' }),
    reload: async () => palette(), applyCanonical: () => { throw new Error('malformed response was applied') }
  })
  expect(await malformed.attempt() === 'failed', 'malformed success must fail')
  expect(malformedState.error.includes('invalid publication response') && !malformedState.message, 'malformed success must not show success')
}

async function testErrorsReconciliationAndRetry(): Promise<void> {
  for (const status of [401, 403, 409, 422]) {
    const state = createCandidatePublicationState()
    const issue = { path: 'colors', code: 'INVALID', message: 'Invalid colors.' }
    const controller = createCandidatePublicationController({
      state, paletteID: () => 'candidate-1', eligibility,
      confirm: () => true,
      publish: async () => { throw Object.assign(new Error('publication failed'), { status, issues: status === 422 ? [issue] : [] }) },
      reload: async () => palette(), applyCanonical: () => {}
    })
    expect(await controller.attempt() === 'failed', `status ${status} should remain a failure`)
    expect(state.errorStatus === status && !state.publishing, `status ${status} and loading recovery must be retained`)
    expect(status !== 422 || state.issues[0]?.code === 'INVALID', '422 issues must map inline')
  }

  const applied: AdminPalette[] = []
  const reconciledState = createCandidatePublicationState()
  const reconciled = createCandidatePublicationController({
    state: reconciledState, paletteID: () => 'candidate-1', eligibility,
    confirm: () => true, publish: async () => { throw new TypeError('lost response') },
    reload: async () => palette('published'), applyCanonical: (value) => { applied.push(value) }
  })
  expect(await reconciled.attempt() === 'reconciled-published' && applied[0]?.status === 'published', 'lost response should accept canonical published detail')

  let attempts = 0
  const retryState = createCandidatePublicationState()
  const retry = createCandidatePublicationController({
    state: retryState, paletteID: () => 'candidate-1', eligibility: () => eligibility({ publishing: retryState.publishing }),
    confirm: () => true,
    publish: async () => { attempts++; if (attempts === 1) throw new TypeError('network failed'); return palette('published') },
    reload: async () => palette('candidate'), applyCanonical: () => {}
  })
  expect(await retry.attempt() === 'failed' && retryState.error.length > 0, 'canonical candidate should preserve failure and permit explicit retry')
  expect(await retry.attempt() === 'published' && attempts === 2, 'explicit retry should be possible after candidate reconciliation')

  const uncertainState = createCandidatePublicationState()
  const uncertain = createCandidatePublicationController({
    state: uncertainState, paletteID: () => 'candidate-1', eligibility,
    confirm: () => true, publish: async () => { throw new TypeError('network failed') },
    reload: async () => { throw new Error('reload failed') }, applyCanonical: () => {}
  })
  expect(await uncertain.attempt() === 'failed' && !uncertainState.message, 'failed reconciliation must not guess success')
}

await testEligibilityDirtyAndConfirmation()
await testSuccessDuplicateProtectionAndMalformedResponse()
await testErrorsReconciliationAndRetry()
