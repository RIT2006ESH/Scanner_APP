// ============================================================
// Shared types for the scanner app.
// Ported from the Java web version (model/*, detector/PiiMatch).
// ============================================================

// All kinds of sensitive data the scanner can detect.
// Names match the Java enum SensitiveDataType exactly.
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

// Union type built from the array above, so the list and the type never go out of sync.
export type SensitiveDataType = (typeof SENSITIVE_DATA_TYPES)[number];

// How dangerous a finding is (Java: enum RiskLevel).
export const RISK_LEVELS = ['CRITICAL', 'MEDIUM', 'NORMAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// A raw regex hit, before validation and masking (Java: record PiiMatch).
export interface PiiMatch {
  value: string; // the matched text
  start: number; // start index in the scanned text
  end: number;   // end index in the scanned text
}

// A complete scan result for one finding (Java: class ScanResult).
// All dates are epoch milliseconds (Java used LocalDateTime).
// fileCreationTime can be null because Android often does not expose it.
export interface ScanResult {
  fileName: string;
  filePath: string;
  dataType: SensitiveDataType;
  riskLevel: RiskLevel;
  maskedValue: string;
  scanTimestamp: number;
  fileCreationTime: number | null;
  fileModifiedTime: number;
}
