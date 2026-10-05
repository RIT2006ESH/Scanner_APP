// ============================================================
// Phone number detector, ported from detector/PhoneNumberDetector.java
//
// Indian mobile numbers: 10 digits starting with 6, 7, 8 or 9,
// with an optional "+91" or "91" prefix (and optional dash or space).
// Examples: "9876543210", "+91 9876543210", "91-9876543210".
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const PHONE_PATTERN = /\b(?:(?:\+91|91)[-\s]?)?[6-9]\d{9}\b/g;

export const phoneNumberDetector: SensitiveDataDetector = {
  type: 'PHONE_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(PHONE_PATTERN, text);
  },
};
