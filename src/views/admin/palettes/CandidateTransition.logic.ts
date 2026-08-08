export type CandidateTransition = 'publish' | 'reject'

export interface CandidateTransitionCoordinator {
  active: () => CandidateTransition | null
  acquire: (transition: CandidateTransition) => (() => void) | null
}

export function createCandidateTransitionCoordinator(
  onChange: (active: CandidateTransition | null) => void = () => {}
): CandidateTransitionCoordinator {
  let active: CandidateTransition | null = null

  return {
    active: () => active,
    acquire: (transition) => {
      if (active !== null) return null
      active = transition
      onChange(active)
      let released = false
      return () => {
        if (released) return
        released = true
        active = null
        onChange(active)
      }
    }
  }
}
