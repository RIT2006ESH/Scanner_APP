import RNFS from 'react-native-fs';
import { initLlama } from 'llama.rn';
import { SensitiveDataType } from '../../types';

// The running model (null = not loaded).
type LlamaSession = Awaited<ReturnType<typeof initLlama>>;
let session: LlamaSession | null = null;

// ---------- the model file ----------

// Qwen2.5 0.5B Instruct, 4-bit (about 0.4 GB). Small enough for a phone.
const MODEL_URL =
  'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
const MODEL_FOLDER = RNFS.DocumentDirectoryPath + '/models';
const MODEL_PATH = MODEL_FOLDER + '/qwen2.5-0.5b-instruct-q4_k_m.gguf';

// A finished download is about 400 MB; anything much smaller is broken.
const MODEL_MIN_BYTES = 300_000_000;

// Free storage needed before a download is started.
const MODEL_REQUIRED_FREE_BYTES = 600_000_000;

// Shown on the download button.
export const MODEL_SIZE_LABEL = '400 MB';

// ---------- which findings the model reviews ----------

// Types whose pattern is too weak to trust alone.
const REVIEW_TYPES: ReadonlySet<SensitiveDataType> = new Set<SensitiveDataType>([
  'BANK_ACCOUNT',
  'PASSPORT',
  'VOTER_ID',
  'DRIVING_LICENCE',
]);

// Plain-English description of each reviewed type, used in the question.
const TYPE_DESCRIPTIONS: Partial<Record<SensitiveDataType, string>> = {
  BANK_ACCOUNT: 'bank account number (9 to 18 digits)',
  PASSPORT: 'Indian passport number (1 letter followed by 7 digits)',
  VOTER_ID: 'voter ID (EPIC) number (3 letters followed by 7 digits)',
  DRIVING_LICENCE: 'Indian driving licence number',
};

// True if findings of this type should be double-checked by the model.
export function needsSlmReview(type: SensitiveDataType): boolean {
  return REVIEW_TYPES.has(type);
}

// How many characters of text are shown to the model on each side of the value.
const CONTEXT_CHARS = 120;

// Cuts out the text around a match and marks the value with [[ ]].
// Example: "Ref no. [[9876543210]] dated 12 May".
export function buildContext(text: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_CHARS);
  const to = Math.min(text.length, end + CONTEXT_CHARS);
  return (text.substring(from, start) + '[[' + text.substring(start, end) + ']]' + text.substring(end, to))
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- download ----------

// True if the model file is on the phone and looks complete.
export async function isModelDownloaded(): Promise<boolean> {
  try {
    if (!(await RNFS.exists(MODEL_PATH))) {
      return false;
    }
    const stat = await RNFS.stat(MODEL_PATH);
    return Number(stat.size) >= MODEL_MIN_BYTES;
  } catch {
    return false;
  }
}

// Downloads the model once. onProgress gets a number from 0 to 1.
// The file is first saved under a temporary name, so a broken or
// half-finished download is never mistaken for the real model.
export async function downloadModel(onProgress: (fraction: number) => void): Promise<void> {
  const info = await RNFS.getFSInfo();
  if (info.freeSpace < MODEL_REQUIRED_FREE_BYTES) {
    throw new Error('Not enough free storage for the model (about ' + MODEL_SIZE_LABEL + ' needed).');
  }

  await RNFS.mkdir(MODEL_FOLDER);
  const partPath = MODEL_PATH + '.part';
  if (await RNFS.exists(partPath)) {
    await RNFS.unlink(partPath);
  }

  const job = RNFS.downloadFile({
    fromUrl: MODEL_URL,
    toFile: partPath,
    progressInterval: 500,
    progressDivider: 1,
    progress: (result) => {
      if (result.contentLength > 0) {
        onProgress(result.bytesWritten / result.contentLength);
      }
    },
  });
  const result = await job.promise;

  if (result.statusCode !== 200) {
    await RNFS.unlink(partPath).catch(() => undefined);
    throw new Error('Download failed (HTTP ' + result.statusCode + ').');
  }
  const stat = await RNFS.stat(partPath);
  if (Number(stat.size) < MODEL_MIN_BYTES) {
    await RNFS.unlink(partPath).catch(() => undefined);
    throw new Error('Downloaded file is incomplete.');
  }

  if (await RNFS.exists(MODEL_PATH)) {
    await RNFS.unlink(MODEL_PATH);
  }
  await RNFS.moveFile(partPath, MODEL_PATH);
  onProgress(1);
}

// ---------- load, ask, unload ----------

// Loads the model into memory (takes a few seconds). Called once per scan.
export async function loadModel(): Promise<void> {
  if (session != null) {
    return;
  }
  session = await initLlama({
    model: MODEL_PATH,
    n_ctx: 1024, // small memory window: enough for one short question
    n_gpu_layers: 0, // CPU only, works on every phone
  });
}

// Frees the memory used by the model.
export async function unloadModel(): Promise<void> {
  const current = session;
  session = null;
  if (current != null) {
    await current.release();
  }
}

// Asks the model: is this value really a <type>?
// Returns true = keep the finding, false = drop it (false alarm).
// `snippet` comes from buildContext, with the value marked as [[ ]].
export async function classifyCandidate(
  type: SensitiveDataType,
  value: string,
  snippet: string,
): Promise<boolean> {
  if (session == null) {
    throw new Error('Model is not loaded. Call loadModel() first.');
  }

  const label = TYPE_DESCRIPTIONS[type] ?? type;
  // NOTE: the question contains real values. It is never logged or saved.
  const result = await session.completion({
    messages: [
      {
        role: 'system',
        content:
          'You check whether a value found inside a document is really a ' +
          label +
          '. Answer with exactly one word: YES or NO.',
      },
      {
        role: 'user',
        content:
          'Value: ' + value + '\nText around it: ' + snippet + '\nIs the value a real ' + label + '?',
      },
    ],
    n_predict: 4,
    temperature: 0,
  });

  const answer = result.text.trim().toUpperCase();
  if (answer.startsWith('NO')) {
    return false;
  }
  // "YES", or anything we cannot understand: keep the finding.
  return true;
}
