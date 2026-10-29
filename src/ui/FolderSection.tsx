import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { QUICK_FOLDERS } from '../services/allFilesAccess';
import { Button, COLORS } from './components';

interface Props {
  granted: boolean | null; // null = still checking
  disabled: boolean;
  onGrant: () => void;
  onPick: (label: string, path: string) => void;
}

export function FolderSection(props: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Scan a folder</Text>
      {props.granted ? (
        <View style={styles.grid}>
          {QUICK_FOLDERS.map((f) => (
            <View key={f.label} style={styles.cell}>
              <Button
                label={f.label}
                onPress={() => props.onPick(f.label, f.path)}
                disabled={props.disabled}
              />
            </View>
          ))}
        </View>
      ) : (
        <View>
          <Text style={styles.hint}>
            To scan folders or the whole phone, the app needs "All files access". Android opens
            a settings page: turn the switch on, then come back here. The app only reads files
            when you start a scan.
          </Text>
          <Button label="Grant all files access" kind="primary" onPress={props.onGrant} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { minWidth: '45%', flexGrow: 1 },
});
