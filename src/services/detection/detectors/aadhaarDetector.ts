// ============================================================
// Aadhaar detector, ported from detector/AadhaarDetector.java
//
// Finds 12-digit numbers, with an optional space or dash between
// each group of 4, e.g. "1234 5678 9012" or "1234-5678-9012".
// The Verhoeff checksum (isValidAadhaar) is applied later.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

// \b = word boundary, so digits inside a longer number are not matched.
const AADHAAR_PATTERN = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;

export const aadhaarDetector: SensitiveDataDetector = {
  type: 'AADHAAR_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(AADHAAR_PATTERN, text);
  },
};
