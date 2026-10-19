// ============================================================
// Card number detector. Rule from the web page's "Detection Rules":
//   13-19 digit sequences, either unbroken or grouped in uniform
//   blocks of 4 (for example "4111 1111 1111 1111").
// "Uniform" means the same separator (space or dash) between all
// blocks. The Luhn checksum (isValidLuhn) is applied later.
//
// Changed from the Java detector, which accepted a separator after any
// digit ("4 1 1 1 ..."), so unrelated numbers could be glued together.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

// Two shapes:
//   \d{13,19}                       13 to 19 digits in one piece
//   \d{4}([ -])(?:\d{4}\1){1,3}\d{1,4}
//                                   blocks of 4 joined by the SAME separator
//                                   (\1 repeats the first separator), the last
//                                   block can be shorter, e.g. 4-4-4-3
// Exported because the Java version shared this pattern with other classes.
export const CARD_PATTERN = /\b(?:\d{13,19}|\d{4}([ -])(?:\d{4}\1){1,3}\d{1,4})\b/g;

export const cardNumberDetector: SensitiveDataDetector = {
  type: 'CARD_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(CARD_PATTERN, text);
  },
};
