import RNFS from 'react-native-fs';
import { Confidence, ScanResult, SensitiveDataType } from '../types';
import { CONFIG, getExtension, isSupportedExtension } from './config';
import {
  DEFAULT_SCAN_OPTIONS,
  ScanContext,
  ScanOptions,
  ScanSummary,
} from './core/scanContext';
import { DiscoveredFile, walkFiles } from './discovery/fileDiscovery';
import { getExtractor } from './extraction/textExtractor';
import { buildActiveDetectors } from './detection/detectorRegistry';
import {
  buildScanResult,
  detectInChunk,
  FileInfo,
  ValidatedMatch,
} from './detection/detectionEngine';
import { SensitiveDataDetector } from './detection/detectors/SensitiveDataDetector';
import {
  buildContext,
  classifyCandidate,
  isModelDownloaded,
  loadModel,
  needsSlmReview,
  unloadModel,
} from './slm/slmClassifier';
import { deleteExpiredFindings, saveFindings, saveRun } from './storage/reportStore';

// What to scan.
export interface ScanRequest {
  // Folders to scan (what the user picked).
  roots: readonly string[];
  // Recursive / hidden files / excluded folders. Default: all on.
  options?: ScanOptions;
  // Only look for these data types. Empty or missing = all types.
  enabledTypes?: ReadonlySet<SensitiveDataType> | null;
  // true: let the on-device model double-check uncertain findings.
  deepScan?: boolean;
}

// What the model review did (null in the result = deep scan was off).
export interface SlmStats {
  reviewed: number; // findings the model looked at
  rejected: number; // findings the model said were false alarms (dropped)
  note: string | null; // why the model was not (fully) used, if so
}

// The summary of the scan, plus the model review numbers.
export type ScanOutcome = ScanSummary & { slm: SlmStats | null };

// A finding waiting for the model's opinion.
interface SlmCandidate {
  match: ValidatedMatch;
  snippet: string; // text around the value, value marked with [[ ]]
  file: FileInfo;
}

// At most this many findings are sent to the model in one scan. Any extra
// are kept as findings the model did not review.
const MAX_SLM_CANDIDATES = 100;

// The model review stops after this long. Findings that were not reviewed
// yet are kept as findings the model did not review. (Each review takes a
// second or more, and much longer on an emulator.)
const SLM_TIME_BUDGET_MS = 2 * 60 * 1000;

// Save findings in groups of this size during the model review.
const SAVE_BATCH_SIZE = 20;

// Every this many files, the screen gets a moment to redraw.
const YIELD_EVERY_FILES = 10;

// JavaScript is single threaded. A zero-delay timer lets the screen
// redraw and touches work, so the app does not look frozen during a scan.
const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Java: DiskSpaceGuard.hasEnoughSpace. If the free space cannot be read,
// the scan is allowed to continue.
async function hasEnoughFreeSpace(): Promise<boolean> {
  try {
    const info = await RNFS.getFSInfo();
    return info.freeSpace >= CONFIG.minFreeDiskSpaceMb * 1024 * 1024;
  } catch {
    return true;
  }
}

// Saves the scan in the history list. A failure here is only logged: it
// must never turn a finished scan into a failed one.
async function recordRun(context: ScanContext, deepScan: boolean): Promise<void> {
  try {
    await saveRun({
      runId: context.runId,
      status: context.status,
      scanPath: context.scanPath,
      startTime: context.startTime,
      endTime: context.endTime,
      criticalCount: context.countByRisk('CRITICAL'),
      mediumCount: context.countByRisk('MEDIUM'),
      normalCount: context.countByRisk('NORMAL'),
      totalFindings: context.totalFindingsCount,
      filesScanned: context.filesScanned,
      filesSkipped: context.filesSkipped,
      errorsEncountered: context.errorsEncountered,
      deepScan,
    });
  } catch (error) {
    console.warn('Could not save the scan history entry: ' + String(error));
  }
}

