import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';
declare const crypto: { getRandomValues(array: Uint8Array): Uint8Array };

// The database key is made once, at the first start, and kept in the
// Android Keystore (through react-native-keychain). It is never in the code.
const SERVICE = 'sentinelscan.dbkey';

let cached: string | null = null;

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getDbKey(): Promise<string> {
  if (cached !== null) {
    return cached;
  }
  const existing = await Keychain.getGenericPassword({ service: SERVICE });
  if (existing) {
    cached = existing.password;
    return cached;
  }
  const fresh = randomHex(32);
  await Keychain.setGenericPassword('db', fresh, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  cached = fresh;
  return fresh;
}
