import { SensitiveDataType } from '../../types';

const VISIBLE_SUFFIX_LENGTH = 4;

const MASK_CHAR = '*';

export function maskValue(
  rawValue: string | null | undefined,
  type: SensitiveDataType,
): string {
  // Nothing to mask.
  if (rawValue == null || rawValue.length === 0) {
    return '';
  }

  switch (type) {
    // Numbers and IDs: hide everything except the last 4 characters.
    case 'CARD_NUMBER':
    case 'AADHAAR_NUMBER':
    case 'BANK_ACCOUNT':
    case 'PHONE_NUMBER':
    case 'PASSPORT':
    case 'DRIVING_LICENCE':
    case 'VOTER_ID':
    case 'IFSC':
      return maskKeepingLastFour(rawValue);

    // PAN has its own rule (see maskPan below).
    case 'PAN_NUMBER':
      return maskPan(rawValue);

    // UPI IDs and emails look like "name@domain": hide the name, keep the domain.
    case 'UPI_ID':
    case 'EMAIL':
      return maskEmailLike(rawValue);

    default: {
      const unhandled: never = type;
      throw new Error('No masking rule for type: ' + String(unhandled));
    }
  }
}

// Keeps the last 4 characters and replaces the rest with '*'.
function maskKeepingLastFour(rawValue: string): string {
  const length = rawValue.length;

  if (length <= VISIBLE_SUFFIX_LENGTH) {
    return MASK_CHAR.repeat(length);
  }

  // Characters from this index onwards stay visible.
  const visibleFrom = length - VISIBLE_SUFFIX_LENGTH;
  let masked = '';

  for (let i = 0; i < length; i++) {
    const currentChar = rawValue.charAt(i);
    const isSeparator = currentChar === ' ' || currentChar === '-';
    const isInVisibleSuffix = i >= visibleFrom;

    if (isSeparator || isInVisibleSuffix) {
      masked += currentChar;
    } else {
      masked += MASK_CHAR;
    }
  }

  return masked;
}

function maskPan(rawValue: string): string {
  if (rawValue.length !== 10) {
    return MASK_CHAR.repeat(rawValue.length);
  }
  return MASK_CHAR.repeat(5) + rawValue.substring(5, 9) + MASK_CHAR;
}

function maskEmailLike(rawValue: string): string {
  const atIndex = rawValue.indexOf('@');
  if (atIndex <= 0) {
    return MASK_CHAR.repeat(rawValue.length);
  }

  const localPart = rawValue.substring(0, atIndex); // text before '@'
  const domainPart = rawValue.substring(atIndex);   // '@' and everything after

  const maskedLocal =
    localPart.length <= 2
      ? MASK_CHAR.repeat(localPart.length)
      : localPart.charAt(0) +
        MASK_CHAR.repeat(localPart.length - 2) +
        localPart.charAt(localPart.length - 1);

  return maskedLocal + domainPart;
}
