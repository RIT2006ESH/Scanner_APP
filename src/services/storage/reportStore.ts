import { getDbKey } from './dbKey';
// ============================================================
// Local result store (SQLite, encrypted with sqlcipher) using op-sqlite.
// Saves every finding of a scan and one record per scan run, reads them
// back, and exports a CSV.
//
// Replaces the Java report files (report/Incremental*ReportWriter,
// ReportRetentionCleaner) and the web "Scan History" list.
//
// NOTE: In current op-sqlite, execute() is ASYNC, so every call awaits.
// ============================================================
import { open, DB } from '@op-engineering/op-sqlite';
import RNFS from 'react-native-fs';
import { Confidence, RiskLevel, ScanResult, SensitiveDataType } from '../../types';
import { CONFIG } from '../config';
import { ScanRunStatus } from '../core/scanContext';

// One finished scan (the web page's Scan History row).
export interface ScanRunRecord {
  runId: string;
  status: ScanRunStatus;
  scanPath: string;
  startTime: number; // epoch milliseconds
  endTime: number | null;
  criticalCount: number;
  mediumCount: number;
  normalCount: number;
  totalFindings: number;
  filesScanned: number;
  filesSkipped: number;
  errorsEncountered: number;
  deepScan: boolean;
}

let dbPromise: Promise<DB> | null = null;

function getDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const dbKey = await getDbKey();
      const db = open({
        name: 'sentinelscan.db',
        encryptionKey: dbKey,
      });

      // One row per finding. Dates are epoch milliseconds.
      // fileCreationTime can be NULL (Android often does not provide it).
      await db.execute(`
        CREATE TABLE IF NOT EXISTS scan_findings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          runId TEXT NOT NULL,
          fileName TEXT NOT NULL,
          filePath TEXT NOT NULL,
          dataType TEXT NOT NULL,
          riskLevel TEXT NOT NULL,
          maskedValue TEXT NOT NULL,
          scanTimestamp INTEGER NOT NULL,
          fileCreationTime INTEGER,
          fileModifiedTime INTEGER NOT NULL,
          confidence TEXT NOT NULL DEFAULT 'PATTERN'
        );
      `);

      // Databases created before the confidence column existed get it added.
      // Old rows keep the default value, so nothing is lost.
      const info = await db.execute('PRAGMA table_info(scan_findings)');
      const hasConfidence = extractRows(info.rows).some((row) => row.name === 'confidence');
      if (!hasConfidence) {
        await db.execute(
          "ALTER TABLE scan_findings ADD COLUMN confidence TEXT NOT NULL DEFAULT 'PATTERN'",
        );
      }

      // One row per scan run (the Scan History list). Created if missing,
      // so an existing database keeps all its findings.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS scan_runs (
          runId TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          scanPath TEXT NOT NULL,
          startTime INTEGER NOT NULL,
          endTime INTEGER,
          criticalCount INTEGER NOT NULL DEFAULT 0,
          mediumCount INTEGER NOT NULL DEFAULT 0,
          normalCount INTEGER NOT NULL DEFAULT 0,
          totalFindings INTEGER NOT NULL DEFAULT 0,
          filesScanned INTEGER NOT NULL DEFAULT 0,
          filesSkipped INTEGER NOT NULL DEFAULT 0,
          errorsEncountered INTEGER NOT NULL DEFAULT 0,
          deepScan INTEGER NOT NULL DEFAULT 0
        );
      `);

      await db.execute('CREATE INDEX IF NOT EXISTS idx_findings_run ON scan_findings (runId)');
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_findings_time ON scan_findings (scanTimestamp)',
      );
      await db.execute('CREATE INDEX IF NOT EXISTS idx_runs_start ON scan_runs (startTime)');
      return db;
    })();

    // If setup fails, clear the cache so the next call can retry.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// ------------------------------------------------------------
// Write queue: writes run strictly one after another.
// ------------------------------------------------------------
let writeChain: Promise<unknown> = Promise.resolve();

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task);
  writeChain = result.catch(() => undefined);
  return result;
}

const INSERT_SQL =
  'INSERT INTO scan_findings ' +
  '(runId, fileName, filePath, dataType, riskLevel, maskedValue, scanTimestamp, fileCreationTime, fileModifiedTime, confidence) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

// Saves many findings of one scan run in a single transaction:
// either all are saved or none. Uses ? placeholders (no SQL injection).
export async function saveFindings(runId: string, results: readonly ScanResult[]): Promise<void> {
  if (results.length === 0) {
    return;
  }

  await runSerialized(async () => {
    const db = await getDb();
    await db.execute('BEGIN');
    try {
      for (const r of results) {
        await db.execute(INSERT_SQL, [
          runId,
          r.fileName,
          r.filePath,
          r.dataType,
          r.riskLevel,
          r.maskedValue,
          r.scanTimestamp,
          r.fileCreationTime,
          r.fileModifiedTime,
          r.confidence,
        ]);
      }
      await db.execute('COMMIT');
    } catch (error) {
      try {
        await db.execute('ROLLBACK');
      } catch {
        // nothing more can be done; report the original error below
      }
      throw error;
    }
  });
}

export function saveFinding(runId: string, result: ScanResult): Promise<void> {
  return saveFindings(runId, [result]);
}

// Saves (or replaces) the record of one scan run. Called when a scan
// ends, whatever the result: completed, cancelled or failed.
export async function saveRun(run: ScanRunRecord): Promise<void> {
  await runSerialized(async () => {
    const db = await getDb();
    await db.execute(
      'INSERT OR REPLACE INTO scan_runs ' +
        '(runId, status, scanPath, startTime, endTime, criticalCount, mediumCount, normalCount, ' +
        'totalFindings, filesScanned, filesSkipped, errorsEncountered, deepScan) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        run.runId,
        run.status,
        run.scanPath,
        run.startTime,
        run.endTime,
        run.criticalCount,
        run.mediumCount,
        run.normalCount,
        run.totalFindings,
        run.filesScanned,
        run.filesSkipped,
        run.errorsEncountered,
        run.deepScan ? 1 : 0,
      ],
    );
  });
}

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------

// Newer op-sqlite: result.rows is a plain array.
// Older op-sqlite: rows were wrapped as rows._array.
function extractRows(rows: unknown): Record<string, unknown>[] {
  if (Array.isArray(rows)) {
    return rows as Record<string, unknown>[];
  }
  const legacy = (rows as { _array?: unknown[] } | undefined)?._array;
  return (legacy ?? []) as Record<string, unknown>[];
}

function rowToScanResult(row: Record<string, unknown>): ScanResult {
  return {
    fileName: String(row.fileName),
    filePath: String(row.filePath),
    dataType: String(row.dataType) as SensitiveDataType,
    riskLevel: String(row.riskLevel) as RiskLevel,
    maskedValue: String(row.maskedValue),
    scanTimestamp: Number(row.scanTimestamp),
    fileCreationTime: row.fileCreationTime == null ? null : Number(row.fileCreationTime),
    fileModifiedTime: Number(row.fileModifiedTime),
    confidence: (row.confidence == null ? 'PATTERN' : String(row.confidence)) as Confidence,
  };
}

function rowToRun(row: Record<string, unknown>): ScanRunRecord {
  return {
    runId: String(row.runId),
    status: String(row.status) as ScanRunStatus,
    scanPath: String(row.scanPath),
    startTime: Number(row.startTime),
    endTime: row.endTime == null ? null : Number(row.endTime),
    criticalCount: Number(row.criticalCount),
    mediumCount: Number(row.mediumCount),
    normalCount: Number(row.normalCount),
    totalFindings: Number(row.totalFindings),
    filesScanned: Number(row.filesScanned),
    filesSkipped: Number(row.filesSkipped),
    errorsEncountered: Number(row.errorsEncountered),
    deepScan: Number(row.deepScan) === 1,
  };
}

// All findings of one scan run, newest first.
export async function getFindingsByRun(runId: string, limit: number = 5000): Promise<ScanResult[]> {
  const db = await getDb();
  const result = await db.execute(
    'SELECT * FROM scan_findings WHERE runId = ? ORDER BY scanTimestamp DESC, id DESC LIMIT ?',
    [runId, limit],
  );
  return extractRows(result.rows).map(rowToScanResult);
}

// The most recent findings across all runs, newest first.
export async function getAllFindings(limit: number = 1000): Promise<ScanResult[]> {
  const db = await getDb();
  const result = await db.execute(
    'SELECT * FROM scan_findings ORDER BY scanTimestamp DESC, id DESC LIMIT ?',
    [limit],
  );
  return extractRows(result.rows).map(rowToScanResult);
}

// The scan history, newest scan first.
export async function getRuns(limit: number = 200): Promise<ScanRunRecord[]> {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM scan_runs ORDER BY startTime DESC LIMIT ?', [limit]);
  return extractRows(result.rows).map(rowToRun);
}

// ------------------------------------------------------------
// CSV export (Java: the CSV report writer)
// 8 columns. Values are already masked, the real numbers are never stored.
// ------------------------------------------------------------
const CSV_HEADER =
  'File Name,File Path,Data Type,Risk Level,Masked Value,Scan Timestamp,File Creation Time,File Modified Time';

// Quotes a CSV field. A leading = + - @ is prefixed with ' so Excel never
// runs a file name like "=cmd|..." as a formula (CSV injection).
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function csvDate(epochMs: number | null): string {
  return epochMs == null ? '' : new Date(epochMs).toISOString();
}

export function exportFolder(): string {
  return RNFS.DocumentDirectoryPath + '/exports';
}

// Writes findings to a CSV file inside the app's own folder and returns its
// path. runId given = that run only, otherwise the most recent findings.
// NOTE: the CSV is a plain (not encrypted) file.
export async function exportFindingsToCsv(runId?: string): Promise<string> {
  const findings = runId
    ? await getFindingsByRun(runId, 100000)
    : await getAllFindings(100000);

  const lines = [CSV_HEADER];
  for (const f of findings) {
    lines.push(
      [
        csvField(f.fileName),
        csvField(f.filePath),
        csvField(f.dataType),
        csvField(f.riskLevel),
        csvField(f.maskedValue),
        csvDate(f.scanTimestamp),
        csvDate(f.fileCreationTime),
        csvDate(f.fileModifiedTime),
      ].join(','),
    );
  }

  await RNFS.mkdir(exportFolder());
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = exportFolder() + '/sentinelscan_' + stamp + '.csv';
  await RNFS.writeFile(path, lines.join('\n') + '\n', 'utf8');
  return path;
}

// ------------------------------------------------------------
// Cleanup (Java: ReportRetentionCleaner)
// ------------------------------------------------------------
export async function deleteExpiredFindings(
  retentionDays: number = CONFIG.report.retentionDays,
): Promise<void> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await runSerialized(async () => {
    const db = await getDb();
    await db.execute('DELETE FROM scan_findings WHERE scanTimestamp < ?', [cutoff]);
    await db.execute('DELETE FROM scan_runs WHERE startTime < ?', [cutoff]);
  });
}

export async function clearAllFindings(): Promise<void> {
  await runSerialized(async () => {
    const db = await getDb();
    await db.execute('DELETE FROM scan_findings');
    await db.execute('DELETE FROM scan_runs');
  });
}
