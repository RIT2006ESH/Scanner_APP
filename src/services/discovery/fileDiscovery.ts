import RNFS, { ReadDirItem } from 'react-native-fs';
import { CONFIG } from '../config';
import { DEFAULT_SCAN_OPTIONS, ScanOptions } from '../core/scanContext';
export interface DiscoveredFile {
  path: string;
  name: string;
  size: number | null;
  modifiedTime: number | null;
  creationTime: number | null;
}

export type FileHandler = (file: DiscoveredFile) => void | Promise<void>;

const MAX_DEPTH = 50;

const EXCLUDED_FOLDER_NAMES = CONFIG.excludedFolderNames.map((name) => name.toLowerCase());
function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

function isExcludedFolderName(name: string): boolean {
  return EXCLUDED_FOLDER_NAMES.includes(name.toLowerCase());
}
export async function walkFiles(
  roots: readonly string[],
  onFile: FileHandler,
  options: ScanOptions = DEFAULT_SCAN_OPTIONS,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  for (const root of roots) {
    if (isCancelled()) {
      console.log('Scan cancelled, stopping file discovery.');
      return;
    }
    let exists = false;
    try {
      exists = await RNFS.exists(root);
    } catch {
      exists = false;
    }
    if (!exists) {
      console.warn('Target folder does not exist, skipping: ' + root);
      continue;
    }

    await walkFolder(root, 0, onFile, options, isCancelled);
  }
}

async function walkFolder(
  folderPath: string,
  depth: number,
  onFile: FileHandler,
  options: ScanOptions,
  isCancelled: () => boolean,
): Promise<void> {
  if (depth > MAX_DEPTH) {
    return;
  }

  let entries: ReadDirItem[];
  try {
    entries = await RNFS.readDir(folderPath);
  } catch (error) {
    // Folder cannot be read (no permission, or removed). Skip it and continue.
    console.warn('Cannot read folder, skipping: ' + folderPath + ' (' + String(error) + ')');
    return;
  }

  for (const entry of entries) {
    if (isCancelled()) {
      return;
    }

    if (entry.isDirectory()) {
      if (!options.recursive) {
        continue;
      }
      if (options.excludeConfiguredPaths && isExcludedFolderName(entry.name)) {
        continue;
      }
      if (!options.includeHiddenFiles && isHiddenName(entry.name)) {
        continue;
      }
      await walkFolder(entry.path, depth + 1, onFile, options, isCancelled);
    } else if (entry.isFile()) {
      if (!options.includeHiddenFiles && isHiddenName(entry.name)) {
        continue;
      }

      const size = Number(entry.size);
      await onFile({
        path: entry.path,
        name: entry.name,
        size: Number.isFinite(size) ? size : null,
        modifiedTime: entry.mtime ? entry.mtime.getTime() : null,
        creationTime: entry.ctime ? entry.ctime.getTime() : null,
      });
    }
  }
}
