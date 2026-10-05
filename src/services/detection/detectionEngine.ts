// ============================================================
// Detection engine, ported from the detection part of
// core/ScanOrchestrator.java:
//   detectAndRecordFindings, resolveOverlaps, isValid, recordFinding
//
// Pipeline for one chunk of extracted text:
//   1. Run every active detector (regex finds CANDIDATES).
//   2. Keep only candidates that pass their checksum.
//   3. Resolve overlaps (the same text matched by several detectors).
//   4. Skip values already reported earlier in the same file.
// Then buildScanResult masks the value and attaches risk and confidence.
// ============================================================
import { Confidence, ScanResult, SensitiveDataType } from '../../types';
import { SensitiveDataDetector } from './detectors/SensitiveDataDetector';
import { classifyRisk } from './riskClassifier';
import { maskValue } from './masker';
import { isValidAadhaar, isValidLuhn } from './validators';

// A candidate that passed validation (Java: private record ValidatedMatch).
export interface ValidatedMatch {
  type: SensitiveDataType;
  value: string;
  start: number;
  end: number;
}

function lengthOf(match: ValidatedMatch): number {
  return match.end - match.start;
}

function overlaps(a: ValidatedMatch, b: ValidatedMatch): boolean {
  return a.start < b.end && a.end > b.start;
}

// Card and Aadhaar win ties against other types of the same length.
function priorityOf(match: ValidatedMatch): number {
  return match.type === 'CARD_NUMBER' || match.type === 'AADHAAR_NUMBER' ? 1 : 0;
}

// Checks the math of a candidate. Only Card (Luhn) and Aadhaar (Verhoeff)
// have a checksum; every other type is accepted as found by the regex.
function isValid(candidate: string, type: SensitiveDataType): boolean {
  switch (type) {
    case 'CARD_NUMBER':
      return isValidLuhn(candidate);
    case 'AADHAAR_NUMBER':
      return isValidAadhaar(candidate);
    case 'PAN_NUMBER':
    case 'PASSPORT':
    case 'DRIVING_LICENCE':
    case 'VOTER_ID':
    case 'BANK_ACCOUNT':
    case 'IFSC':
    case 'UPI_ID':
    case 'PHONE_NUMBER':
    case 'EMAIL':
      return true;
    default: {
      const unhandled: never = type;
      throw new Error('No validation rule for type: ' + String(unhandled));
    }
  }
}

// Picks the winners when several detectors matched the same text.
// Rule: longest match first; on equal length, higher priority first;
// on a full tie, the detector that came first in the registry list.
function resolveOverlaps(candidates: ValidatedMatch[]): ValidatedMatch[] {
  const sorted = candidates
    .map((match, index) => ({ match, index }))
    .sort(
      (a, b) =>
        lengthOf(b.match) - lengthOf(a.match) ||
        priorityOf(b.match) - priorityOf(a.match) ||
        a.index - b.index,
    )
    .map((entry) => entry.match);

  const accepted: ValidatedMatch[] = [];
  for (const candidate of sorted) {
    if (!accepted.some((other) => overlaps(candidate, other))) {
      accepted.push(candidate);
    }
  }
  return accepted;
}

// Finds the real (validated, non-overlapping, new) findings in one chunk.
// alreadyFoundInFile: one Set per file, shared by all chunks of that file.
export function detectInChunk(
  text: string,
  activeDetectors: readonly SensitiveDataDetector[],
  alreadyFoundInFile: Set<string>,
): ValidatedMatch[] {
  const candidates: ValidatedMatch[] = [];

  for (const detector of activeDetectors) {
    for (const rawMatch of detector.detectMatches(text)) {
      if (isValid(rawMatch.value, detector.type)) {
        candidates.push({
          type: detector.type,
          value: rawMatch.value,
          start: rawMatch.start,
          end: rawMatch.end,
        });
      }
    }
  }

  const findings: ValidatedMatch[] = [];
  for (const match of resolveOverlaps(candidates)) {
    if (alreadyFoundInFile.has(match.value)) {
      continue;
    }
    alreadyFoundInFile.add(match.value);
    findings.push(match);
  }
  return findings;
}

export interface FileInfo {
  filePath: string;
  fileName: string;
  creationTime: number | null;
  modifiedTime: number;
}

// Confidence of a finding that the model has not looked at.
function defaultConfidence(type: SensitiveDataType): Confidence {
  return type === 'CARD_NUMBER' || type === 'AADHAAR_NUMBER' ? 'CHECKSUM' : 'PATTERN';
}

// Turns a validated match into a final ScanResult: masks the value
// (the real number is never kept) and attaches risk level and confidence.
export function buildScanResult(
  match: ValidatedMatch,
  file: FileInfo,
  scanTimestamp: number = Date.now(),
  confidence: Confidence = defaultConfidence(match.type),
): ScanResult {
  return {
    fileName: file.fileName,
    filePath: file.filePath,
    dataType: match.type,
    riskLevel: classifyRisk(match.type),
    maskedValue: maskValue(match.value, match.type),
    scanTimestamp,
    fileCreationTime: file.creationTime,
    fileModifiedTime: file.modifiedTime,
    confidence,
  };
}
