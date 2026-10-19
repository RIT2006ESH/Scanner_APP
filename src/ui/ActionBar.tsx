// ============================================================
// The bar at the bottom of the screen. It is always visible, so the
// scan can be started without scrolling:
//   no files chosen  -> one big "Select files" button
//   files chosen     -> "Change files (n)" and "Run Scan"
//   scan running     -> current file and "Stop Scan"
// Messages (notices) also appear here, so they are never scrolled away.
// ============================================================
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, COLORS } from './components';

interface Props {
  running: boolean;
  selectedCount: number;
  // true while the model is downloading (scan cannot start meanwhile)
  busy: boolean;
  currentFile: string | null;
  notice: string | null;
  onDismissNotice: () => void;
  onSelect: () => void;
  onRun: () => void;
  onStop: () => void;
}

// Shows only the file name, not the whole temporary path.
function shortName(path: string | null): string {
  if (path == null) {
    return '…';
  }
  return path.substring(path.lastIndexOf('/') + 1);
}

export function ActionBar(props: Props): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {props.notice != null && (
        <Pressable onPress={props.onDismissNotice} style={styles.notice}>
          <Text style={styles.noticeText} numberOfLines={3}>
            {props.notice}
          </Text>
          <Text style={styles.noticeClose}>✕</Text>
        </Pressable>
      )}

      {props.running ? (
        <View>
          <Text style={styles.progress} numberOfLines={1}>
            Scanning: {shortName(props.currentFile)}
          </Text>
          <Button label="Stop Scan" kind="danger" onPress={props.onStop} />
        </View>
      ) : props.selectedCount === 0 ? (
        <Button label="Select files" kind="primary" onPress={props.onSelect} disabled={props.busy} />
      ) : (
        <View style={styles.row}>
          <View style={styles.side}>
            <Button label={'Change files (' + props.selectedCount + ')'} onPress={props.onSelect} disabled={props.busy} />
          </View>
          <View style={styles.main}>
            <Button label="Run Scan" kind="primary" onPress={props.onRun} disabled={props.busy} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    elevation: 8,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  noticeText: { flex: 1, fontSize: 12, color: '#0D47A1' },
  noticeClose: { fontSize: 14, color: '#0D47A1', marginLeft: 8 },
  progress: { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  side: { flex: 1 },
  main: { flex: 1 },
});
