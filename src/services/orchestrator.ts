import { discoverFiles } from './discovery/fileDiscovery';
import { extractText } from './extraction/textExtractor';
import { scanChunk } from './detection/piiDetector';
import { loadModel, unloadModel, classifyBatch } from './slm/slmClassifier';
import { saveResult } from './storage/reportStore';
import { Finding } from '../types';

export async function runScan(rootUri: string, deepScan: boolean): Promise<void> {
  const files = await discoverFiles(rootUri);
  const ambiguousQueue: { text: string; filePath: string }[] = [];

  for (const filePath of files) {
    const text = await extractText(filePath);
    const findings = scanChunk(text, filePath);

    for (const f of findings) {
      await saveResult({
        filePath: f.filePath,
        type: f.type,
        maskedValue: f.maskedValue,
        confidence: f.confidence,
        timestamp: Date.now(),
      });
    }

    // TODO: push to ambiguousQueue when a chunk looks document-like
    // but has no regex hit, matching the "Ambiguous" branch in the chart
  }

  if (deepScan && ambiguousQueue.length > 0) {
    await loadModel();
    const slmFindings: Finding[] = await classifyBatch(ambiguousQueue);
    for (const f of slmFindings) {
      await saveResult({
        filePath: f.filePath,
        type: f.type,
        maskedValue: f.maskedValue,
        confidence: f.confidence,
        timestamp: Date.now(),
      });
    }
    await unloadModel();
  }
}
