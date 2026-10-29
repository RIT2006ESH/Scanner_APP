import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { unlockApp } from './src/services/appLock';
import { loadSettings, saveSettings } from './src/services/settings';
import { OnboardingScreen } from './src/ui/OnboardingScreen';

// The app locks again after being in the background this long.
const RELOCK_AFTER_MS = 30 * 1000;

function Root(): React.JSX.Element {
  // null = still reading the settings file
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const wentToBackgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);

  useEffect(() => {
    loadSettings().then((s) => setOnboardingDone(s.onboardingDone));
  }, []);

  const tryUnlock = useCallback(async () => {
    if (prompting.current) {
      return;
    }
    prompting.current = true;
    const result = await unlockApp();
    prompting.current = false;
    if (result === 'ok') {
      setMessage(null);
      setLocked(false);
    } else if (result === 'unavailable') {
      // No screen lock on the phone: the app cannot be locked.
      setMessage('Set a screen lock (PIN, pattern or fingerprint) on this phone to protect your results.');
      setLocked(false);
    } else {
      setMessage('Unlock cancelled.');
    }
  }, []);

  // Ask once when onboarding is finished or already done.
  useEffect(() => {
    if (onboardingDone === true && locked) {
      tryUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingDone]);

  // Lock again after a while in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wentToBackgroundAt.current = Date.now();
      } else if (state === 'active' && wentToBackgroundAt.current != null) {
        const away = Date.now() - wentToBackgroundAt.current;
        wentToBackgroundAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setLocked(true);
          tryUnlock();
        }
      }
    });
    return () => sub.remove();
  }, [tryUnlock]);

  if (onboardingDone === null) {
    return <View style={styles.blank} />;
  }

  if (!onboardingDone) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen
          onDone={() => {
            setOnboardingDone(true);
            saveSettings({ onboardingDone: true }).catch((e) =>
              console.warn('Could not save settings: ' + String(e)),
            );
          }}
        />
      </SafeAreaProvider>
    );
  }

  // App stays mounted under the lock screen, so a running scan is not lost.
  return (
    <View style={styles.fill}>
      <App />
      {locked && (
        <View style={styles.lock}>
          <Text style={styles.lockTitle}>SentinelScan is locked</Text>
          {message != null && <Text style={styles.lockMsg}>{message}</Text>}
          <Pressable style={styles.lockButton} onPress={tryUnlock}>
            <Text style={styles.lockButtonText}>Unlock</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  blank: { flex: 1, backgroundColor: '#0f172a' },
  lock: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockTitle: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  lockMsg: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  lockButton: { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  lockButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});

export default Root;
