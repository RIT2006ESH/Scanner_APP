// ============================================================
// Word (.docx) and Excel (.xlsx) text extraction, redesigned for
// mobile. Java version: extractor/DocxTextExtractor.java and
// extractor/XlsxTextExtractor.java (Apache POI + SAX streaming).
//
// Both formats are ZIP files that contain XML. There is no SAX parser
// or POI on a phone, so this file:
//   1. reads the whole file (size-limited) and unzips ONLY the XML parts
//      it needs, using fflate (pure JavaScript, no native code);
//   2. pulls the text out of the XML with regular expressions;
//   3. hands the text over in chunks and lets the UI breathe between them.
// ============================================================
import RNFS from 'react-native-fs';
import { strFromU8, unzipSync } from 'fflate';
import type { TextExtractor } from './textExtractor';

// atob exists at runtime (Hermes), but this project's TypeScript setup
// does not know about it, so its type is declared here.
declare function atob(data: string): string;

// Files bigger than this are refused (the whole file is held in memory).
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Zip-bomb guard: refuse if the parts we want would unpack to more than this.
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

// Word: send a chunk once it holds this many characters (same as Java).
const FLUSH_THRESHOLD_CHARS = 200_000;

// Excel: send a chunk every this many rows (same as Java).
const ROWS_PER_CHUNK = 2000;

// JavaScript is single threaded. A zero-delay timer lets the screen
// redraw and touches work between chunks, so the app does not look frozen.
const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// ------------------------------------------------------------
// Zip helpers
// ------------------------------------------------------------

// Reads the file and unzips only the entries accepted by `wanted`.
// Returns { entryName: bytes }. Throws on a bad, huge or unreadable file;
// the caller counts that as an error, like Java's IOException.
async function readZipEntries(
  filePath: string,
  wanted: (entryName: string) => boolean,
): Promise<Record<string, Uint8Array>> {
  const stat = await RNFS.stat(filePath);
  if (Number(stat.size) > MAX_FILE_BYTES) {
    throw new Error('File is larger than ' + MAX_FILE_BYTES + ' bytes: ' + filePath);
  }

  // The file crosses the React Native bridge as a base64 string.
  const base64 = await RNFS.readFile(filePath, 'base64');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  let totalUncompressed = 0;
  return unzipSync(bytes, {
    // Called for every entry; return true only for the ones we need.
    filter: (entry) => {
      if (!wanted(entry.name)) {
        return false;
      }
      totalUncompressed += entry.originalSize;
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('Unpacked content is too large: ' + filePath);
      }
      return true;
    },
  });
}

// ------------------------------------------------------------
// XML helpers
// ------------------------------------------------------------

// Turns XML escapes back into characters: "&amp;" -> "&", "&#x41;" -> "A".
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (whole, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        // Numeric reference: "#65" (decimal) or "#x41" (hex).
        const code =
          entity.charAt(1) === 'x' ? parseInt(entity.substring(2), 16) : parseInt(entity.substring(1), 10);
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole; // not a valid character, leave it as it is
        }
      }
    }
  });
}

// One text piece: <w:t>..</w:t> in Word, <t>..</t> in Excel.
// (?:\w+:)? allows any namespace prefix. "<w:tab/>" and "<w:tbl>" do not match.
const TEXT_RUN = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;

// Joins all text pieces inside an XML fragment.
function joinTextRuns(fragment: string): string {
  let text = '';
  for (const run of fragment.matchAll(TEXT_RUN)) {
    text += decodeXml(run[1]);
  }
  return text;
}

// ------------------------------------------------------------
// Word (.docx): the text lives in word/document.xml
// (Java also read only this one part, so headers/footers are skipped).
// ------------------------------------------------------------

// Either a text piece (group 1 is set) or the end of a paragraph (no group).
const DOCX_TOKEN = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<\/(?:\w+:)?p>/g;

export const extractDocx: TextExtractor = async (filePath, onChunk) => {
  const entries = await readZipEntries(filePath, (name) => name === 'word/document.xml');
  const documentXml = entries['word/document.xml'];
  if (documentXml == null) {
    throw new Error('No word/document.xml found: ' + filePath);
  }

  const xml = strFromU8(documentXml);
  let buffer = '';

  for (const token of xml.matchAll(DOCX_TOKEN)) {
    if (token[1] !== undefined) {
      // Text pieces inside one paragraph are joined directly, because Word
      // often splits one number into several pieces.
      buffer += decodeXml(token[1]);
    } else {
      // End of a paragraph: new line. Chunks are cut only here, so a
      // number is never split across two chunks.
      buffer += '\n';
      if (buffer.length >= FLUSH_THRESHOLD_CHARS) {
        await onChunk(buffer);
        buffer = '';
        await yieldToUi();
      }
    }
  }

  if (buffer.length > 0) {
    await onChunk(buffer);
  }
};

