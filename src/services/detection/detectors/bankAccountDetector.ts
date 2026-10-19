// ============================================================
// Bank account detector. Rule from the web page's "Detection Rules":
//   A 9-18 digit sequence, detected near a keyword such as "account no."
//   Only the format is checked (no fixed format, lowest confidence).
//
// Changed from the Java detector, which reported EVERY 9-18 digit number.
// Now a number is reported only when a keyword is close to it. That
// removes most false alarms (invoice numbers, phone numbers, ids).
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const BANK_ACCOUNT_PATTERN = /\b\d{9,18}\b/g;

// Words that show a number is probably a bank account:
// "account", "accounts", "a/c", "acc", "acct", "bank", "savings".
const KEYWORD_PATTERN = /\b(?:accounts?|a\/c|acct?|bank|savings)\b/i;

// How many characters around the number are searched for a keyword.
const CHARS_BEFORE = 40;
const CHARS_AFTER = 20;

export const bankAccountDetector: SensitiveDataDetector = {
  type: 'BANK_ACCOUNT',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    if (text == null || text.length === 0) {
      return [];
    }
    return findMatches(BANK_ACCOUNT_PATTERN, text).filter((match) => {
      const before = text.substring(Math.max(0, match.start - CHARS_BEFORE), match.start);
      const after = text.substring(match.end, match.end + CHARS_AFTER);
      return KEYWORD_PATTERN.test(before + ' ' + after);
    });
  },
};
