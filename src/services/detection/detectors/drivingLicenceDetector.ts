// ============================================================
// Driving licence detector, ported from detector/DrivingLicenceDetector.java
//
// Format: 2 capital letters (state code), 2 digits (RTO code),
// 4 digits (year), 7 digits (serial number). A dash or space is
// allowed between the groups.
// Examples: "MH12 2019 0001234" or "MH-12-2019-0001234".
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

const DL_PATTERN = /\b[A-Z]{2}[- ]?\d{2}[- ]?\d{4}[- ]?\d{7}\b/g;

export const drivingLicenceDetector: SensitiveDataDetector = {
  type: 'DRIVING_LICENCE',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(DL_PATTERN, text);
  },
};
