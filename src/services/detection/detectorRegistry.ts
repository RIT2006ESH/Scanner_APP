// ============================================================
// Detector registry, ported from detector/DetectorRegistry.java
//
// ORDER MATTERS: when two matches have the same length and priority
// (for example a plain 10-digit number, which both the phone and the
// bank-account detector match), the detector listed FIRST wins.
//
// Order: strong, structured types first (Card, Aadhaar, PAN, IFSC,
// Email), then Phone, then the weak generic Bank Account pattern last,
// so a 10-digit mobile number is reported as Phone, not Bank Account.
// ============================================================
import { SensitiveDataType } from '../../types';
import { SensitiveDataDetector } from './detectors/SensitiveDataDetector';
import { aadhaarDetector } from './detectors/aadhaarDetector';
import { bankAccountDetector } from './detectors/bankAccountDetector';
import { cardNumberDetector } from './detectors/cardNumberDetector';
import { drivingLicenceDetector } from './detectors/drivingLicenceDetector';
import { emailDetector } from './detectors/emailDetector';
import { ifscDetector } from './detectors/ifscDetector';
import { panNumberDetector } from './detectors/panNumberDetector';
import { passportDetector } from './detectors/passportDetector';
import { phoneNumberDetector } from './detectors/phoneNumberDetector';
import { upiIdDetector } from './detectors/upiIdDetector';
import { voterIdDetector } from './detectors/voterIdDetector';

export const DETECTORS: readonly SensitiveDataDetector[] = [
  cardNumberDetector,
  aadhaarDetector,
  panNumberDetector,
  ifscDetector,
  emailDetector,
  upiIdDetector,
  phoneNumberDetector,
  passportDetector,
  voterIdDetector,
  drivingLicenceDetector,
  bankAccountDetector, // weakest pattern, always last
];

// Ported from ScanOrchestrator.buildActiveDetectors.
//   - No enabledTypes (null/undefined/empty) -> use all detectors.
//   - Otherwise -> only the detectors whose type is enabled.
export function buildActiveDetectors(
  enabledTypes?: ReadonlySet<SensitiveDataType> | null,
): SensitiveDataDetector[] {
  if (enabledTypes == null || enabledTypes.size === 0) {
    return [...DETECTORS];
  }
  return DETECTORS.filter((detector) => enabledTypes.has(detector.type));
}
