// ============================================================
// PAN detector. Rule from the web page's "Detection Rules":
//   Format AAAAA9999A (5 capital letters, 4 digits, 1 capital letter).
//   The 4th letter is the holder type and must be one of
//   A, B, C, F, G, H, J, L, P, T.
//   Example: "ABCPE1234F" (4th letter P = individual).
// There is no checksum, only the format is checked.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

// [A-Z]{3}          letters 1 to 3
// [ABCFGHJLPT]      letter 4: holder type
// [A-Z]             letter 5
// \d{4}[A-Z]        4 digits and the last letter
const PAN_PATTERN = /\b[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]\b/g;

export const panNumberDetector: SensitiveDataDetector = {
  type: 'PAN_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(PAN_PATTERN, text);
  },
};
