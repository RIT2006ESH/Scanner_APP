import * as Keychain from 'react-native-keychain';

// The lock is a Keystore entry that can only be read after the phone's
// fingerprint or screen lock (PIN / pattern / password) is confirmed.
const SERVICE = 'sentinelscan.lock';

async function ensureLockEntry(): Promise<boolean> {
  try {
    if (await Keychain.hasGenericPassword({ service: SERVICE })) {
      return true;
    }
    await Keychain.setGenericPassword('lock', '1', {
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch (error) {
    // Usually: the phone has no screen lock set.
    console.warn('App lock unavailable: ' + String(error));
    return false;
  }
}

export type UnlockResult = 'ok' | 'failed' | 'unavailable';

export async function unlockApp(): Promise<UnlockResult> {
  if (!(await ensureLockEntry())) {
    return 'unavailable';
  }
  try {
    const entry = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt: { title: 'Unlock SentinelScan' },
    });
    return entry ? 'ok' : 'failed';
  } catch {
    return 'failed'; // cancelled or wrong credential
  }
}
