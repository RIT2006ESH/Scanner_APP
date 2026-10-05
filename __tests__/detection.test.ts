// ============================================================
// Tests for the detection layer ported from the Java web version
// (Java tests: LuhnValidatorTest, AadhaarChecksumValidatorTest,
// DataMaskerTest, ...). They check that the TypeScript port gives
// the same results as the Java code.
// ============================================================
import { isValidAadhaar, isValidLuhn } from '../src/services/detection/validators';
import { maskValue } from '../src/services/detection/masker';
import { classifyRisk } from '../src/services/detection/riskClassifier';
import { buildActiveDetectors, DETECTORS } from '../src/services/detection/detectorRegistry';
import { buildScanResult, detectInChunk } from '../src/services/detection/detectionEngine';
import { SENSITIVE_DATA_TYPES } from '../src/types';

describe('Luhn (card numbers)', () => {
  test('accepts valid numbers, with or without separators', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true);
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
    expect(isValidLuhn('4111-1111-1111-1111')).toBe(true);
  });

  test('rejects a wrong check digit', () => {
    expect(isValidLuhn('4111111111111112')).toBe(false);
  });

  test('rejects wrong lengths and empty input', () => {
    expect(isValidLuhn('411111111111')).toBe(false); // 12 digits
    expect(isValidLuhn('41111111111111111111')).toBe(false); // 20 digits
    expect(isValidLuhn('')).toBe(false);
    expect(isValidLuhn(null)).toBe(false);
  });
});

describe('Verhoeff (Aadhaar)', () => {
  test('accepts a valid number, with or without spaces', () => {
    expect(isValidAadhaar('234567890124')).toBe(true);
    expect(isValidAadhaar('2345 6789 0124')).toBe(true);
  });

  test('rejects a wrong check digit', () => {
    expect(isValidAadhaar('234567890125')).toBe(false);
  });

  test('rejects wrong lengths and empty input', () => {
    expect(isValidAadhaar('23456789012')).toBe(false); // 11 digits
    expect(isValidAadhaar('2345678901245')).toBe(false); // 13 digits
    expect(isValidAadhaar(undefined)).toBe(false);
  });
});

describe('masking', () => {
  test.each([
    ['CARD_NUMBER', '4111 1111 1111 1111', '**** **** **** 1111'],
    ['AADHAAR_NUMBER', '2345 6789 0124', '**** **** 0124'],
    ['BANK_ACCOUNT', '9876543210', '******3210'],
    ['PASSPORT', 'A1234567', '****4567'],
    ['IFSC', 'SBIN0001234', '*******1234'],
    ['PAN_NUMBER', 'ABCDE1234F', '******234F'],
    ['EMAIL', 'rahul@gmail.com', 'r***l@gmail.com'],
    ['UPI_ID', 'rahul@oksbi', 'r***l@oksbi'],
    ['EMAIL', 'ab@x.com', '**@x.com'],
    ['EMAIL', 'no-at-sign', '**********'],
    ['PHONE_NUMBER', '123', '***'],
    ['PAN_NUMBER', 'ABC', '***'],
  ] as const)('%s: %s -> %s', (type, raw, expected) => {
    expect(maskValue(raw, type)).toBe(expected);
  });

  test('empty input gives an empty string', () => {
    expect(maskValue('', 'CARD_NUMBER')).toBe('');
    expect(maskValue(null, 'EMAIL')).toBe('');
  });
});

describe('risk levels', () => {
  test('known levels', () => {
    expect(classifyRisk('CARD_NUMBER')).toBe('CRITICAL');
    expect(classifyRisk('AADHAAR_NUMBER')).toBe('CRITICAL');
    expect(classifyRisk('PAN_NUMBER')).toBe('MEDIUM');
    expect(classifyRisk('UPI_ID')).toBe('MEDIUM');
    expect(classifyRisk('EMAIL')).toBe('NORMAL');
    expect(classifyRisk('PHONE_NUMBER')).toBe('NORMAL');
  });

  test('every data type has a risk level', () => {
    for (const type of SENSITIVE_DATA_TYPES) {
      expect(['CRITICAL', 'MEDIUM', 'NORMAL']).toContain(classifyRisk(type));
    }
  });
});

describe('detector registry', () => {
  test('has exactly one detector for every data type', () => {
    const types = DETECTORS.map((detector) => detector.type);
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(types)).toEqual(new Set(SENSITIVE_DATA_TYPES));
  });

  test('enabledTypes limits the detectors', () => {
    const active = buildActiveDetectors(new Set(['EMAIL'] as const));
    expect(active.map((detector) => detector.type)).toEqual(['EMAIL']);
  });
});

describe('detection engine', () => {
  const sample = [
    'Card: 4111 1111 1111 1111',
    'Aadhaar: 2345 6789 0124',
    'PAN: ABCDE1234F',
    'Passport: A1234567',
    'IFSC: SBIN0001234',
    'UPI: rahul@oksbi',
    'Email: test.user@example.com',
    'Fake card (bad Luhn): 4111 1111 1111 1112',
  ].join('\n');

  test('finds every type in the sample and drops the bad card', () => {
    const found = detectInChunk(sample, buildActiveDetectors(), new Set());
    expect(new Set(found.map((match) => match.type))).toEqual(
      new Set(['CARD_NUMBER', 'AADHAAR_NUMBER', 'PAN_NUMBER', 'PASSPORT', 'IFSC', 'UPI_ID', 'EMAIL']),
    );
    expect(found.some((match) => match.value === '4111 1111 1111 1112')).toBe(false);
  });

  test('on equal length, Card wins over Bank Account', () => {
    const found = detectInChunk('4111111111111111', buildActiveDetectors(), new Set());
    expect(found.map((match) => match.type)).toEqual(['CARD_NUMBER']);
  });

  test('on equal length, Aadhaar wins over Bank Account', () => {
    const found = detectInChunk('234567890124', buildActiveDetectors(), new Set());
    expect(found.map((match) => match.type)).toEqual(['AADHAAR_NUMBER']);
  });

  test('the same value is reported once per file', () => {
    const seen = new Set<string>();
    const text = 'a@example.com and again a@example.com';
    expect(detectInChunk(text, buildActiveDetectors(), seen)).toHaveLength(1);
    // A second chunk of the same file must not report it again.
    expect(detectInChunk(text, buildActiveDetectors(), seen)).toHaveLength(0);
  });

  test('a result is masked and never contains the real value', () => {
    const result = buildScanResult(
      { type: 'CARD_NUMBER', value: '4111 1111 1111 1111', start: 0, end: 19 },
      { filePath: '/tmp/a.txt', fileName: 'a.txt', creationTime: null, modifiedTime: 1000 },
      5000,
    );
    expect(result.maskedValue).toBe('**** **** **** 1111');
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.scanTimestamp).toBe(5000);
    expect(JSON.stringify(result)).not.toContain('4111 1111 1111 1111');
  });
});