// ------------------------------------------------------------
// One file (Java: processFile + detectAndRecordFindings)
// ------------------------------------------------------------
async function processFile(
  file: DiscoveredFile,
  context: ScanContext,
  activeDetectors: readonly SensitiveDataDetector[],
  slmQueue: SlmCandidate[] | null,
): Promise<void> {
  // Too big to read safely: count as skipped.
  if (file.size != null && file.size > CONFIG.maxFileSizeMb * 1024 * 1024) {
    context.incrementFilesSkipped();
    return;
  }

  context.setCurrentFile(file.path);

  // Unsupported file types and types without an extractor (pdf, for now)
  // are counted as skipped, like in Java.
  const extension = getExtension(file.name);
  if (!isSupportedExtension(extension)) {
    context.incrementFilesSkipped();
    return;
  }
  const extractor = getExtractor(extension);
  if (extractor == null) {
    context.incrementFilesSkipped();
    return;
  }

  // Values already reported in THIS file (the same number is reported once).
  const alreadyFoundInFile = new Set<string>();

  // File details stored with every finding. If Android did not give a
  // modified time, the scan time is used instead.
  const fileInfo: FileInfo = {
    filePath: file.path,
    fileName: file.name,
    creationTime: file.creationTime,
    modifiedTime: file.modifiedTime ?? Date.now(),
  };

  const fileFindings: ScanResult[] = [];
  let detectionMs = 0;
  let timedOut = false;
  const startedAt = Date.now();

  // The extractor reads the file and calls this for every chunk of text.
  // Throwing from here stops the extractor (used for cancel and timeout).
  const work = extractor(file.path, (chunk) => {
    if (timedOut || context.isCancelRequested()) {
      throw new Error('File processing stopped');
    }

    const detectStart = Date.now();
    const matches = detectInChunk(chunk, activeDetectors, alreadyFoundInFile);
    detectionMs += Date.now() - detectStart;

    for (const match of matches) {
      // Deep scan: weak findings wait for the model's opinion.
      if (slmQueue != null && needsSlmReview(match.type)) {
        if (slmQueue.length < MAX_SLM_CANDIDATES) {
          slmQueue.push({
            match,
            snippet: buildContext(chunk, match.start, match.end),
            file: fileInfo,
          });
          continue;
        }
        // The queue is full: keep the finding, but say the model did not see it.
        const overflow = buildScanResult(match, fileInfo, Date.now(), 'MODEL_UNREVIEWED');
        fileFindings.push(overflow);
        context.addFinding(overflow);
        continue;
      }

      const result = buildScanResult(match, fileInfo);
      fileFindings.push(result);
      context.addFinding(result);
    }
  });
  // If the timeout wins the race below, this later failure must not
  // become an "unhandled promise rejection".
  work.catch(() => undefined);

  // Java: future.get(perFileTimeoutSeconds). A running task cannot be killed
  // in JavaScript; the flag makes the next chunk stop it instead.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Timed out'));
    }, CONFIG.perFileTimeoutSeconds * 1000);
  });

  try {
    await Promise.race([work, timeout]);
    context.incrementFilesScanned();
  } catch (error) {
    if (timedOut) {
      context.incrementErrorsEncountered();
      console.warn(
        'A file exceeded the ' + CONFIG.perFileTimeoutSeconds + 's budget and was abandoned: ' + file.path,
      );
    } else if (!context.isCancelRequested()) {
      // Java: IOException while extracting -> counted as an error.
      context.incrementErrorsEncountered();
      console.warn('Failed to extract text from ' + file.path + ': ' + String(error));
    }
    // If the user cancelled, this is not an error.
  } finally {
    clearTimeout(timer);
  }

  // Save what was found in this file (also after a timeout or cancel, so
  // the findings shown on screen are never missing from the database).
  if (fileFindings.length > 0) {
    try {
      await saveFindings(context.runId, fileFindings);
    } catch (error) {
      // Java only logged this; here it also counts as an error, because a
      // finding that is on screen but not stored would be lost silently.
      context.incrementErrorsEncountered();
      console.warn('Failed to save findings of ' + file.path + ': ' + String(error));
    }
  }

  // Time spent: detection is measured, extraction is the rest.
  context.recordDetectionTime(detectionMs);
  context.recordExtractionTime(extension, Math.max(0, Date.now() - startedAt - detectionMs));
}

