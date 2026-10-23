import { Share } from 'react-native';
import RNFS from 'react-native-fs';
import { ScanResult } from '../../types';
import { formatCsvTimestamp } from '../../ui/format';

const HEADER = [
  'File Name',
  'File Path',
  'Sensitive Data Type',
  'Risk Level',
  'Masked Value',
  'Scan Timestamp',
  'File Created',
  'File Modified',
  'Confidence',
];
function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

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
        f.confidence,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export async function exportFindingsCsv(findings: readonly ScanResult[]): Promise<string> {
  const folder = RNFS.ExternalDirectoryPath + '/reports';
  await RNFS.mkdir(folder);

  const stamp = formatCsvTimestamp(Date.now()).replace(/[: ]/g, '-');
  const path = folder + '/scan-report-' + stamp + '.csv';
  const csv = buildCsv(findings);
  await RNFS.writeFile(path, csv, 'utf8');

  try {
    await Share.share({ title: 'Scan report', message: csv });
  } catch (error) {
    console.warn('Could not open the share sheet: ' + String(error));
  }
  return path;
}
