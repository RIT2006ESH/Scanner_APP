// ============================================================
// Scan options and the state of ONE scan run, ported from the Java
// web version:
//   core/ScanOptions.java            -> ScanOptions
//   core/ScanContext.java            -> counters and timing (ScanContext)
//   dashboard/ScanRunRecord.java     -> status, live findings, risk counts,
//                                       cancel (merged into ScanContext)
//   dashboard/ScanRunStatus (values) -> ScanRunStatus
//   model/ScanSummary.java           -> ScanSummary
//
// Mobile differences:
//   - JavaScript is single threaded, so no atomic counters or
//     synchronized lists are needed: plain numbers and arrays are safe.
//   - Java had two classes (ScanContext + ScanRunRecord). One class is
//     enough here, so it holds both.
//   - Dates are epoch milliseconds (Java used LocalDateTime), timing is
//     in milliseconds.
//   - Only the most recent findings stay in memory (like Java's live
//     buffer); the full list is saved to the local database.
//   - subscribe() lets a React screen follow the progress.
// ============================================================
import { RiskLevel, ScanResult } from '../../types';
import { CONFIG } from '../config';

// Java: record ScanOptions(recursive, includeHiddenFiles, excludeConfiguredPaths)
export interface ScanOptions {
  // true: go into sub-folders. false: scan only the files directly in the folder.
  recursive: boolean;
  // true: also scan files and folders whose name starts with "."
  includeHiddenFiles: boolean;
  // true: skip folders listed in excludedFolderNames (config.ts).
  excludeConfiguredPaths: boolean;
}

// Java: ScanOptions.defaults() -> (true, true, true)
export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  recursive: true,
  includeHiddenFiles: true,
  excludeConfiguredPaths: true,
};

// Java: enum ScanRunStatus
export type ScanRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Java: model/ScanSummary. Times are epoch milliseconds.
// findings holds the most recent findings only (the live buffer).
export interface ScanSummary {
  startTime: number;
  endTime: number;
  filesScanned: number;
  filesSkipped: number;
  errorsEncountered: number;
  findings: ScanResult[];
}

// Called when the scan state changes (see ScanContext.subscribe).
export type ScanProgressListener = (context: ScanContext) => void;

// Java used UUID.randomUUID(). Hermes has no built-in UUID function, and a
// run id only needs to be unique on this device, so time + random is enough.
export function createRunId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
}

// Listeners are told about a change at most this often, because a redraw
// per finding would make the screen stutter during a big scan.
const NOTIFY_INTERVAL_MS = 250;

// Holds everything that belongs to ONE scan run.
export class ScanContext {
  readonly runId: string;
  readonly startTime: number; // epoch milliseconds
  readonly scanPath: string; // label shown in the UI, e.g. the folders scanned

  status: ScanRunStatus = 'RUNNING';
  endTime: number | null = null;
  reportPath: string | null = null;

  // The file being processed right now (for progress text in the UI).
  currentFile: string | null = null;

  filesScanned = 0;
  filesSkipped = 0;
  errorsEncountered = 0;

  // Every finding of this run, and how many of each risk level.
  totalFindingsCount = 0;
  readonly riskCounts: Record<RiskLevel, number> = { CRITICAL: 0, MEDIUM: 0, NORMAL: 0 };

  // Time spent, in milliseconds (all files together).
  totalExtractionMs = 0;
  totalDetectionMs = 0;

  // Per file type (lowercase extension): total time and number of files.
  readonly extensionTimeMs = new Map<string, number>();
  readonly extensionFileCount = new Map<string, number>();

  private readonly recentFindings: ScanResult[] = [];
  private readonly liveFindingsBufferSize: number;
  private cancelRequested = false;

  private readonly listeners = new Set<ScanProgressListener>();
  private lastNotifyTime = 0;

