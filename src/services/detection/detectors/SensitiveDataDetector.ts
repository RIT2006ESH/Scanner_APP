// ============================================================
// Detector contract + shared matching helper, ported from:
//   detector/SensitiveDataDetector.java (interface)
//   the matching loop that was repeated inside every Java detector
//
// A detector only finds CANDIDATES using a regex. It does not
// check whether they are real; checksum validation (Luhn,
// Verhoeff) happens in a later step.
// ============================================================
import { PiiMatch, SensitiveDataType } from '../../../types';

// Every detector (Aadhaar, Card, PAN, ...) implements this.
export interface SensitiveDataDetector {
  // Which kind of data this detector looks for.
  readonly type: SensitiveDataType;

  // Returns every candidate found in the text (empty list if none).
  detectMatches(text: string | null | undefined): PiiMatch[];
}

// Runs a regex over the text and converts every hit to a PiiMatch.
// The pattern MUST have the global flag (/.../g), otherwise only
// the first hit would be found (matchAll throws an error without it).
// matchAll works on its own copy of the regex, so the shared
// pattern's lastIndex is never changed (safe to reuse across files).
export function findMatches(
  pattern: RegExp,
  text: string | null | undefined,
): PiiMatch[] {
  const matches: PiiMatch[] = [];

  // Nothing to scan.
  if (text == null || text.length === 0) {
    return matches;
  }

  for (const hit of text.matchAll(pattern)) {
    const start = hit.index ?? 0;
    matches.push({
      value: hit[0],
      start,
      end: start + hit[0].length,
    });
  }

  return matches;
}
