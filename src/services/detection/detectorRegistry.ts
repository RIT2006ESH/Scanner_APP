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

export function buildActiveDetectors(
  enabledTypes?: ReadonlySet<SensitiveDataType> | null,
): SensitiveDataDetector[] {
  if (enabledTypes == null || enabledTypes.size === 0) {
    return [...DETECTORS];
  }
  return DETECTORS.filter((detector) => enabledTypes.has(detector.type));
}