  constructor(
    scanPath: string,
    liveFindingsBufferSize: number = CONFIG.liveFindingsBufferSize,
    runId: string = createRunId(),
    startTime: number = Date.now(),
  ) {
    this.scanPath = scanPath;
    this.liveFindingsBufferSize = liveFindingsBufferSize;
    this.runId = runId;
    this.startTime = startTime;
  }

  // ---------- findings ----------

  // Java: ScanRunRecord.addFinding. Keeps only the newest findings in
  // memory, but always counts every one.
  addFinding(result: ScanResult): void {
    this.recentFindings.push(result);
    while (this.recentFindings.length > this.liveFindingsBufferSize) {
      this.recentFindings.shift();
    }
    this.totalFindingsCount++;
    this.riskCounts[result.riskLevel]++;
    this.notify(false);
  }

  // A copy of the newest findings (Java: List.copyOf).
  getFindings(): ScanResult[] {
    return [...this.recentFindings];
  }

  // Java: countByRisk
  countByRisk(level: RiskLevel): number {
    return this.riskCounts[level];
  }

  // ---------- progress counters ----------

  setCurrentFile(path: string | null): void {
    this.currentFile = path;
    this.notify(false);
  }

  incrementFilesScanned(): void {
    this.filesScanned++;
    this.notify(false);
  }

  incrementFilesSkipped(): void {
    this.filesSkipped++;
    this.notify(false);
  }

  incrementErrorsEncountered(): void {
    this.errorsEncountered++;
    this.notify(false);
  }

  // ---------- timing (profiling) ----------

  // Java: recordExtractionTime(extension, nanos)
  recordExtractionTime(extension: string, ms: number): void {
    const key = extension.toLowerCase();
    this.totalExtractionMs += ms;
    this.extensionTimeMs.set(key, (this.extensionTimeMs.get(key) ?? 0) + ms);
    this.extensionFileCount.set(key, (this.extensionFileCount.get(key) ?? 0) + 1);
  }

  // Java: recordDetectionTime(nanos)
  recordDetectionTime(ms: number): void {
    this.totalDetectionMs += ms;
  }

  // ---------- cancel ----------

  // Called by the Cancel button. The scan loop checks isCancelRequested()
  // between files and stops.
  requestCancel(): void {
    this.cancelRequested = true;
  }

  isCancelRequested(): boolean {
    return this.cancelRequested;
  }

  // ---------- finishing the run ----------

  // Java: complete / fail / cancel. reportPath is where the exported
  // report was saved, if there is one.
  complete(reportPath: string | null = null): void {
    this.finish('COMPLETED', reportPath);
  }

  fail(): void {
    this.finish('FAILED', null);
  }

  cancel(reportPath: string | null = null): void {
    this.finish('CANCELLED', reportPath);
  }

  private finish(status: ScanRunStatus, reportPath: string | null): void {
    this.status = status;
    this.endTime = Date.now();
    this.reportPath = reportPath;
    this.currentFile = null;
    this.notify(true); // the final state is always delivered
  }

  // Java: new ScanSummary(...) built at the end of runScan.
  toSummary(): ScanSummary {
    return {
      startTime: this.startTime,
      endTime: this.endTime ?? Date.now(),
      filesScanned: this.filesScanned,
      filesSkipped: this.filesSkipped,
      errorsEncountered: this.errorsEncountered,
      findings: this.getFindings(),
    };
  }

  // ---------- following the progress from the UI ----------

  // Returns a function that stops listening. Typical use in a React effect:
  //   useEffect(() => context.subscribe(() => setTick((t) => t + 1)), [context]);
  subscribe(listener: ScanProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // force=true skips the 250 ms limit (used for the final state).
  private notify(force: boolean): void {
    if (this.listeners.size === 0) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastNotifyTime < NOTIFY_INTERVAL_MS) {
      return;
    }
    this.lastNotifyTime = now;
    for (const listener of this.listeners) {
      listener(this);
    }
  }
}
