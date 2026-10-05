// ============================================================
// Scan orchestrator, ported from the Java web version:
//   core/ScanOrchestrator.java -> executeScan, processFile
// plus the new Stage 2 (on-device SLM review) from the architecture diagram.
//
// Flow of one scan:
//   1. Check free storage (Java: DiskSpaceGuard).
//   2. Walk the chosen folders (fileDiscovery.ts).
//   3. For every file: pick an extractor, read it in chunks, run the
//      detectors on each chunk, mask the findings, save them.
//      With deepScan on, findings of weak types (see needsSlmReview) are
//      NOT saved yet; they are queued for step 4.
//   4. Deep scan only: load the model once, let it confirm or reject each
//      queued finding, save the confirmed ones, unload the model.
//   5. Mark the run completed / cancelled / failed, delete old results.
//
// Files without an extractor (pdf, for now) are counted as "skipped".
// ============================================================
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
import { deleteExpiredFindings, saveFindings } from './storage/reportStore';

export interface ScanRequest {
  roots: readonly string[];
  options?: ScanOptions;
  enabledTypes?: ReadonlySet<SensitiveDataType> | null;
  deepScan?: boolean;
}

export interface SlmStats {
  reviewed: number;
  rejected: number;
  note: string | null;
}

export type ScanOutcome = ScanSummary & { slm: SlmStats | null };

interface SlmCandidate {
  match: ValidatedMatch;
  snippet: string;
  file: FileInfo;
}

const MAX_SLM_CANDIDATES = 200;
const SAVE_BATCH_SIZE = 20;
const YIELD_EVERY_FILES = 10;

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

// ------------------------------------------------------------
// One file (Java: processFile + detectAndRecordFindings)
// ------------------------------------------------------------
async function processFile(
  file: DiscoveredFile,
  context: ScanContext,
  activeDetectors: readonly SensitiveDataDetector[],
  slmQueue: SlmCandidate[] | null,
): Promise<void> {
  context.setCurrentFile(file.path);

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

  const alreadyFoundInFile = new Set<string>();

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

  const work = extractor(file.path, (chunk) => {
    if (timedOut || context.isCancelRequested()) {
      throw new Error('File processing stopped');
    }

    const detectStart = Date.now();
    const matches = detectInChunk(chunk, activeDetectors, alreadyFoundInFile);
    detectionMs += Date.now() - detectStart;

    for (const match of matches) {
      // Deep scan: weak findings wait for the model's opinion.
      if (slmQueue != null && needsSlmReview(match.type) && slmQueue.length < MAX_SLM_CANDIDATES) {
        slmQueue.push({
          match,
          snippet: buildContext(chunk, match.start, match.end),
          file: fileInfo,
        });
        continue;
      }

      const result = buildScanResult(match, fileInfo);
      fileFindings.push(result);
      context.addFinding(result);
    }
  });
  work.catch(() => undefined);

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
      context.incrementErrorsEncountered();
      console.warn('Failed to extract text from ' + file.path + ': ' + String(error));
    }
  } finally {
    clearTimeout(timer);
  }

  if (fileFindings.length > 0) {
    try {
      await saveFindings(context.runId, fileFindings);
    } catch (error) {
      context.incrementErrorsEncountered();
      console.warn('Failed to save findings of ' + file.path + ': ' + String(error));
    }
  }

  context.recordDetectionTime(detectionMs);
  context.recordExtractionTime(extension, Math.max(0, Date.now() - startedAt - detectionMs));
}

// ------------------------------------------------------------
// Stage 2: the model confirms or rejects the queued findings.
// Anything not reviewed (model missing, model failed, scan cancelled)
// is kept as a finding marked MODEL_UNREVIEWED.
// ------------------------------------------------------------
async function reviewWithSlm(queue: SlmCandidate[], context: ScanContext): Promise<SlmStats> {
  const stats: SlmStats = { reviewed: 0, rejected: 0, note: null };
  const pending: ScanResult[] = [];

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

  let index = 0;
  if (modelReady) {
    try {
      for (; index < queue.length; index++) {
        if (context.isCancelRequested()) {
          break;
        }
        context.setCurrentFile('Model review ' + (index + 1) + ' of ' + queue.length);

        const candidate = queue[index];
        let genuine = true; // if the model fails, the finding is kept
        let confidence: Confidence = 'MODEL_UNREVIEWED';
        try {
          genuine = await classifyCandidate(
            candidate.match.type,
            candidate.match.value,
            candidate.snippet,
          );
          stats.reviewed++;
          confidence = 'MODEL_CONFIRMED';
        } catch (error) {
          console.warn('Model could not review a finding, keeping it: ' + String(error));
        }

        if (genuine) {
          accept(candidate, confidence);
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

  // Not reviewed: keep as findings the model did not check.
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

  if (!(await hasEnoughFreeSpace())) {
    console.error('Scan aborted before starting: insufficient storage.');
    context.incrementErrorsEncountered();
    context.fail();
    return { ...context.toSummary(), slm: null };
  }

  const activeDetectors = buildActiveDetectors(request.enabledTypes);
  const slmQueue: SlmCandidate[] | null = request.deepScan ? [] : null;
  console.log(
    'Starting scan run ' + context.runId + ' with ' + activeDetectors.length +
      ' active detectors, deep scan: ' + (request.deepScan ? 'on' : 'off') +
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

    try {
      await deleteExpiredFindings();
    } catch (error) {
      console.warn('Could not delete old results: ' + String(error));
    }

    return { ...context.toSummary(), slm };
  } catch (error) {
    console.error('Scan run ' + context.runId + ' failed: ' + String(error));
    context.fail();
    throw error;
  }
}
