import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import { Button, COLORS } from './components';

const ROOT = RNFS.ExternalStorageDirectoryPath;

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (paths: string[]) => void;
}

interface FolderRow {
  name: string;
  path: string;
}

export function FolderBrowser({ visible, onClose, onConfirm }: Props): React.JSX.Element {
  const [current, setCurrent] = useState(ROOT);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    try {
      const entries = await RNFS.readDir(path);
      const rows = entries
        .filter((e) => e.isDirectory() && !/\/Android\/(data|obb)$/.test(e.path))
        .map((e) => ({ name: e.name, path: e.path }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      setFolders(rows);
      setCurrent(path);
      setError(null);
    } catch (e) {
      setError('Cannot open this folder: ' + String(e));
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setSelected([]);
      load(ROOT);
    }
  }, [visible, load]);

  const toggle = (path: string) =>
    setSelected((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));

  const goUp = () => {
    if (current !== ROOT) {
      load(current.substring(0, current.lastIndexOf('/')) || ROOT);
    }
  };

  const confirmLabel =
    selected.length > 0 ? 'Scan selected (' + selected.length + ')' : 'Scan this folder';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Choose folders to scan</Text>
        <Text style={styles.path} numberOfLines={2}>
          {current}
        </Text>
        {current !== ROOT && (
          <Pressable onPress={goUp} style={styles.row}>
            <Text style={styles.name}>⬆  Up one level</Text>
          </Pressable>
        )}
        {error != null && <Text style={styles.error}>{error}</Text>}
        <FlatList
          data={folders}
          keyExtractor={(f) => f.path}
          ListEmptyComponent={<Text style={styles.empty}>No subfolders here.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.nameBox} onPress={() => load(item.path)}>
                <Text style={styles.name}>📁  {item.name}</Text>
              </Pressable>
              <Pressable onPress={() => toggle(item.path)} style={styles.check}>
                <Text style={styles.checkText}>{selected.includes(item.path) ? '☑' : '☐'}</Text>
              </Pressable>
            </View>
          )}
        />
        <View style={styles.footer}>
          <View style={styles.footerCell}>
            <Button label="Cancel" onPress={onClose} />
          </View>
          <View style={styles.footerCell}>
            <Button
              label={confirmLabel}
              kind="primary"
              onPress={() => onConfirm(selected.length > 0 ? selected : [current])}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  title: { fontSize: 18, fontWeight: '700', padding: 16, paddingBottom: 4 },
  path: { fontSize: 12, color: COLORS.muted, paddingHorizontal: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
  },
  nameBox: { flex: 1, paddingVertical: 14 },
  name: { fontSize: 15 },
  check: { padding: 12 },
  checkText: { fontSize: 22 },
  empty: { padding: 16, color: COLORS.muted },
  error: { padding: 16, color: '#C62828', fontSize: 12 },
  footer: { flexDirection: 'row', gap: 8, padding: 12 },
  footerCell: { flex: 1 },
});
