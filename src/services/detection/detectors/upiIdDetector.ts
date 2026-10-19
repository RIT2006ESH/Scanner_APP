// ============================================================
// UPI ID detector. Rule from the web page's "Detection Rules":
//   An identifier followed by a known PSP handle, for example
//   "name@ybl" or "name@okaxis". Checked against known handle suffixes.
//
// NOTE: the list of handles below was written from memory, it was NOT
// copied from the web project. Add or remove handles as needed.
// ============================================================
import { PiiMatch } from '../../../types';
import { findMatches, SensitiveDataDetector } from './SensitiveDataDetector';

// Shape only: "name@handle". The handle is checked against the list below.
// (?!\.) keeps emails like "rahul@gmail.com" out (the email detector handles them).
const UPI_PATTERN = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{3,64}\b(?!\.)/g;

// Handles are written in lowercase; the comparison ignores case.
const KNOWN_HANDLES: ReadonlySet<string> = new Set([
  // PhonePe
  'ybl', 'ibl', 'axl',
  // Google Pay
  'okaxis', 'okhdfcbank', 'okicici', 'oksbi', 'okbizaxis',
  // Paytm
  'paytm', 'pthdfc', 'ptsbi', 'ptyes',
  // Amazon Pay and others
  'apl', 'yapl', 'rapl', 'freecharge', 'ikwik', 'ezetap', 'abfspay', 'airtel',
  // Banks
  'upi', 'sbi', 'icici', 'hdfcbank', 'axisbank', 'kotak', 'fbl', 'cnrb', 'barodampay',
  'aubank', 'idfcbank', 'jupiteraxis', 'postbank', 'yesbank', 'pnb', 'boi', 'unionbank',
  'indus', 'hsbc', 'idbi', 'rbl', 'federal', 'dbs', 'sib', 'kvb', 'cub', 'iob', 'uboi',
]);

export const upiIdDetector: SensitiveDataDetector = {
  type: 'UPI_ID',
  detectMatches(text: string | null | undefined): PiiMatch[] {
    return findMatches(UPI_PATTERN, text).filter((match) => {
      const handle = match.value.substring(match.value.indexOf('@') + 1).toLowerCase();
      return KNOWN_HANDLES.has(handle);
    });
  },
};
