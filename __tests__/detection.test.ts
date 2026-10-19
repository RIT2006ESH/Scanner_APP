// ============================================================
// Tests for the detection layer ported from the Java web version
// (Java tests: LuhnValidatorTest, AadhaarChecksumValidatorTest,
// DataMaskerTest, ...) plus the rules from the web page's
// "Detection Rules" section.
// ============================================================
import { isValidAadhaar, isValidLuhn } from '../src/services/detection/validators';
import { maskValue } from '../src/services/detection/masker';
import { classifyRisk } from '../src/services/detection/riskClassifier';
import { buildActiveDetectors, DETECTORS } from '../src/services/detection/detectorRegistry';
import { buildScanResult, detectInChunk } from '../src/services/detection/detectionEngine';
import { SENSITIVE_DATA_TYPES, SensitiveDataType } from '../src/types';

// Runs only the detector(s) of the given type(s) on a text and
// returns the matched values.
function found(text: string, ...types: SensitiveDataType[]): string[] {
  return detectInChunk(text, buildActiveDetectors(new Set(types)), new Set()).map((match) => match.value);
}

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
    ['PAN_NUMBER', 'ABCPE1234F', '*****1234*'],
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

describe('card rule: 13-19 digits, unbroken or uniform blocks of 4', () => {
  test('finds unbroken and grouped numbers', () => {
    expect(found('4111111111111111', 'CARD_NUMBER')).toEqual(['4111111111111111']);
    expect(found('4111 1111 1111 1111', 'CARD_NUMBER')).toEqual(['4111 1111 1111 1111']);
    expect(found('4111-1111-1111-1111', 'CARD_NUMBER')).toEqual(['4111-1111-1111-1111']);
  });

  test('ignores mixed separators and odd groupings', () => {
    expect(found('4111 1111-1111 1111', 'CARD_NUMBER')).toEqual([]);
    expect(found('41 11 11 11 11 11 11 11', 'CARD_NUMBER')).toEqual([]);
  });

  test('drops a number that fails the Luhn check', () => {
    expect(found('4111 1111 1111 1112', 'CARD_NUMBER')).toEqual([]);
  });
});

describe('Aadhaar rule: 12 digits, first digit 2-9, same separator', () => {
  test('finds the three accepted forms', () => {
    expect(found('234567890124', 'AADHAAR_NUMBER')).toEqual(['234567890124']);
    expect(found('2345 6789 0124', 'AADHAAR_NUMBER')).toEqual(['2345 6789 0124']);
    expect(found('2345-6789-0124', 'AADHAAR_NUMBER')).toEqual(['2345-6789-0124']);
  });

  test('ignores a number starting with 0 or 1', () => {
    expect(found('0345 6789 0124', 'AADHAAR_NUMBER')).toEqual([]);
    expect(found('1345 6789 0124', 'AADHAAR_NUMBER')).toEqual([]);
  });

  test('ignores mixed separators and a failed checksum', () => {
    expect(found('2345 6789-0124', 'AADHAAR_NUMBER')).toEqual([]);
    expect(found('2345 6789 0125', 'AADHAAR_NUMBER')).toEqual([]);
  });
});

describe('PAN rule: 4th letter is a holder type', () => {
  test('finds a PAN with an allowed 4th letter', () => {
    for (const pan of ['ABCPE1234F', 'ABCCE1234F', 'ABCHE1234F', 'ABCTE1234F']) {
      expect(found(pan, 'PAN_NUMBER')).toEqual([pan]);
    }
  });

  test('ignores a PAN with another 4th letter', () => {
    expect(found('ABCDE1234F', 'PAN_NUMBER')).toEqual([]);
    expect(found('ABCZE1234F', 'PAN_NUMBER')).toEqual([]);
  });
});

