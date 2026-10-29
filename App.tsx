// ============================================================
// SentinelScan main screen. One scrolling page with the same sections
// as the web dashboard:
//   1. Scan Configuration   2. Scan Status   3. Scan Summary
//   4. Findings             5. Scan History
// (Detection Rules and Settings panels come next.)
//
// The bottom bar (ActionBar) is always visible: it chooses the files and
// starts or stops the scan, so nobody has to scroll to find "Run Scan".
// The page is never scrolled by the program: the result of a scan is
// shown in the bottom bar, and the user scrolls the page by hand.
//
// How a scan works here:
//   1. "Select files" opens Android's file picker. Each chosen file is
//      copied into a temporary folder inside the app (picked files are
//      content:// links that the scanner cannot read directly).
//   2. "Run Scan" scans that folder. With "Deep scan" on, an on-device
//      model double-checks uncertain matches.
//   3. When the scan ends, the temporary copies are DELETED, and the
//      results are read back from the encrypted local database.
// ============================================================
import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { AppState, Keyboard, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import { pick, types } from '@react-native-documents/picker';
import { DEFAULT_SCAN_OPTIONS, ScanContext, ScanOptions } from './src/services/core/scanContext';
import { exportFindingsCsv } from './src/services/export/reportExport';
import { executeScan } from './src/services/orchestrator';
import { downloadModel, isModelDownloaded } from './src/services/slm/slmClassifier';
import {
  getAllFindings,
  getFindingsByRun,
  getRuns,
  ScanRunRecord,
} from './src/services/storage/reportStore';
import { ScanResult, SensitiveDataType } from './src/types';
import { ActionBar } from './src/ui/ActionBar';
import { COLORS, StatusBadge } from './src/ui/components';
import { ConfigSection } from './src/ui/ConfigSection';
import { FindingsSection } from './src/ui/FindingsSection';
import { HistorySection } from './src/ui/HistorySection';
import { StatusSection, SummarySection } from './src/ui/StatusSections';
import { FolderSection } from './src/ui/FolderSection';
import { startScanService, stopScanService } from './src/services/scanService';
import { isAllFilesAccessGranted, openAllFilesSettings } from './src/services/allFilesAccess';

// Temporary folder that holds the copies of the chosen files.
const STAGING_FOLDER = RNFS.CachesDirectoryPath + '/SentinelScanSelected';

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

function App(): React.JSX.Element {
  const [context, setContext] = useState<ScanContext | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  // Real folders to scan (null = scan the copied files in the temporary folder).
  const [targetRoots, setTargetRoots] = useState<string[] | null>(null);
  const [allFilesGranted, setAllFilesGranted] = useState<boolean | null>(null);

  // Check the permission now, and again every time the user comes back from Settings.
  useEffect(() => {
    const check = () => isAllFilesAccessGranted().then(setAllFilesGranted);
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });
    return () => sub.remove();
  }, []);
  // Results read from the database (null = show the live scan instead).
  const [dbFindings, setDbFindings] = useState<ScanResult[] | null>(null);
  // The scan history (newest first).
  const [runs, setRuns] = useState<ScanRunRecord[]>([]);

  // Scan configuration.
  const [selectedPii, setSelectedPii] = useState<SensitiveDataType[]>([]);
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_SCAN_OPTIONS);
  const [deepScan, setDeepScan] = useState(false);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);

  // The bottom bar hides while the keyboard is open (search box).
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // The scan state is a plain object that changes by itself, so a counter
  // is used to ask React to redraw the screen.
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  // Reads the scan history from the database.
  const refreshRuns = useCallback(async () => {
    try {
      setRuns(await getRuns(200));
    } catch (error) {
      console.warn('Could not read the scan history: ' + String(error));
    }
  }, []);

  // At start: load the scan history and check whether the model is downloaded.
  useEffect(() => {
    refreshRuns();
    isModelDownloaded().then(setModelReady);
  }, [refreshRuns]);

  // Hide the bottom bar while the keyboard is open.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
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
      setTargetRoots(null);
      setDbFindings(null);
      setNotice(names.length + ' file(s) ready. Tap "Run Scan".');
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
  const runScan = useCallback(async () => {
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
    await startScanService();
    const stopListening = scan.subscribe(() => redraw());

    try {
      const outcome = await executeScan(scan, {
        roots: targetRoots ?? [STAGING_FOLDER],
        deepScan,
        options,
        enabledTypes: selectedPii.length > 0 ? new Set(selectedPii) : null,
      });

      // Read the findings back from the database. This proves they were
      // really saved, not just held in memory.
      const saved = await getFindingsByRun(scan.runId);
      setDbFindings(saved);

      let message = 'Saved ' + saved.length + ' of ' + scan.totalFindingsCount + ' findings in the database.';
      if (outcome.slm != null) {
        message += ' Model review: ' + outcome.slm.reviewed + ' checked, ' + outcome.slm.rejected + ' dropped.';
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
      await stopScanService();
      setRunning(false);
      // The temporary copies are not needed any more: delete them.
      await clearStaging();
      setSelectedNames([]);
      setTargetRoots(null);
      // The scan is in the history now: show it.
      await refreshRuns();
      redraw();
    }
  }, [running, selectedNames, targetRoots, deepScan, options, selectedPii, refreshRuns]);

  // A quick folder button: the real folder is scanned, nothing is copied.
  const pickFolder = useCallback(
    async (label: string, path: string) => {
      if (running) {
        return;
      }
      if (!(await isAllFilesAccessGranted())) {
        setAllFilesGranted(false);
        return;
      }
      if (!(await RNFS.exists(path))) {
        setNotice(label + ' was not found on this phone.');
        return;
      }
      await clearStaging();
      setTargetRoots([path]);
      setSelectedNames([label]);
      setDbFindings(null);
      setNotice(label + ' selected. Tap "Run Scan".');
    },
    [running],
  );

  const grantAllFiles = useCallback(() => {
    openAllFilesSettings().catch((e) => setNotice('Could not open Settings: ' + String(e)));
  }, []);

  const stopScan = useCallback(() => {
    context?.requestCancel();
  }, [context]);

  // Shows the most recent findings from all earlier scans.
  const loadSaved = useCallback(async () => {
    try {
      const saved = await getAllFindings(500);
      setDbFindings(saved);
      setNotice(
        saved.length === 0
          ? 'The database has no saved findings yet.'
          : 'Showing ' + saved.length + ' saved findings from the database.',
      );
    } catch (error) {
      console.warn('Could not read saved results: ' + String(error));
      setNotice('Could not read saved results: ' + String(error));
    }
  }, []);

  // Exports the findings of one past scan as a CSV (History > Export).
  const exportRun = useCallback(async (runId: string) => {
    try {
      const rows = await getFindingsByRun(runId, 100000);
      if (rows.length === 0) {
        setNotice('This scan has no findings to export.');
        return;
      }
      const path = await exportFindingsCsv(rows);
      setNotice('Report saved: ' + path);
    } catch (error) {
      setNotice('Could not export the report: ' + String(error));
    }
  }, []);

  // Findings to show, newest first: database results if loaded, else the live scan.
  const findings: ScanResult[] = dbFindings ?? (context != null ? [...context.getFindings()].reverse() : []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>SentinelScan</Text>
            <Text style={styles.subtitle}>Scan files for sensitive data. Everything stays on this device.</Text>
          </View>
          <StatusBadge status={context?.status ?? null} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ConfigSection
            running={running}
            selectedNames={selectedNames}
            selectedPii={selectedPii}
            onChangePii={setSelectedPii}
            options={options}
            onChangeOptions={setOptions}
            deepScan={deepScan}
            onChangeDeepScan={setDeepScan}
            modelReady={modelReady}
            downloadPercent={downloadPercent}
            onDownloadModel={downloadModelFile}
          />
          <FolderSection
            granted={allFilesGranted}
            disabled={running}
            onGrant={grantAllFiles}
            onPick={pickFolder}
          />
          <StatusSection context={context} />
          <SummarySection context={context} />
          <FindingsSection findings={findings} onNotice={setNotice} onLoadSaved={loadSaved} />
          <HistorySection runs={runs} onExportRun={exportRun} />
        </ScrollView>

        {!keyboardOpen && (
          <ActionBar
            running={running}
            selectedCount={selectedNames.length}
            busy={downloadPercent != null}
            currentFile={context?.currentFile ?? null}
            notice={notice}
            onDismissNotice={() => setNotice(null)}
            onSelect={selectFiles}
            onRun={runScan}
            onStop={stopScan}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ECEFF3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerText: { flex: 1, marginRight: 8 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.navy },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  scroll: { flex: 1 },
  content: { paddingVertical: 12 },
});

export default App;
