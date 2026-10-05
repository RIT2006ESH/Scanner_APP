// ============================================================
// Risk classification, ported from the Java web version:
//   classifier/RiskClassifier.java -> classifyRisk
//
// Decides how dangerous it is if a given type of data leaks:
//   CRITICAL = can directly cause financial loss or identity theft
//   MEDIUM   = sensitive, but not enough on its own for fraud
//   NORMAL   = low risk, commonly shared
// ============================================================
import { RiskLevel, SensitiveDataType } from '../../types';

// One risk level for every data type.
// Typed as Record<SensitiveDataType, RiskLevel>, so TypeScript reports
// an error here if a new SensitiveDataType is added but not listed.
const RISK_MAP: Record<SensitiveDataType, RiskLevel> = {
  // CRITICAL: direct financial or identity risk.
  CARD_NUMBER: 'CRITICAL',
  AADHAAR_NUMBER: 'CRITICAL',
  BANK_ACCOUNT: 'CRITICAL',
  PASSPORT: 'CRITICAL',

  // MEDIUM: sensitive identifiers.
  PAN_NUMBER: 'MEDIUM',
  DRIVING_LICENCE: 'MEDIUM',
  VOTER_ID: 'MEDIUM',
  IFSC: 'MEDIUM',
  UPI_ID: 'MEDIUM',

  // NORMAL: low risk.
  PHONE_NUMBER: 'NORMAL',
  EMAIL: 'NORMAL',
};

// Returns the risk level for a data type.
// Falls back to NORMAL for an unknown type (same as Java's getOrDefault),
// for example if the value came from older data in the database.
export function classifyRisk(type: SensitiveDataType): RiskLevel {
  return RISK_MAP[type] ?? 'NORMAL';
}
