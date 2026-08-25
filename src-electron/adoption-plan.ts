import type { AdoptionStatus } from './profile-adoption.ts'

export type AdoptionPlan = 'resume' | 'startFresh' | 'askExisting'

export function planProfileAdoption(
  hasExistingData: boolean,
  previousStatus: AdoptionStatus | undefined,
): AdoptionPlan {
  if (
    previousStatus === 'consentRequired'
    || previousStatus === 'restored'
    || previousStatus === 'restoreAbandoned'
  ) {
    return 'askExisting'
  }
  if (previousStatus !== undefined) return 'resume'
  return hasExistingData ? 'askExisting' : 'startFresh'
}
