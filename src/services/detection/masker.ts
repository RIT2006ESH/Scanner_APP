// ============================================================
// Data masking, ported from the Java web version:
//   mask/DataMasker.java -> maskValue
//
// Masking hides most of a sensitive value before it is shown
// or saved, so the real number is never stored in plain text.
// Example: "4111 1111 1111 1234" -> "**** **** **** 1234"
// ============================================================
import { SensitiveDataType } from '../../types';

// How many characters at the end stay visible.
const VISIBLE_SUFFIX_LENGTH = 4;

// The character that replaces hidden characters.
const MASK_CHAR = '*';

// Main entry point: picks the right masking rule for each data type.
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
      // Compile-time safety: if a new SensitiveDataType is added and not
      // handled above, TypeScript reports an error on this line.
      const unhandled: never = type;
      throw new Error('No masking rule for type: ' + String(unhandled));
    }
  }
}

// Keeps the last 4 characters and replaces the rest with '*'.
// Spaces and dashes are kept in place so the format stays readable.
// Values of 4 characters or fewer are fully masked.
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

// PAN format is AAAAA9999A (5 letters, 4 digits, 1 letter).
// Same length as the original, only the last 4 characters stay visible,
// e.g. "ABCDE1234F" -> "******234F". Anything that is not exactly
// 10 characters is fully masked.
// (The Java version printed "*1234*"; this was changed on purpose so the
// length is not revealed and fewer digits are shown.)
function maskPan(rawValue: string): string {
  if (rawValue.length !== 10) {
    return MASK_CHAR.repeat(rawValue.length);
  }
  return MASK_CHAR.repeat(5) + rawValue.substring(5, 9) + MASK_CHAR;
}

// For values like "rahul@gmail.com": keep the first and last
// character of the name and the whole domain -> "r***l@gmail.com".
// Names of 2 characters or fewer are fully masked.
// Values without an '@' (or starting with '@') are fully masked.
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
