// ============================================================
// Bank account detector, ported from detector/BankAccountDetector.java
//
// Finds any run of 9 to 18 digits. This is a very loose pattern, so
// it also matches card numbers, Aadhaar, phone numbers and other
// long numbers. Same behaviour as the Java version.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const BANK_ACCOUNT_PATTERN = /\b\d{9,18}\b/g;

export const bankAccountDetector: SensitiveDataDetector = {
  type: 'BANK_ACCOUNT',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(BANK_ACCOUNT_PATTERN, text);
  },
};
