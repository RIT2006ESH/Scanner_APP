// ============================================================
// App settings, ported from the Java web version:
//   config/AppProperties.java + the "scanner" section of application.yml
//
// Left out on purpose (they make no sense on a phone):
//   targetDrives (C:\, D:\)  -> the user picks a folder instead.
//   excludedPaths (C:\Windows, C:\Program Files, ...) -> Windows only.
//   threadPoolSize, fileQueueCapacity -> JavaScript runs on one thread.
//   scheduleCron ("0 0 2 * * *") -> background scheduling will get its own
//     setting; Android background tasks run at intervals, not at a fixed time.
// ============================================================

export interface ReportConfig {
  // 'csv' or 'excel'. The Java web version used csv.
  format: 'csv' | 'excel';
  // Reports older than this many days are deleted.
  retentionDays: number;
  // At most this many reports are kept.
  maxFiles: number;
}

export interface ScannerConfig {
  // File types to scan (lowercase, without the dot).
  supportedExtensions: readonly string[];

  // Folders with these names are skipped everywhere.
  excludedFolderNames: readonly string[];

  // One file taking longer than this is abandoned.
  perFileTimeoutSeconds: number;

  // How many recent findings the live view keeps.
  liveFindingsBufferSize: number;

  // Files bigger than this are skipped (docx/xlsx are read whole into memory).
  maxFileSizeMb: number;

  // Time limit for a user-defined regex on one chunk.
  customRegexTimeoutMillis: number;

  // Scan is refused if free storage is below this.
  minFreeDiskSpaceMb: number;

  report: ReportConfig;
}

export const CONFIG: ScannerConfig = {
  // Same list as application.yml. Image types (png, jpg, jpeg) are NOT here
  // yet: add them once you want photos to be scanned with OCR.
  supportedExtensions: ['pdf', 'docx', 'xlsx', 'txt', 'csv'],

  excludedFolderNames: [
    // From application.yml (build and tool folders):
    'node_modules',
    '.git',
    '.idea',
    'target',
    'dist',
    'build',
    '.m2',
    'venv',
    '__pycache__',
    // Added for Android (gallery and app caches, no user documents inside):
    '.thumbnails',
    '.cache',
  ],

  // Values below are the same as application.yml.
  perFileTimeoutSeconds: 60,
  liveFindingsBufferSize: 200,
  customRegexTimeoutMillis: 250,
  maxFileSizeMb: 50,
  minFreeDiskSpaceMb: 500,

  report: {
    format: 'csv',
    retentionDays: 30,
    maxFiles: 100,
  },
};

// Returns the lowercase extension without the dot, or '' if there is none.
// Ported from ScanOrchestrator.getExtension (plus lowercasing, which Java
// did at the comparison step). "report.PDF" -> "pdf", "README" -> "".
export function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.substring(lastDot + 1).toLowerCase();
}

// True if the file type is in the supported list.
export function isSupportedExtension(extension: string): boolean {
  return CONFIG.supportedExtensions.includes(extension.toLowerCase());
}

// True if a folder with this name must be skipped.
// Ported from the excluded-folder-names check in FileWalker.
export function isExcludedFolderName(folderName: string): boolean {
  return CONFIG.excludedFolderNames.includes(folderName);
}