// ------------------------------------------------------------
// Excel (.xlsx): text cells point into xl/sharedStrings.xml, and each
// sheet is its own file under xl/worksheets/.
// ------------------------------------------------------------

// One shared string: "<si/>" (empty) or "<si>...</si>".
const SHARED_STRING = /<(?:\w+:)?si\s*\/>|<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g;

// Phonetic hints (Japanese furigana) that must not be added to the text.
const PHONETIC = /<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g;

// Builds the list of shared strings; a cell stores the INDEX into this list.
function parseSharedStrings(data: Uint8Array | undefined): string[] {
  if (data == null) {
    return [];
  }
  const strings: string[] = [];
  for (const item of strFromU8(data).matchAll(SHARED_STRING)) {
    strings.push(item[1] === undefined ? '' : joinTextRuns(item[1].replace(PHONETIC, '')));
  }
  return strings;
}

// A row, and a cell inside a row. Self-closing forms ("<c .../>") have no body.
const ROW = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
const CELL = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
const CELL_VALUE = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/;
const CELL_TYPE = /(?:^|\s)t="([^"]*)"/;

// Returns the text of one cell.
//   t="s"         -> index into the shared strings
//   t="inlineStr" -> text stored inside the cell
//   t="b"/"e"     -> boolean / error: no text
//   anything else -> the raw stored value (numbers, formula text results)
// NOTE: numbers come out as stored. Java asked POI for the value as shown
// on screen; the stored form is the same for text and normal numbers.
function readCell(attributes: string, body: string, sharedStrings: string[]): string {
  const type = CELL_TYPE.exec(attributes)?.[1];

  switch (type) {
    case 's': {
      const index = Number(CELL_VALUE.exec(body)?.[1]);
      return Number.isInteger(index) ? (sharedStrings[index] ?? '') : '';
    }
    case 'inlineStr':
      return joinTextRuns(body);
    case 'b':
    case 'e':
      return '';
    default:
      return decodeXml(CELL_VALUE.exec(body)?.[1] ?? '');
  }
}

// Reads one sheet: cells separated by a space, rows by a new line.
async function extractSheet(
  sheetXml: string,
  sharedStrings: string[],
  onChunk: (chunk: string) => void | Promise<void>,
): Promise<void> {
  let buffer = '';
  let rowCount = 0;

  for (const row of sheetXml.matchAll(ROW)) {
    const rowBody = row[1];
    if (rowBody !== undefined) {
      for (const cell of rowBody.matchAll(CELL)) {
        const cellBody = cell[2];
        if (cellBody === undefined) {
          continue; // empty cell
        }
        const text = readCell(cell[1], cellBody, sharedStrings);
        if (text.length > 0) {
          buffer += text + ' ';
        }
      }
    }

    buffer += '\n';
    rowCount++;

    if (rowCount % ROWS_PER_CHUNK === 0) {
      await onChunk(buffer);
      buffer = '';
      await yieldToUi();
    }
  }

  if (buffer.length > 0) {
    await onChunk(buffer);
  }
}

// "xl/worksheets/sheet12.xml" -> 12, so sheet2 comes before sheet10.
function sheetNumber(entryName: string): number {
  return parseInt(/(\d+)\.xml$/.exec(entryName)?.[1] ?? '0', 10);
}

export const extractXlsx: TextExtractor = async (filePath, onChunk) => {
  const entries = await readZipEntries(
    filePath,
    (name) => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(name),
  );

  const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml']);

  const sheetNames = Object.keys(entries)
    .filter((name) => name.startsWith('xl/worksheets/'))
    .sort((a, b) => sheetNumber(a) - sheetNumber(b));

  if (sheetNames.length === 0) {
    throw new Error('No worksheets found: ' + filePath);
  }

  for (const sheetName of sheetNames) {
    await extractSheet(strFromU8(entries[sheetName]), sharedStrings, onChunk);
  }
};
