import { SensitiveDataType } from '../types';

// Friendly names shown instead of the internal type names.
export const TYPE_LABELS: Record<SensitiveDataType, string> = {
  CARD_NUMBER: 'Card Number',
  AADHAAR_NUMBER: 'Aadhaar Number',
  PAN_NUMBER: 'PAN Number',
  PASSPORT: 'Passport Number',
  DRIVING_LICENCE: 'Driving Licence',
  VOTER_ID: 'Voter ID',
  BANK_ACCOUNT: 'Bank Account Number',
  IFSC: 'IFSC Code',
  UPI_ID: 'UPI ID',
  PHONE_NUMBER: 'Phone Number',
  EMAIL: 'Email Address',
};

export function friendlyType(type: string): string {
  return (TYPE_LABELS as Record<string, string>)[type] ?? type;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number): string => String(n).padStart(2, '0');

// "05 Oct 2026, 11:34 AM" (same format as the web page).
export function formatTimestamp(ms: number | null | undefined): string {
  if (ms == null) {
    return '–';
  }
  const d = new Date(ms);
  if (isNaN(d.getTime())) {
    return '–';
  }
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return pad(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + hours + ':' + pad(d.getMinutes()) + ' ' + ampm;
}

// "00:03:25" (hours:minutes:seconds).
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms) || ms < 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  return (
    pad(Math.floor(totalSeconds / 3600)) + ':' + pad(Math.floor((totalSeconds % 3600) / 60)) + ':' + pad(totalSeconds % 60)
  );
}

// "2026-10-05 11:34:07" (the format used inside the CSV report, like Java).
export function formatCsvTimestamp(ms: number | null | undefined): string {
  if (ms == null) {
    return '';
  }
  const d = new Date(ms);
  if (isNaN(d.getTime())) {
    return '';
  }
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  );
}

// "37.5%" of a total (the web page divides by 1 when the total is 0).
export function percentOf(part: number, total: number): string {
  return ((part / (total || 1)) * 100).toFixed(1) + '%';
}
