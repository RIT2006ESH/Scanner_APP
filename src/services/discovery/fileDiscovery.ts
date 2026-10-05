// ============================================================
// File discovery, ported from the Java web version:
//   core/FileWalker.java -> walkFiles
//
// Walks one or more root folders and calls onFile for every file found.
// It does NOT filter by file type: like Java, unsupported files are
// reported too, and the scan loop counts them as "skipped".
//
// Mobile differences:
//   - Roots are folders the user picked, not drives (C:\, D:\).
//   - Files are handled one at a time: onFile is awaited before the next
//     file is visited (there is no thread pool or work queue on a phone).
//   - Currently uses normal file paths (RNFS.readDir). This needs Android's
//     "All files access" permission for shared folders like Downloads.
//     Folders of the app itself need no permission. If scoped access (SAF
//     folder picker, content:// URIs) is added later, only this file changes.
// ============================================================
import RNFS, { ReadDirItem } from 'react-native-fs';
import { CONFIG } from '../config';
import { DEFAULT_SCAN_OPTIONS, ScanOptions } from '../core/scanContext';

// What the scan loop gets for each file.
// Times are epoch milliseconds; null means Android did not provide them
// (creation time is almost never available).
export interface DiscoveredFile {
  path: string;
  name: string;
  size: number | null;
  modifiedTime: number | null;
  creationTime: number | null;
}

// Called for every file. May be async; the walk waits for it.
export type FileHandler = (file: DiscoveredFile) => void | Promise<void>;

// Safety net against endless folder loops (for example a link that points
// back to a parent folder). Java's walker does not follow links at all.
const MAX_DEPTH = 50;

// Folder names to skip, lowercased once. The comparison is case-insensitive
// like Java's equalsIgnoreCase.
const EXCLUDED_FOLDER_NAMES = CONFIG.excludedFolderNames.map((name) => name.toLowerCase());

// Hidden on Android means the name starts with a dot.
function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

function isExcludedFolderName(name: string): boolean {
  return EXCLUDED_FOLDER_NAMES.includes(name.toLowerCase());
}

// Walks every root. Java: FileWalker.walk(roots, options, isCancelled, handler)
//   roots       - folders to scan
//   onFile      - called for each file found
//   options     - recursive / hidden files / excluded folders
//   isCancelled - checked before every entry; once true, the walk stops
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

    // A root that no longer exists is skipped, not treated as a failure.
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

// Visits one folder. Files are reported; sub-folders are entered only
// when options.recursive is true (Java: walkRecursive / walkTopLevelOnly).
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

