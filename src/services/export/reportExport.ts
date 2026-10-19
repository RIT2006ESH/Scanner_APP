// ============================================================
// CSV export of findings, ported from the Java web version:
//   report/IncrementalCsvReportWriter.java (same 8 columns)
//
// The values are already masked, so the report never holds real numbers.
// On the phone the file is saved in the app's own reports folder
// (no storage permission needed) and the share sheet is opened, so the
// user can send it to Gmail, Drive, WhatsApp and so on.
// ============================================================
import { Share } from 'react-native';
import RNFS from 'react-native-fs';
import { ScanResult } from '../../types';
import { formatCsvTimestamp } from '../../ui/format';

// Same column names as the Java report.
const HEADER = [
  'File Name',
  'File Path',
  'Sensitive Data Type',
  'Risk Level',
  'Masked Value',
  'Scan Timestamp',
  'File Created',
  'File Modified',
];

// Quotes a value if it contains a comma, a quote or a new line.
function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

// Builds the whole CSV text.
export function buildCsv(findings: readonly ScanResult[]): string {
  const lines = [HEADER.map(csvEscape).join(',')];
  for (const f of findings) {
    lines.push(
      [
        f.fileName,
        f.filePath,
        f.dataType,
        f.riskLevel,
        f.maskedValue,
        formatCsvTimestamp(f.scanTimestamp),
        formatCsvTimestamp(f.fileCreationTime),
        formatCsvTimestamp(f.fileModifiedTime),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

// Saves the CSV and opens the share sheet. Returns the saved file path.
export async function exportFindingsCsv(findings: readonly ScanResult[]): Promise<string> {
  const folder = RNFS.ExternalDirectoryPath + '/reports';
  await RNFS.mkdir(folder);

  const stamp = formatCsvTimestamp(Date.now()).replace(/[: ]/g, '-');
  const path = folder + '/scan-report-' + stamp + '.csv';
  const csv = buildCsv(findings);
  await RNFS.writeFile(path, csv, 'utf8');

  // Sharing is a bonus: a very large report may be too big to share as
  // text, and the saved file is still there.
  try {
    await Share.share({ title: 'Scan report', message: csv });
  } catch (error) {
    console.warn('Could not open the share sheet: ' + String(error));
  }
  return path;
}
