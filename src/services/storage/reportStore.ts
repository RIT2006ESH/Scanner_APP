import { open } from '@op-engineering/op-sqlite';
import { ScanResultRecord } from '../../types';

const db = open({
  name: 'sentinelscan.db',
  encryptionKey: 'TODO_replace_with_securely_generated_key', // TODO: pull from Android Keystore, not hardcoded
});

db.execute(`
  CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filePath TEXT NOT NULL,
    type TEXT NOT NULL,
    maskedValue TEXT NOT NULL,
    confidence REAL NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

export async function saveResult(record: ScanResultRecord): Promise<void> {
  db.execute(
    'INSERT INTO scan_results (filePath, type, maskedValue, confidence, timestamp) VALUES (?, ?, ?, ?, ?)',
    [record.filePath, record.type, record.maskedValue, record.confidence, record.timestamp],
  );
}

export async function getAllResults(): Promise<ScanResultRecord[]> {
  const { rows } = db.execute('SELECT * FROM scan_results ORDER BY timestamp DESC');
  return (rows?._array ?? []) as ScanResultRecord[];
}
