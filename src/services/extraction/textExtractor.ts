
import RNFS from 'react-native-fs';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { extractDocx, extractXlsx } from './ooxmlExtractors';

// Called once per chunk of text, in order. May be async; the extractor
// waits for it to finish before reading the next chunk.
export type ChunkConsumer = (chunk: string) => void | Promise<void>;

// Java: interface TextExtractor.extractText(path, consumer)
export type TextExtractor = (
  filePath: string,
  onChunk: ChunkConsumer,
) => Promise<void>;

const CHUNK_SIZE_BYTES = 500_000;
const OVERLAP_CHARS = 200;
const extractPlainText: TextExtractor = async (filePath, onChunk) => {
  const stat = await RNFS.stat(filePath);
  const totalBytes = Number(stat.size);

  let carryOver = ''; // the overlap kept from the previous chunk
  let position = 0;

  while (position < totalBytes) {
    const piece = await RNFS.read(filePath, CHUNK_SIZE_BYTES, position, 'utf8');
    position += CHUNK_SIZE_BYTES;

    // Safety: nothing came back, so stop instead of looping forever.
    if (piece.length === 0) {
      break;
    }

    carryOver += piece;
    await onChunk(carryOver);

    // Keep only the last OVERLAP_CHARS characters for the next round.
    carryOver = carryOver.substring(Math.max(0, carryOver.length - OVERLAP_CHARS));
  }
};

// ------------------------------------------------------------
// Image reader: OCR with ML Kit (this is the "Images + OCR" box in the
// architecture diagram; the Java web version had no image support).
// The whole recognised text is sent as one chunk.
// ------------------------------------------------------------
const extractImageText: TextExtractor = async (filePath, onChunk) => {
  // ML Kit needs a URI, not a bare path.
  const uri =
    filePath.startsWith('file://') || filePath.startsWith('content://')
      ? filePath
      : 'file://' + filePath;

  const result = await TextRecognition.recognize(uri);
  if (result.text.length > 0) {
    await onChunk(result.text);
  }
};

// extension (lowercase, no dot) -> extractor.
// A Map is used, so odd extensions like "constructor" can never
// accidentally match a built-in object property.
const EXTRACTORS = new Map<string, TextExtractor>([
  ['txt', extractPlainText],
  // CSV is read as plain text. Java parsed the CSV and joined the
  // fields with spaces; reading the raw text keeps the commas between
  // fields, so numbers from two neighbouring cells can no longer merge
  // into one false match. Results should be the same or better.
  ['csv', extractPlainText],
  // Word and Excel (zip + XML), see ooxmlExtractors.ts.
  ['docx', extractDocx],
  ['xlsx', extractXlsx],
  // Images are ready, but still OFF until 'png', 'jpg', 'jpeg' are added
  // to supportedExtensions in config.ts.
  ['png', extractImageText],
  ['jpg', extractImageText],
  ['jpeg', extractImageText],
]);

// Java: ExtractorFactory.getExtractor. Returns null if this file
// type has no extractor (the caller counts the file as skipped).
export function getExtractor(
  extension: string | null | undefined,
): TextExtractor | null {
  if (extension == null) {
    return null;
  }
  return EXTRACTORS.get(extension.toLowerCase()) ?? null;
}
