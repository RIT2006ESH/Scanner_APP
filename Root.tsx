import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { loadSettings, saveSettings } from './src/services/settings';
import { OnboardingScreen } from './src/ui/OnboardingScreen';

// Decides what to show first: onboarding (once) or the main app.
function Root(): React.JSX.Element {
  // null = still reading the settings file
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    loadSettings().then((s) => setOnboardingDone(s.onboardingDone));
  }, []);

  if (onboardingDone === null) {
    return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
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

  return <App />;
}

export default Root;