// ------------------------------------------------------------
// Stage 2: the model confirms or rejects the queued findings.
// Anything that was not reviewed (model missing, model failed, time limit
// reached, scan cancelled) is kept as a finding marked MODEL_UNREVIEWED.
// ------------------------------------------------------------
async function reviewWithSlm(queue: SlmCandidate[], context: ScanContext): Promise<SlmStats> {
  const stats: SlmStats = { reviewed: 0, rejected: 0, note: null };
  const pending: ScanResult[] = [];

  // Saves the findings collected so far.
  const flush = async (): Promise<void> => {
    if (pending.length === 0) {
      return;
    }
    const batch = pending.splice(0, pending.length);
    try {
      await saveFindings(context.runId, batch);
    } catch (error) {
      context.incrementErrorsEncountered();
      console.warn('Failed to save findings: ' + String(error));
    }
  };

  // Accepts a candidate as a finding, with the given confidence.
  const accept = (candidate: SlmCandidate, confidence: Confidence): void => {
    const result = buildScanResult(candidate.match, candidate.file, Date.now(), confidence);
    context.addFinding(result);
    pending.push(result);
  };

  let modelReady = false;
  try {
    if (await isModelDownloaded()) {
      context.setCurrentFile('Loading the on-device model');
      await loadModel();
      modelReady = true;
    } else {
      stats.note = 'Model not downloaded, so only pattern matching was used.';
    }
  } catch (error) {
    stats.note = 'Model could not be loaded, so only pattern matching was used.';
    console.warn('Model load failed: ' + String(error));
  }

  // index = the first candidate that has not been reviewed yet.
  let index = 0;
  if (modelReady) {
    // The time limit counts from here, not from the model loading.
    const reviewStart = Date.now();
    try {
      for (; index < queue.length; index++) {
        if (context.isCancelRequested()) {
          break;
        }
        if (Date.now() - reviewStart > SLM_TIME_BUDGET_MS) {
          stats.note =
            'Model review stopped after ' + SLM_TIME_BUDGET_MS / 1000 + ' seconds. ' +
            (queue.length - index) + ' finding(s) were kept without review.';
          break;
        }
        context.setCurrentFile('Model review ' + (index + 1) + ' of ' + queue.length);

        const candidate = queue[index];
        let genuine = true; // if the model fails, the finding is kept
        let reviewedByModel = false;
        try {
          genuine = await classifyCandidate(
            candidate.match.type,
            candidate.match.value,
            candidate.snippet,
          );
          reviewedByModel = true;
          stats.reviewed++;
        } catch (error) {
          console.warn('Model could not review a finding, keeping it: ' + String(error));
        }

        if (genuine) {
          accept(candidate, reviewedByModel ? 'MODEL_CONFIRMED' : 'MODEL_UNREVIEWED');
        } else {
          stats.rejected++;
        }
        if (pending.length >= SAVE_BATCH_SIZE) {
          await flush();
        }
      }
    } finally {
      try {
        await unloadModel();
      } catch (error) {
        console.warn('Could not unload the model: ' + String(error));
      }
    }
  }

  // Not reviewed: keep, marked as not reviewed by the model.
  for (; index < queue.length; index++) {
    accept(queue[index], 'MODEL_UNREVIEWED');
  }
  await flush();
  return stats;
}

// ------------------------------------------------------------
// A whole scan (Java: ScanOrchestrator.runScan)
// ------------------------------------------------------------
export async function executeScan(
  context: ScanContext,
  request: ScanRequest,
): Promise<ScanOutcome> {
  const options = request.options ?? DEFAULT_SCAN_OPTIONS;
  const deepScan = request.deepScan === true;

  if (!(await hasEnoughFreeSpace())) {
    console.error('Scan aborted before starting: insufficient storage.');
    context.incrementErrorsEncountered();
    context.fail();
    await recordRun(context, deepScan);
    return { ...context.toSummary(), slm: null };
  }

  const activeDetectors = buildActiveDetectors(request.enabledTypes);
  const slmQueue: SlmCandidate[] | null = deepScan ? [] : null;
  console.log(
    'Starting scan run ' + context.runId + ' with ' + activeDetectors.length +
      ' active detectors, deep scan: ' + (deepScan ? 'on' : 'off') +
      ', scope: ' + context.scanPath,
  );

  try {
    let processedFiles = 0;

    await walkFiles(
      request.roots,
      async (file) => {
        if (context.isCancelRequested()) {
          return;
        }
        await processFile(file, context, activeDetectors, slmQueue);

        processedFiles++;
        if (processedFiles % YIELD_EVERY_FILES === 0) {
          await yieldToUi();
        }
      },
      options,
      () => context.isCancelRequested(),
    );

    // Stage 2: the model looks at the uncertain findings.
    let slm: SlmStats | null = null;
    if (slmQueue != null) {
      slm =
        slmQueue.length > 0
          ? await reviewWithSlm(slmQueue, context)
          : { reviewed: 0, rejected: 0, note: null };
    }

    if (context.isCancelRequested()) {
      context.cancel();
      console.log(
        'Scan run ' + context.runId + ' cancelled. Scanned: ' + context.filesScanned +
          ', findings so far: ' + context.totalFindingsCount,
      );
    } else {
      context.complete();
      console.log(
        'Scan run ' + context.runId + ' complete. Scanned: ' + context.filesScanned +
          ', skipped: ' + context.filesSkipped + ', errors: ' + context.errorsEncountered +
          ', findings: ' + context.totalFindingsCount +
          (slm != null ? ', model reviewed: ' + slm.reviewed + ', dropped: ' + slm.rejected : ''),
      );
    }

    // Scan history entry, then Java's reportRetentionCleaner.cleanup().
    // A cleanup failure must not fail a scan that already finished.
    await recordRun(context, deepScan);
    try {
      await deleteExpiredFindings();
    } catch (error) {
      console.warn('Could not delete old results: ' + String(error));
    }

    return { ...context.toSummary(), slm };
  } catch (error) {
    console.error('Scan run ' + context.runId + ' failed: ' + String(error));
    context.fail();
    await recordRun(context, deepScan);
    throw error;
  }
}