describe('bank account rule: only near a keyword', () => {
  test('finds a number next to a keyword', () => {
    expect(found('Account number: 123456789012345', 'BANK_ACCOUNT')).toEqual(['123456789012345']);
    expect(found('A/C No 98765432101', 'BANK_ACCOUNT')).toEqual(['98765432101']);
    expect(found('Savings 123456789', 'BANK_ACCOUNT')).toEqual(['123456789']);
  });

  test('ignores a number without a keyword', () => {
    expect(found('Ref no. 987654321 for invoice', 'BANK_ACCOUNT')).toEqual([]);
    expect(found('9876543210', 'BANK_ACCOUNT')).toEqual([]);
  });

  test('ignores a keyword that is too far away', () => {
    const far = 'Account ' + 'x'.repeat(80) + ' 987654321';
    expect(found(far, 'BANK_ACCOUNT')).toEqual([]);
  });
});

describe('UPI rule: only known handles', () => {
  test('finds known handles, in any letter case', () => {
    expect(found('pay rahul@oksbi now', 'UPI_ID')).toEqual(['rahul@oksbi']);
    expect(found('9876543210@ybl', 'UPI_ID')).toEqual(['9876543210@ybl']);
    expect(found('Rahul@OKSBI', 'UPI_ID')).toEqual(['Rahul@OKSBI']);
  });

  test('ignores an unknown handle and emails', () => {
    expect(found('rahul@randombank', 'UPI_ID')).toEqual([]);
    expect(found('test@example.com', 'UPI_ID')).toEqual([]);
  });
});

describe('phone rule: 10 digits, first digit 6-9', () => {
  test('finds numbers with and without the +91 prefix', () => {
    expect(found('9876543210', 'PHONE_NUMBER')).toEqual(['9876543210']);
    expect(found('call +91 9876543210', 'PHONE_NUMBER')).toEqual(['+91 9876543210']);
  });

  test('ignores a number starting with 0 to 5', () => {
    expect(found('5876543210', 'PHONE_NUMBER')).toEqual([]);
  });
});

describe('detection engine', () => {
  const sample = [
    'Card: 4111 1111 1111 1111',
    'Aadhaar: 2345 6789 0124',
    'PAN: ABCPE1234F',
    'Passport: A1234567',
    'IFSC: SBIN0001234',
    'UPI: rahul@oksbi',
    'Email: test.user@example.com',
    'Fake card (bad Luhn): 4111 1111 1111 1112',
  ].join('\n');

  test('finds every type in the sample and drops the bad card', () => {
    const matches = detectInChunk(sample, buildActiveDetectors(), new Set());
    expect(new Set(matches.map((match) => match.type))).toEqual(
      new Set(['CARD_NUMBER', 'AADHAAR_NUMBER', 'PAN_NUMBER', 'PASSPORT', 'IFSC', 'UPI_ID', 'EMAIL']),
    );
    expect(matches.some((match) => match.value === '4111 1111 1111 1112')).toBe(false);
  });

  test('a plain 10-digit number is a phone number, not a bank account', () => {
    const matches = detectInChunk('Mobile: 9876543210', buildActiveDetectors(), new Set());
    expect(matches.map((match) => match.type)).toEqual(['PHONE_NUMBER']);
  });

  test('the same number after "account" is a bank account', () => {
    const matches = detectInChunk('Account no. 9876543210', buildActiveDetectors(), new Set());
    expect(matches.map((match) => match.type)).toEqual(['BANK_ACCOUNT']);
  });

  test('on equal length, Card wins over Bank Account', () => {
    const matches = detectInChunk('Account 4111111111111111', buildActiveDetectors(), new Set());
    expect(matches.map((match) => match.type)).toEqual(['CARD_NUMBER']);
  });

  test('on equal length, Aadhaar wins over Bank Account', () => {
    const matches = detectInChunk('Account 234567890124', buildActiveDetectors(), new Set());
    expect(matches.map((match) => match.type)).toEqual(['AADHAAR_NUMBER']);
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
