// ============================================================
// Aadhaar detector. Rule from the web page's "Detection Rules":
//   12 digits, grouped in blocks of 4. The first digit is 2 to 9 (UIDAI
//   format: an Aadhaar number never starts with 0 or 1).
// Valid forms: "234567890124", "2345 6789 0124", "2345-6789-0124".
// The separator must be the same in both places. The Verhoeff checksum
// (isValidAadhaar) is applied later.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

// [2-9]\d{3}   first block, first digit 2 to 9
// ([ -]?)      separator: a space, a dash or nothing
// \1           the SAME separator again (so "2345 6789-0124" is not matched)
const AADHAAR_PATTERN = /\b[2-9]\d{3}([ -]?)\d{4}\1\d{4}\b/g;

export const aadhaarDetector: SensitiveDataDetector = {
  type: 'AADHAAR_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(AADHAAR_PATTERN, text);
  },
};
