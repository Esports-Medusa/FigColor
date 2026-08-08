import type { AdminPalette } from '@/api/admin'
import { createCandidatePublicationController, createCandidatePublicationState } from './CandidatePublication.logic'
import { createCandidateRejectionController, createCandidateRejectionState } from './CandidateRejection.logic'
import { createCandidateTransitionCoordinator } from './CandidateTransition.logic'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function palette(status: AdminPalette['status']): AdminPalette {
  return {
    id: 'candidate-1', slug: 'candidate-1', name: 'Candidate', colors: [], color_count: 1,
    type: 'categorical', chart_types: [], journal_style: [], discipline: [], use_case: [], tags: [],
    accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false },
    source_type: 'curated', status, visibility: 'public', created_at: '', updated_at: ''
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function testCrossActionOrder(firstAction: 'publish' | 'reject'): Promise<void> {
  const coordinator = createCandidateTransitionCoordinator()
  const publication = deferred<AdminPalette>()
  const rejection = deferred<AdminPalette>()
  let confirmations = 0
  let publicationCalls = 0
  let rejectionCalls = 0
  const publicationController = createCandidatePublicationController({
    state: createCandidatePublicationState(), transitionCoordinator: coordinator,
    paletteID: () => 'candidate-1',
    eligibility: () => ({ editing: true, authenticatedAdmin: true, canonicalStatus: 'candidate', dirty: false, publishing: false }),
    confirm: () => { confirmations += 1; return true },
    publish: async () => { publicationCalls += 1; return publication.promise },
    reload: async () => palette('candidate'), applyCanonical: () => {}
  })
  const rejectionController = createCandidateRejectionController({
    state: createCandidateRejectionState(), transitionCoordinator: coordinator,
    paletteID: () => 'candidate-1',
    eligibility: () => ({ editing: true, authenticatedAdmin: true, importedCandidate: true, canonicalStatus: 'candidate', dirty: false, conflictingAction: false }),
    confirm: () => { confirmations += 1; return true },
    reject: async () => { rejectionCalls += 1; return rejection.promise },
    reload: async () => palette('candidate'), applyCanonical: () => {}
  })

  const first = firstAction === 'publish' ? publicationController.attempt() : rejectionController.attempt()
  const second = firstAction === 'publish' ? rejectionController.attempt() : publicationController.attempt()
  expect(await second === 'duplicate', `${firstAction}: competing same-tick action must be duplicate`)
  expect(confirmations === 1, `${firstAction}: same-tick actions must produce one confirmation`)
  expect(publicationCalls + rejectionCalls === 1, `${firstAction}: same-tick actions must produce one request`)

  if (firstAction === 'publish') publication.resolve(palette('published'))
  else rejection.resolve(palette('archived'))
  expect(await first === (firstAction === 'publish' ? 'published' : 'rejected'), `${firstAction}: first transition did not finish`)
  expect(coordinator.active() === null, `${firstAction}: success did not release shared lock`)

  const later = firstAction === 'publish' ? rejectionController.attempt() : publicationController.attempt()
  if (firstAction === 'publish') rejection.resolve(palette('archived'))
  else publication.resolve(palette('published'))
  expect(await later === (firstAction === 'publish' ? 'rejected' : 'published'), `${firstAction}: later eligible transition remained locked`)
}

async function testReleasePaths(): Promise<void> {
  const publicationScenarios = [
    { name: 'cancellation', confirm: false, publish: async () => palette('published'), reload: async () => palette('candidate'), outcome: 'cancelled' },
    { name: 'success', confirm: true, publish: async () => palette('published'), reload: async () => palette('candidate'), outcome: 'published' },
    { name: 'failure', confirm: true, publish: async () => { throw new Error('failed') }, reload: async () => palette('candidate'), outcome: 'failed' },
    { name: 'lost-response reconciliation', confirm: true, publish: async () => { throw new Error('lost') }, reload: async () => palette('published'), outcome: 'reconciled-published' },
    { name: 'failed reconciliation', confirm: true, publish: async () => { throw new Error('lost') }, reload: async () => { throw new Error('reload') }, outcome: 'failed' }
  ] as const
  for (const scenario of publicationScenarios) {
    const coordinator = createCandidateTransitionCoordinator()
    const controller = createCandidatePublicationController({
      state: createCandidatePublicationState(), transitionCoordinator: coordinator,
      paletteID: () => 'candidate-1', eligibility: () => ({ editing: true, authenticatedAdmin: true, canonicalStatus: 'candidate', dirty: false, publishing: false }),
      confirm: () => scenario.confirm, publish: scenario.publish, reload: scenario.reload, applyCanonical: () => {}
    })
    expect(await controller.attempt() === scenario.outcome, `publication ${scenario.name} outcome changed`)
    expect(coordinator.active() === null, `publication ${scenario.name} leaked shared lock`)
  }

  for (const scenario of [
    { name: 'success', reject: async () => palette('archived'), reload: async () => palette('candidate'), outcome: 'rejected' },
    { name: 'failure', reject: async () => { throw new Error('failed') }, reload: async () => palette('candidate'), outcome: 'failed' }
  ] as const) {
    const coordinator = createCandidateTransitionCoordinator()
    const controller = createCandidateRejectionController({
      state: createCandidateRejectionState(), transitionCoordinator: coordinator,
      paletteID: () => 'candidate-1', eligibility: () => ({ editing: true, authenticatedAdmin: true, importedCandidate: true, canonicalStatus: 'candidate', dirty: false, conflictingAction: false }),
      confirm: () => true, reject: scenario.reject, reload: scenario.reload, applyCanonical: () => {}
    })
    expect(await controller.attempt() === scenario.outcome, `rejection ${scenario.name} outcome changed`)
    expect(coordinator.active() === null, `rejection ${scenario.name} leaked shared lock`)
  }
}

await testCrossActionOrder('publish')
await testCrossActionOrder('reject')
await testReleasePaths()
