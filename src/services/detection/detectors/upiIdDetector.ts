// ============================================================
// UPI ID detector, ported from detector/UpiIdDetector.java
//
// UPI format: "name@bank", where the bank handle is letters only.
// Examples: "rahul@oksbi", "9876543210@ybl".
//
// The (?!\.) at the end means "not followed by a dot", so an email
// like "rahul@gmail.com" is NOT reported as a UPI ID (the email
// detector handles that one).
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const UPI_PATTERN = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{3,64}\b(?!\.)/g;

export const upiIdDetector: SensitiveDataDetector = {
  type: 'UPI_ID',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(UPI_PATTERN, text);
  },
};
