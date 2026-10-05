// ============================================================
// IFSC detector, ported from detector/IfscDetector.java
//
// IFSC format: 4 capital letters (bank code), a literal zero,
// then 6 letters or digits (branch code).
// Example: "SBIN0001234".
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const IFSC_PATTERN = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;

export const ifscDetector: SensitiveDataDetector = {
  type: 'IFSC',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(IFSC_PATTERN, text);
  },
};
