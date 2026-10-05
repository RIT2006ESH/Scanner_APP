// ============================================================
// SentinelScan main screen, following the architecture diagram:
//   Manual trigger -> Select files -> Start scan -> results.
//
// How a scan works here:
//   1. "Select files" opens Android's file picker. Each chosen file is
//      copied into a temporary folder inside the app (picked files are
//      content:// links that the scanner cannot read directly).
//   2. "Start scan" scans that temporary folder. With "Deep scan" on, an
//      on-device model double-checks uncertain matches.
//   3. When the scan ends, the temporary copies are DELETED, and the
//      results are read back from the encrypted local database.
//
// Not built yet: folder selection (needs a folder-access library),
// scheduled scans, CSV export.
// ============================================================
import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { FlatList, Pressable, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import { pick, types } from '@react-native-documents/picker';
import { ScanContext } from './src/services/core/scanContext';
import { executeScan } from './src/services/orchestrator';
import { downloadModel, isModelDownloaded, MODEL_SIZE_LABEL } from './src/services/slm/slmClassifier';
import {
  exportFindingsToCsv,
  getAllFindings,
  getFindingsByRun,
} from './src/services/storage/reportStore';
import { RiskLevel, ScanResult } from './src/types';

// Temporary folder that holds the copies of the chosen files.
const STAGING_FOLDER = RNFS.CachesDirectoryPath + '/SentinelScanSelected';

// Colour of each risk level.
const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: '#C62828',
  MEDIUM: '#EF6C00',
  NORMAL: '#2E7D32',
};

// Removes the temporary copies (also used before a new selection).
async function clearStaging(): Promise<void> {
  try {
    if (await RNFS.exists(STAGING_FOLDER)) {
      await RNFS.unlink(STAGING_FOLDER);
    }
  } catch (error) {
    console.warn('Could not clear the temporary folder: ' + String(error));
  }
}

// One finding row. The value shown is already masked.
function FindingRow({ item }: { item: ScanResult }): React.JSX.Element {
  return (
    <View style={styles.findingRow}>
      <View style={[styles.riskDot, { backgroundColor: RISK_COLORS[item.riskLevel] }]} />
      <View style={styles.findingText}>
        <Text style={styles.findingType}>
          {item.dataType} ({item.riskLevel})
        </Text>
        <Text style={styles.findingValue}>{item.maskedValue}</Text>
        <Text style={styles.findingFile} numberOfLines={1}>
          {item.fileName}
        </Text>
      </View>
    </View>
  );
}

