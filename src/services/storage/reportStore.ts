import { ScanResultRecord } from '../../types';

// Backed by react-native-sqlite-storage (SQLCipher-encrypted) or
// react-native-mmkv with encryption enabled for simpler key-value needs.

export async function saveResult(record: ScanResultRecord): Promise<void> {
  // TODO: encrypted insert
}

export async function getAllResults(): Promise<ScanResultRecord[]> {
  // TODO: encrypted read
  return [];
}
