// ============================================================
// Email detector, ported from detector/EmailDetector.java
//
// Standard shape: name@domain.tld (the domain must contain a dot
// and end in at least 2 letters).
// Example: "rahul.k@gmail.com".
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export const emailDetector: SensitiveDataDetector = {
  type: 'EMAIL',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(EMAIL_PATTERN, text);
  },
};
