import type { AdminPalette } from '@/api/admin'
import type { ValidationIssue } from '@/types/palette'

export interface CandidateRejectionState {
  rejecting: boolean
  message: string
  error: string
  issues: ValidationIssue[]
  errorStatus: number | null
}

export interface CandidateRejectionEligibility {
  editing: boolean
  authenticatedAdmin: boolean
  importedCandidate: boolean
  canonicalStatus: AdminPalette['status'] | null
  dirty: boolean
  conflictingAction: boolean
}

export function createCandidateRejectionState(): CandidateRejectionState {
  return { rejecting: false, message: '', error: '', issues: [], errorStatus: null }
}

export function isCandidateRejectionEligible(input: CandidateRejectionEligibility): boolean {
  return input.editing && input.authenticatedAdmin && input.importedCandidate &&
    input.canonicalStatus === 'candidate' && !input.dirty && !input.conflictingAction
}

function isCanonicalRejection(id: string, palette: AdminPalette): boolean {
  return palette.id === id && palette.status === 'archived' && palette.visibility === 'public' && palette.owner_user_id == null
}

export function createCandidateRejectionController(dependencies: {
  state: CandidateRejectionState
  paletteID: () => string
  eligibility: () => CandidateRejectionEligibility
  confirm: (message: string) => boolean | Promise<boolean>
  reject: (id: string) => Promise<AdminPalette>
  reload: (id: string) => Promise<AdminPalette>
  applyCanonical: (palette: AdminPalette) => void
}) {
  let attemptInFlight = false
  async function attempt(): Promise<'ineligible' | 'duplicate' | 'cancelled' | 'rejected' | 'reconciled-rejected' | 'failed'> {
    if (attemptInFlight || dependencies.state.rejecting) return 'duplicate'
    if (!isCandidateRejectionEligible(dependencies.eligibility())) return 'ineligible'
    attemptInFlight = true
    try {
      if (!await dependencies.confirm('Reject this imported candidate? It will remain archived and non-public.')) return 'cancelled'
      const id = dependencies.paletteID()
      Object.assign(dependencies.state, { rejecting: true, message: '', error: '', issues: [], errorStatus: null })
      try {
        const rejected = await dependencies.reject(id)
        if (!isCanonicalRejection(id, rejected)) throw new Error('The server returned an invalid rejection response.')
        dependencies.applyCanonical(rejected)
        dependencies.state.message = 'Imported candidate rejected.'
        return 'rejected'
      } catch (rejectionError) {
        try {
          const canonical = await dependencies.reload(id)
          if (isCanonicalRejection(id, canonical)) {
            dependencies.applyCanonical(canonical)
            dependencies.state.message = 'Imported candidate rejected.'
            return 'reconciled-rejected'
          }
        } catch { /* retain original failure */ }
        const error = rejectionError as { message?: string; status?: number; issues?: ValidationIssue[] }
        dependencies.state.error = error.message || 'Failed to reject candidate'
        dependencies.state.errorStatus = typeof error.status === 'number' ? error.status : null
        dependencies.state.issues = Array.isArray(error.issues) ? error.issues : []
        return 'failed'
      }
    } finally {
      dependencies.state.rejecting = false
      attemptInFlight = false
    }
  }
  return { attempt }
}
