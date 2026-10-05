// ============================================================
// Card number detector, ported from detector/CardNumberDetector.java
//
// Finds 13 to 19 digit numbers, with optional spaces or dashes
// between digits, e.g. "4111 1111 1111 1111".
// The Luhn checksum (isValidLuhn) is applied later.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

// (?:\d[ -]?){12,18} = 12 to 18 digits, each optionally followed by a
// space or dash, then one final digit -> 13 to 19 digits in total.
// Exported because the Java version shared this pattern with other classes.
export const CARD_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

export const cardNumberDetector: SensitiveDataDetector = {
  type: 'CARD_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(CARD_PATTERN, text);
  },
};
