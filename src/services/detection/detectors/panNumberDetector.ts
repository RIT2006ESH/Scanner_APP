// ============================================================
// PAN detector, ported from detector/PanNumberDetector.java
//
// PAN format: 5 capital letters, 4 digits, 1 capital letter.
// Example: "ABCDE1234F". Capital letters only, same as the Java version.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const PAN_PATTERN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

export const panNumberDetector: SensitiveDataDetector = {
  type: 'PAN_NUMBER',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(PAN_PATTERN, text);
  },
};
