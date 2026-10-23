
import RNFS from 'react-native-fs';
import { strFromU8, unzipSync } from 'fflate';
import type { TextExtractor } from './textExtractor';

declare function atob(data: string): string;

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

const FLUSH_THRESHOLD_CHARS = 200_000;

const ROWS_PER_CHUNK = 2000;

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function readZipEntries(
  filePath: string,
  wanted: (entryName: string) => boolean,
): Promise<Record<string, Uint8Array>> {
  const stat = await RNFS.stat(filePath);
  if (Number(stat.size) > MAX_FILE_BYTES) {
    throw new Error('File is larger than ' + MAX_FILE_BYTES + ' bytes: ' + filePath);
  }

  const base64 = await RNFS.readFile(filePath, 'base64');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  let totalUncompressed = 0;
  return unzipSync(bytes, {
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
function joinTextRuns(fragment: string): string {
  let text = '';
  for (const run of fragment.matchAll(TEXT_RUN)) {
    text += decodeXml(run[1]);
  }
  return text;
}
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
      buffer += decodeXml(token[1]);
    } else {
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

const SHARED_STRING = /<(?:\w+:)?si\s*\/>|<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g;

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
