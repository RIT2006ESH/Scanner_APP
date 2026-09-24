import { Finding, FindingType } from '../../types';

const CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]{1}/g;
const AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;

function mask(value: string): string {
  return '*'.repeat(Math.max(value.length - 4, 0)) + value.slice(-4);
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function verhoeffValid(digits: string): boolean {
  // TODO: implement real Verhoeff checksum table for Aadhaar validation
  return digits.length === 12;
}

export function scanChunk(text: string, filePath: string): Finding[] {
  const findings: Finding[] = [];

  for (const match of text.matchAll(CARD_REGEX)) {
    const digits = match[0].replace(/\D/g, '');
    if (luhnValid(digits)) {
      findings.push({
        type: 'CARD',
        maskedValue: mask(digits),
        confidence: 0.95,
        needsSlmReview: false,
        filePath,
      });
    }
  }

  for (const match of text.matchAll(PAN_REGEX)) {
    findings.push({
      type: 'PAN',
      maskedValue: mask(match[0]),
      confidence: 0.9,
      needsSlmReview: false,
      filePath,
    });
  }

  for (const match of text.matchAll(AADHAAR_REGEX)) {
    const digits = match[0].replace(/\D/g, '');
    if (verhoeffValid(digits)) {
      findings.push({
        type: 'AADHAAR',
        maskedValue: mask(digits),
        confidence: 0.95,
        needsSlmReview: false,
        filePath,
      });
    }
  }

  // TODO: if text looks document-like but no regex hit, flag needsSlmReview = true

  return findings;
}