function App(): React.JSX.Element {
  const [context, setContext] = useState<ScanContext | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  // Results read from the database (null = show the live scan instead).
  const [dbFindings, setDbFindings] = useState<ScanResult[] | null>(null);

  // Deep scan = on-device model double-checks uncertain matches.
  const [deepScan, setDeepScan] = useState(false);
  // Is the model file on the phone? (null = not checked yet)
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  // Model download progress in percent (null = not downloading).
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);

  // The scan state is a plain object that changes by itself, so a counter
  // is used to ask React to redraw the screen.
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  // Check once at start whether the model is already downloaded.
  useEffect(() => {
    isModelDownloaded().then(setModelReady);
  }, []);

  // Downloads the model (one time, about 400 MB).
  const downloadModelFile = useCallback(async () => {
    setDownloadPercent(0);
    try {
      await downloadModel((fraction) => setDownloadPercent(Math.round(fraction * 100)));
      setModelReady(true);
      setNotice('Model downloaded. Deep scan is ready.');
    } catch (error) {
      console.warn('Model download failed: ' + String(error));
      setNotice('Model download failed: ' + String(error));
    } finally {
      setDownloadPercent(null);
    }
  }, []);

  // Opens the file picker and copies the chosen files into the temporary folder.
  const selectFiles = useCallback(async () => {
    if (running) {
      return;
    }
    try {
      const picked = await pick({ allowMultiSelection: true, type: [types.allFiles] });

      await clearStaging();
      await RNFS.mkdir(STAGING_FOLDER);

      const names: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const item = picked[i];
        // Remove characters that are not allowed in file names.
        const safeName = (item.name ?? 'file').replace(/[\\/:*?"<>|]/g, '_');

        // Two files can have the same name: add a number in front.
        let target = STAGING_FOLDER + '/' + safeName;
        if (await RNFS.exists(target)) {
          target = STAGING_FOLDER + '/' + (i + 1) + '_' + safeName;
        }

        await RNFS.copyFile(item.uri, target);
        names.push(safeName);
      }

      setSelectedNames(names);
      setDbFindings(null);
      setNotice(names.length + ' file(s) selected. Press "Start scan".');
    } catch (error) {
      // Closing the picker without choosing is not an error.
      if (String(error).toLowerCase().includes('cancel')) {
        return;
      }
      console.warn('File selection failed: ' + String(error));
      setNotice('Could not select the files: ' + String(error));
    }
  }, [running]);

  // Scans the chosen files, deletes the copies, then shows the saved results.
  const startScan = useCallback(async () => {
    if (running) {
      return;
    }
    if (selectedNames.length === 0) {
      setNotice('Select files first.');
      return;
    }

    setNotice(null);
    setDbFindings(null);

    const scan = new ScanContext(selectedNames.join(', '));
    setContext(scan);
    setRunning(true);
    const stopListening = scan.subscribe(() => redraw());

    try {
      const outcome = await executeScan(scan, { roots: [STAGING_FOLDER], deepScan });

      // Read the findings back from the database. This proves they were
      // really saved, not just held in memory.
      const saved = await getFindingsByRun(scan.runId);
      setDbFindings(saved);

      let message =
        'Saved ' + saved.length + ' of ' + scan.totalFindingsCount + ' findings in the database.';
      if (outcome.slm != null) {
        message +=
          ' Model review: ' + outcome.slm.reviewed + ' checked, ' + outcome.slm.rejected + ' dropped.';
        if (outcome.slm.note != null) {
          message += ' ' + outcome.slm.note;
        }
      }
      console.log(message);
      setNotice(message);
    } catch (error) {
      console.warn('Scan failed: ' + String(error));
      setNotice('Scan failed: ' + String(error));
    } finally {
      stopListening();
      setRunning(false);
      // The temporary copies are not needed any more: delete them.
      await clearStaging();
      setSelectedNames([]);
      redraw();
    }
  }, [running, selectedNames, deepScan]);

  const cancelScan = useCallback(() => {
    context?.requestCancel();
  }, [context]);

  // Shows the most recent findings from all earlier scans.
  const showSaved = useCallback(async () => {
    try {
      const saved = await getAllFindings(200);
      setDbFindings(saved);
      const message =
        saved.length === 0
          ? 'The database has no saved findings yet.'
          : 'Showing ' + saved.length + ' saved findings from the database.';
      console.log(message);
      setNotice(message);
    } catch (error) {
      console.warn('Could not read saved results: ' + String(error));
      setNotice('Could not read saved results: ' + String(error));
    }
  }, []);

  // Writes the most recent saved findings to a CSV file in the app's folder.
  const exportCsv = useCallback(async () => {
    try {
      const path = await exportFindingsToCsv();
      console.log('CSV saved: ' + path);
      setNotice('CSV saved: ' + path);
    } catch (error) {
      console.warn('CSV export failed: ' + String(error));
      setNotice('CSV export failed: ' + String(error));
    }
  }, []);

  // Which list to show: database results if loaded, else the live scan.
  const findings: ScanResult[] = dbFindings ?? context?.getFindings() ?? [];

  // Short summary of the selected files for the screen.
  const selectedSummary =
    selectedNames.length <= 4
      ? selectedNames.join(', ')
      : selectedNames.slice(0, 4).join(', ') + ' and ' + (selectedNames.length - 4) + ' more';

  const downloading = downloadPercent != null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>SentinelScan</Text>
          <Text style={styles.subtitle}>Everything stays on this device</Text>
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={selectFiles} disabled={running}>
            <Text style={styles.buttonSecondaryText}>Select files</Text>
          </Pressable>
          {running ? (
            <Pressable style={[styles.button, styles.buttonDanger]} onPress={cancelScan}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.button,
                styles.buttonPrimary,
                (selectedNames.length === 0 || downloading) && styles.buttonDisabled,
              ]}
              onPress={startScan}
              disabled={selectedNames.length === 0 || downloading}>
              <Text style={styles.buttonText}>Start scan</Text>
            </Pressable>
          )}
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={showSaved} disabled={running}>
            <Text style={styles.buttonSecondaryText}>Saved results</Text>
          </Pressable>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Deep scan</Text>
            <Text style={styles.toggleHint}>On-device model double-checks uncertain matches</Text>
          </View>
          <Switch value={deepScan} onValueChange={setDeepScan} disabled={running} />
        </View>

        <Pressable
          style={[styles.button, styles.buttonSecondary, styles.downloadButton]}
          onPress={exportCsv}
          disabled={running}>
          <Text style={styles.buttonSecondaryText}>Export CSV</Text>
        </Pressable>

        {deepScan && modelReady === false && (
          <Pressable
            style={[styles.button, styles.buttonSecondary, styles.downloadButton]}
            onPress={downloadModelFile}
            disabled={downloading}>
            <Text style={styles.buttonSecondaryText}>
              {downloading
                ? 'Downloading model... ' + downloadPercent + '%'
                : 'Download model (' + MODEL_SIZE_LABEL + ', one time)'}
            </Text>
          </Pressable>
        )}

        {selectedNames.length > 0 && (
          <Text style={styles.selected} numberOfLines={3}>
            Selected: {selectedSummary}
          </Text>
        )}

        {notice != null && <Text style={styles.notice}>{notice}</Text>}

        {context != null && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last scan: {context.status}</Text>
            <Text style={styles.cardLine}>
              Files scanned: {context.filesScanned}   Skipped: {context.filesSkipped}   Errors:{' '}
              {context.errorsEncountered}
            </Text>
            <Text style={styles.cardLine}>
              Findings: {context.totalFindingsCount}   Critical: {context.countByRisk('CRITICAL')}   Medium:{' '}
              {context.countByRisk('MEDIUM')}   Normal: {context.countByRisk('NORMAL')}
            </Text>
            {context.currentFile != null && (
              <Text style={styles.cardFile} numberOfLines={1}>
                {context.currentFile}
              </Text>
            )}
          </View>
        )}

        <FlatList
          data={findings}
          keyExtractor={(item, index) => item.filePath + '|' + item.scanTimestamp + '|' + index}
          renderItem={({ item }) => <FindingRow item={item} />}
          ListEmptyComponent={<Text style={styles.empty}>No findings to show yet.</Text>}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#0D2B4E' },
  subtitle: { fontSize: 13, color: '#5F6B7A', marginTop: 2 },
  buttonRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: '#0D2B4E' },
  buttonDanger: { backgroundColor: '#C62828' },
  buttonSecondary: { backgroundColor: '#EEF2F7' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  buttonSecondaryText: { color: '#0D2B4E', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  toggleText: { flex: 1 },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: '#0D2B4E' },
  toggleHint: { fontSize: 11, color: '#78909C', marginTop: 1 },
  downloadButton: { flex: 0, marginHorizontal: 16, marginVertical: 6 },
  selected: { marginHorizontal: 16, marginBottom: 4, fontSize: 12, color: '#0D2B4E' },
  notice: { marginHorizontal: 16, marginBottom: 8, fontSize: 12, color: '#37474F' },
  card: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 8, backgroundColor: '#F5F7FA' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0D2B4E', marginBottom: 4 },
  cardLine: { fontSize: 13, color: '#263238', marginTop: 2 },
  cardFile: { fontSize: 11, color: '#78909C', marginTop: 6 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { textAlign: 'center', color: '#90A4AE', marginTop: 24 },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CFD8DC',
  },
  riskDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  findingText: { flex: 1 },
  findingType: { fontSize: 13, fontWeight: '600', color: '#263238' },
  findingValue: { fontSize: 15, color: '#000000', marginTop: 2 },
  findingFile: { fontSize: 11, color: '#90A4AE', marginTop: 2 },
});

export default App;
