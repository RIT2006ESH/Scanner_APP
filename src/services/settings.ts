import RNFS from 'react-native-fs';

const SETTINGS_FILE = RNFS.DocumentDirectoryPath + '/settings.json';

export interface AppSettings {
  onboardingDone: boolean;
}

const DEFAULTS: AppSettings = { onboardingDone: false };

export async function loadSettings(): Promise<AppSettings> {
  try {
    if (!(await RNFS.exists(SETTINGS_FILE))) {
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(await RNFS.readFile(SETTINGS_FILE, 'utf8'));
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS }; // missing or damaged file: start from defaults
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await RNFS.writeFile(SETTINGS_FILE, JSON.stringify(next), 'utf8');
  return next;
}
