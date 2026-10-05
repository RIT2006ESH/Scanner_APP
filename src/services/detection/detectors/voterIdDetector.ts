// ============================================================
// Voter ID (EPIC) detector, ported from detector/VoterIdDetector.java
//
// Format: 3 capital letters followed by 7 digits.
// Example: "ABC1234567". Capital letters only.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const VOTER_ID_PATTERN = /\b[A-Z]{3}[0-9]{7}\b/g;

export const voterIdDetector: SensitiveDataDetector = {
  type: 'VOTER_ID',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(VOTER_ID_PATTERN, text);
  },
};
