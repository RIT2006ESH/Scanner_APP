import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';

const native = NativeModules.AllFilesAccess;

// True when the user has turned on "All files access" for this app.
export async function isAllFilesAccessGranted(): Promise<boolean> {
  try {
    return native ? Boolean(await native.isGranted()) : false;
  } catch {
    return false;
  }
}

// Opens the Android settings screen where the user turns the access on.
export async function openAllFilesSettings(): Promise<void> {
  if (native) {
    await native.openSettings();
  }
}

const ROOT = RNFS.ExternalStorageDirectoryPath; // /storage/emulated/0

export const QUICK_FOLDERS: { label: string; path: string }[] = [
  { label: 'Whole phone', path: ROOT },
  { label: 'Downloads', path: ROOT + '/Download' },
  { label: 'Documents', path: ROOT + '/Documents' },
  { label: 'Photos (DCIM)', path: ROOT + '/DCIM' },
  { label: 'WhatsApp', path: ROOT + '/Android/media/com.whatsapp/WhatsApp' },
];
