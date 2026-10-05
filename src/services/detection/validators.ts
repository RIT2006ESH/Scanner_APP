// ============================================================
// Checksum validators, ported from the Java web version:
//   validator/LuhnValidator.java            -> isValidLuhn
//   validator/AadhaarChecksumValidator.java -> isValidAadhaar
//
// A regex only checks the SHAPE of a number. These validators
// check the math, which removes most false positives
// (for example a random 16-digit number that is not a real card).
// ============================================================

// Removes everything except digits, so "4111-1111 1111 1111"
// becomes "4111111111111111". Null/undefined become an empty string.
function stripNonDigits(input: string | null | undefined): string {
  return input == null ? '' : input.replace(/[^0-9]/g, '');
}

// ------------------------------------------------------------
// Luhn checksum: used for debit/credit card numbers (13 to 19 digits).
//
// How it works:
//   1. Go through the digits from right to left.
//   2. Double every second digit; if the result is above 9, subtract 9.
//   3. Add everything up.
//   4. The number is valid if the total is divisible by 10.
// ------------------------------------------------------------
export function isValidLuhn(rawCandidate: string | null | undefined): boolean {
  const digitsOnly = stripNonDigits(rawCandidate);

  // Cards are 13 to 19 digits long; anything else is rejected immediately.
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false; // the rightmost digit is NOT doubled

  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    // charCodeAt(i) - 48 converts the character '0'..'9' to the number 0..9
    let digit = digitsOnly.charCodeAt(i) - 48;

    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9; // same as adding the two digits of the result
      }
    }

    sum += digit;
    doubleDigit = !doubleDigit; // alternate for the next digit
  }

  return sum % 10 === 0;
}

// ------------------------------------------------------------
// Verhoeff tables, used by the Aadhaar checksum.
// Verhoeff catches all single-digit errors and most swaps of
// two neighbouring digits, which Luhn cannot always do.
// ------------------------------------------------------------

// Multiplication table (the "d" table of the Verhoeff algorithm).
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

// ------------------------------------------------------------
// Aadhaar checksum (Verhoeff): an Aadhaar number is exactly 12 digits.
//
// How it works:
//   1. Go through the digits from right to left, with position i = 0, 1, 2...
//   2. For each digit, permute it using row (i % 8) of the permutation table.
//   3. Combine it with the running checksum using the multiplication table.
//   4. The number is valid if the final checksum is 0.
// ------------------------------------------------------------
export function isValidAadhaar(rawCandidate: string | null | undefined): boolean {
  const digitsOnly = stripNonDigits(rawCandidate);

  // Aadhaar must be exactly 12 digits.
  if (digitsOnly.length !== 12) {
    return false;
  }

  let checksum = 0;
  const length = digitsOnly.length;

  for (let i = 0; i < length; i++) {
    // Read digits from the right: position 0 is the last digit.
    const digit = digitsOnly.charCodeAt(length - 1 - i) - 48;
    checksum = MULTIPLICATION_TABLE[checksum][PERMUTATION_TABLE[i % 8][digit]];
  }

  return checksum === 0;
}
