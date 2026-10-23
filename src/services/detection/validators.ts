function stripNonDigits(input: string | null | undefined): string {
  return input == null ? '' : input.replace(/[^0-9]/g, '');
}
export function isValidLuhn(rawCandidate: string | null | undefined): boolean {
  const digitsOnly = stripNonDigits(rawCandidate);
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false;

  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = digitsOnly.charCodeAt(i) - 48;

    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

const MULTIPLICATION_TABLE: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Permutation table (the "p" table of the Verhoeff algorithm).
const PERMUTATION_TABLE: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function isValidAadhaar(rawCandidate: string | null | undefined): boolean {
  const digitsOnly = stripNonDigits(rawCandidate);
  if (digitsOnly.length !== 12) {
    return false;
  }

  let checksum = 0;
  const length = digitsOnly.length;

  for (let i = 0; i < length; i++) {
    const digit = digitsOnly.charCodeAt(length - 1 - i) - 48;
    checksum = MULTIPLICATION_TABLE[checksum][PERMUTATION_TABLE[i % 8][digit]];
  }

  return checksum === 0;
}
