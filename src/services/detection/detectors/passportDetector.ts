// ============================================================
// Passport detector, ported from detector/PassportDetector.java
//
// Indian passport format: 1 capital letter followed by 7 digits.
// Example: "A1234567". Capital letters only.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const PASSPORT_PATTERN = /\b[A-Z][0-9]{7}\b/g;

export const passportDetector: SensitiveDataDetector = {
  type: 'PASSPORT',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(PASSPORT_PATTERN, text);
  },
};
