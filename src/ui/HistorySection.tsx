import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScanRunRecord } from '../services/storage/reportStore';
import { Button, COLORS, Pager, RISK_COLORS, Section, StatusBadge } from './components';
import { formatDuration, formatTimestamp } from './format';

const PAGE_SIZE = 10;

interface Props {
  runs: ScanRunRecord[];
  // Exports the findings of one scan as a CSV.
  onExportRun: (runId: string) => void;
}

function Count({ label, value, color }: { label: string; value: number; color?: string }): React.JSX.Element {
  return (
    <View style={styles.count}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={[styles.countValue, color != null && { color }]}>{value}</Text>
    </View>
  );
}

function RunCard({ run, onExport }: { run: ScanRunRecord; onExport: () => void }): React.JSX.Element {
  const duration = run.endTime != null ? formatDuration(run.endTime - run.startTime) : '–';
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.runId}>{run.runId.substring(0, 8)}</Text>
        <StatusBadge status={run.status} />
      </View>
      <Text style={styles.path} numberOfLines={2}>
        {run.scanPath || '-'}
      </Text>
      <Text style={styles.detail}>
        {formatTimestamp(run.startTime)} · {duration}
        {run.deepScan ? ' · Deep scan' : ''}
      </Text>
      <View style={styles.counts}>
        <Count label="Critical" value={run.criticalCount} color={RISK_COLORS.CRITICAL} />
        <Count label="Medium" value={run.mediumCount} color={RISK_COLORS.MEDIUM} />
        <Count label="Normal" value={run.normalCount} color={RISK_COLORS.NORMAL} />
        <Count label="Total" value={run.totalFindings} />
      </View>
      <Text style={styles.detail}>
        Files scanned {run.filesScanned} · skipped {run.filesSkipped} · errors {run.errorsEncountered}
      </Text>
      {run.totalFindings > 0 && (
        <View style={styles.export}>
          <Button label="Export this scan" onPress={onExport} />
        </View>
      )}
    </View>
  );
}

export function HistorySection({ runs, onExportRun }: Props): React.JSX.Element {
  const [page, setPage] = useState(1);

  // Keep the page number valid when the list gets shorter.
  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const items = runs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Section title="5. Scan History">
      {items.length === 0 ? (
        <Text style={styles.empty}>No scans yet</Text>
      ) : (
        items.map((run) => <RunCard key={run.runId} run={run} onExport={() => onExportRun(run.runId)} />)
      )}
      <Pager page={currentPage} totalItems={runs.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </Section>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: COLORS.muted, marginVertical: 20 },
  card: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runId: { fontSize: 14, fontWeight: '700', color: COLORS.navy, fontFamily: 'monospace' },
  path: { fontSize: 12, color: COLORS.text, marginTop: 4 },
  detail: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  counts: { flexDirection: 'row', marginTop: 8 },
  count: { flex: 1 },
  countLabel: { fontSize: 11, color: COLORS.muted },
  countValue: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  export: { marginTop: 8 },
});
