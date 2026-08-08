import type { AdminPalette } from '@/api/admin'
import type { ValidationIssue } from '@/types/palette'

export interface CandidatePublicationState {
  publishing: boolean
  message: string
  error: string
  issues: ValidationIssue[]
  errorStatus: number | null
}

export interface CandidatePublicationEligibility {
  editing: boolean
  authenticatedAdmin: boolean
  canonicalStatus: AdminPalette['status'] | null
  dirty: boolean
  publishing: boolean
}

export interface CandidatePublicationDependencies {
  state: CandidatePublicationState
  paletteID: () => string
  eligibility: () => CandidatePublicationEligibility
  confirm: (message: string) => boolean | Promise<boolean>
  publish: (id: string) => Promise<AdminPalette>
  reload: (id: string) => Promise<AdminPalette>
  applyCanonical: (palette: AdminPalette) => void
}

export type CandidatePublicationOutcome =
  | 'ineligible'
  | 'cancelled'
  | 'duplicate'
  | 'published'
  | 'reconciled-published'
  | 'failed'

export function createCandidatePublicationState(): CandidatePublicationState {
  return { publishing: false, message: '', error: '', issues: [], errorStatus: null }
}

export function isCandidatePublicationEligible(input: CandidatePublicationEligibility): boolean {
  return input.editing && input.authenticatedAdmin && input.canonicalStatus === 'candidate' && !input.dirty && !input.publishing
}

export function isCanonicalPublication(expectedID: string, palette: AdminPalette): boolean {
  return palette.id === expectedID &&
    palette.status === 'published' &&
    palette.visibility === 'public' &&
    palette.owner_user_id == null
}

export function createCandidatePublicationController(dependencies: CandidatePublicationDependencies) {
  async function attempt(): Promise<CandidatePublicationOutcome> {
    const eligibility = dependencies.eligibility()
    if (eligibility.publishing || dependencies.state.publishing) return 'duplicate'
    if (!isCandidatePublicationEligible(eligibility)) return 'ineligible'
    if (!await dependencies.confirm('Publish this candidate to the public catalog?')) return 'cancelled'

    const id = dependencies.paletteID()
    dependencies.state.publishing = true
    dependencies.state.message = ''
    dependencies.state.error = ''
    dependencies.state.issues = []
    dependencies.state.errorStatus = null

    try {
      const published = await dependencies.publish(id)
      if (!isCanonicalPublication(id, published)) {
        throw new Error('The server returned an invalid publication response.')
      }
      dependencies.applyCanonical(published)
      dependencies.state.message = 'Published to the public catalog.'
      return 'published'
    } catch (publicationError) {
      try {
        const canonical = await dependencies.reload(id)
        if (isCanonicalPublication(id, canonical)) {
          dependencies.applyCanonical(canonical)
          dependencies.state.message = 'Published to the public catalog.'
          return 'reconciled-published'
        }
      } catch {
        // The original publication failure remains authoritative when reconciliation fails.
      }

      const error = publicationError as { message?: string; status?: number; issues?: ValidationIssue[] }
      dependencies.state.error = error.message || 'Failed to publish candidate'
      dependencies.state.errorStatus = typeof error.status === 'number' ? error.status : null
      dependencies.state.issues = Array.isArray(error.issues) ? error.issues : []
      return 'failed'
    } finally {
      dependencies.state.publishing = false
    }
  }

  return { attempt }
}
