import { RiskLevel, SensitiveDataType } from '../../types';
const RISK_MAP: Record<SensitiveDataType, RiskLevel> = {
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
export function classifyRisk(type: SensitiveDataType): RiskLevel {
  return RISK_MAP[type] ?? 'NORMAL';
}
