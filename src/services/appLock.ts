import * as Keychain from 'react-native-keychain';

// The lock is a Keystore entry that can only be read after the phone's
// fingerprint or screen lock (PIN / pattern / password) is confirmed.
const SERVICE = 'sentinelscan.lock';

export type UnlockResult = 'ok' | 'failed' | 'unavailable';

function isCancel(error: unknown): boolean {
  return String(error).toLowerCase().includes('cancel');
}

async function createEntry(): Promise<void> {
  await Keychain.setGenericPassword('lock', '1', {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readEntry(): Promise<UnlockResult> {
  const entry = await Keychain.getGenericPassword({
    service: SERVICE,
    authenticationPrompt: { title: 'Unlock SentinelScan' },
  });
  return entry ? 'ok' : 'failed';
}

export async function unlockApp(): Promise<UnlockResult> {
  try {
    if (!(await Keychain.hasGenericPassword({ service: SERVICE }))) {
      await createEntry();
    }
    return await readEntry();
  } catch (error) {
    console.warn('App lock error: ' + String(error));
    if (isCancel(error)) {
      return 'failed'; // the user dismissed the prompt
    }
    // Not a cancel: the stored key is probably invalid (screen lock was
    // changed or removed). Reset the entry and try once more.
    try {
      await Keychain.resetGenericPassword({ service: SERVICE });
      await createEntry();
      return await readEntry();
    } catch (retryError) {
      console.warn('App lock unavailable: ' + String(retryError));
      return isCancel(retryError) ? 'failed' : 'unavailable';
    }
  }
}
