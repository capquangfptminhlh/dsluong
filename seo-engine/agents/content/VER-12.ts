export interface VerificationReport {
  hardBlockers: string[];
  softScore: number;
  decision: 'PASS' | 'NEEDS_REVIEW' | 'BLOCK';
}

export interface RequiredClaim {
  claimId: string;
  factIds: string[];
  required: boolean;
  expectedText?: string; // Used for mocking in Slice 1
}

export interface Brief {
  requiredClaims?: RequiredClaim[];
}

/**
 * VER-12 Verification Gate
 * Slice 1 Mock: Checks if required claims from brief exist in draft.
 */
export function verifyDraft(draft: string, brief: Brief): VerificationReport {
  const hardBlockers: string[] = [];

  if (brief.requiredClaims && Array.isArray(brief.requiredClaims)) {
    for (const claim of brief.requiredClaims) {
      if (claim.required && claim.expectedText) {
        if (!draft.toLowerCase().includes(claim.expectedText.toLowerCase())) {
          hardBlockers.push(`UNBOUND_CLAIM: Missing required claim ${claim.claimId}`);
        }
      }
    }
  }

  if (hardBlockers.length > 0) {
    return {
      hardBlockers,
      softScore: 0.0,
      decision: 'BLOCK'
    };
  }

  return {
    hardBlockers: [],
    softScore: 0.85,
    decision: 'PASS'
  };
}
