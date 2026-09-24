import { FileKind } from '../../types';

// Backed by react-native-document-picker for folder/file selection,
// and react-native-fs for enumerating contents of a granted directory.

export function classifyFile(filePath: string): FileKind {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'docx':
    case 'xlsx':
      return 'docx';
    case 'jpg':
    case 'jpeg':
    case 'png':
      return 'image';
    case 'txt':
    case 'csv':
      return 'text';
    default:
      return 'unsupported';
  }
}

export async function discoverFiles(rootUri: string): Promise<string[]> {
  // TODO: implement with react-native-fs readDir(rootUri), recursing into
  // subfolders, filtering out classifyFile() === 'unsupported'
  return [];
}
