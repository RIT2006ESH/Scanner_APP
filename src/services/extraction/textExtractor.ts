import { FileKind } from '../../types';
import { classifyFile } from '../discovery/fileDiscovery';

export async function extractText(filePath: string): Promise<string> {
  const kind: FileKind = classifyFile(filePath);

  switch (kind) {
    case 'pdf':
      // TODO: extract via react-native-pdf or pdf-lib
      return '';
    case 'docx':
      // TODO: extract via a lightweight OOXML parser
      return '';
    case 'image':
      // TODO: OCR via @react-native-ml-kit/text-recognition
      return '';
    case 'text':
      // TODO: read via react-native-fs readFile
      return '';
    default:
      return '';
  }
}
