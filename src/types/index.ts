export type FindingType = 'CARD' | 'PAN' | 'AADHAAR' | 'UNKNOWN';

export interface Finding {
  type: FindingType;
  maskedValue: string;
  confidence: number;
  needsSlmReview: boolean;
  filePath: string;
}

export interface ScanResultRecord {
  id?: number;
  filePath: string;
  type: FindingType;
  maskedValue: string;
  confidence: number;
  timestamp: number;
}

export type FileKind = 'pdf' | 'docx' | 'image' | 'text' | 'unsupported';
