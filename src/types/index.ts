// ============================================================
// Shared types for the scanner app.
// Ported from the Java web version (model/*, detector/PiiMatch).
// ============================================================

export const SENSITIVE_DATA_TYPES = [
  'CARD_NUMBER',
  'AADHAAR_NUMBER',
  'PAN_NUMBER',
  'PASSPORT',
  'DRIVING_LICENCE',
  'VOTER_ID',
  'BANK_ACCOUNT',
  'IFSC',
  'UPI_ID',
  'PHONE_NUMBER',
  'EMAIL',
] as const;

export type SensitiveDataType = (typeof SENSITIVE_DATA_TYPES)[number];

export const RISK_LEVELS = ['CRITICAL', 'MEDIUM', 'NORMAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// How a finding was verified:
//   CHECKSUM         - passed a checksum (Luhn / Verhoeff)
//   PATTERN          - matched by regex only
//   MODEL_CONFIRMED  - the on-device model said YES
//   MODEL_UNREVIEWED - the model could not review it, so it was kept
// (A model NO drops the finding, so it is never stored.)
export const CONFIDENCE_LEVELS = [
  'CHECKSUM',
  'PATTERN',
  'MODEL_CONFIRMED',
  'MODEL_UNREVIEWED',
] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

// A raw regex hit, before validation and masking (Java: record PiiMatch).
export interface PiiMatch {
  value: string;
  start: number;
  end: number;
}

// A complete scan result for one finding (Java: class ScanResult).
// Dates are epoch milliseconds. fileCreationTime can be null because
// Android often does not expose it.
export interface ScanResult {
  fileName: string;
  filePath: string;
  dataType: SensitiveDataType;
  riskLevel: RiskLevel;
  maskedValue: string;
  scanTimestamp: number;
  fileCreationTime: number | null;
  fileModifiedTime: number;
  confidence: Confidence;
}
