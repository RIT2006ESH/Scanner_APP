import React, { useEffect, useReducer } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ScanContext, ScanRunStatus } from '../services/core/scanContext';
import { RiskLevel } from '../types';
import { COLORS, RISK_COLORS, Section } from './components';
import { formatDuration, formatTimestamp, percentOf } from './format';

// Heading and sub-heading for each state (same wording as the web page).
const STATUS_TEXT: Record<ScanRunStatus | 'IDLE', [string, string]> = {
  IDLE: ['Idle', 'No scan running'],
  RUNNING: ['Running', 'Scan in progress'],
  COMPLETED: ['Completed', 'Scan completed successfully'],
  FAILED: ['Failed', 'Scan encountered an error'],
  CANCELLED: ['Cancelled', 'Scan was cancelled'],
};

// Redraws once per second while a scan runs, so the clock keeps moving.
function useSecondTicker(active: boolean): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color != null && { color }]}>{value}</Text>
    </View>
  );
}

export function StatusSection({ context }: { context: ScanContext | null }): React.JSX.Element {
  useSecondTicker(context?.status === 'RUNNING');

  const state = context?.status ?? 'IDLE';
  const [heading, subheading] = STATUS_TEXT[state];
  const elapsed = context != null ? (context.endTime ?? Date.now()) - context.startTime : 0;

  return (
    <Section title="2. Scan Status">
      <View style={styles.headingRow}>
        {state === 'RUNNING' && <ActivityIndicator color={COLORS.navy} style={styles.spinner} />}
        <View>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.subheading}>{subheading}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Metric label="Files Scanned" value={String(context?.filesScanned ?? 0)} />
        <Metric label="Files Skipped" value={String(context?.filesSkipped ?? 0)} />
        <Metric label="Findings Detected" value={String(context?.totalFindingsCount ?? 0)} color={COLORS.danger} />
        <Metric label="Time Elapsed" value={formatDuration(elapsed)} />
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: state === 'RUNNING' || state === 'IDLE' ? '0%' : '100%' }]} />
      </View>

      <Text style={styles.detail} numberOfLines={1}>
        Current File: {context?.currentFile ?? '–'}
      </Text>
      <Text style={styles.detail}>Started: {formatTimestamp(context?.startTime)}</Text>
      <Text style={styles.detail}>Completed: {formatTimestamp(context?.endTime)}</Text>
    </Section>
  );
}

// One of the three risk cards.
function RiskCard(props: { level: RiskLevel; label: string; count: number; total: number }): React.JSX.Element {
  return (
    <View style={[styles.card, { borderLeftColor: RISK_COLORS[props.level] }]}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={[styles.metricValue, { color: RISK_COLORS[props.level] }]}>{props.count}</Text>
      <Text style={styles.metricLabel}>{percentOf(props.count, props.total)}</Text>
    </View>
  );
}

export function SummarySection({ context }: { context: ScanContext | null }): React.JSX.Element {
  const critical = context?.countByRisk('CRITICAL') ?? 0;
  const medium = context?.countByRisk('MEDIUM') ?? 0;
  const normal = context?.countByRisk('NORMAL') ?? 0;
  const total = critical + medium + normal;
  const elapsed = context != null ? (context.endTime ?? Date.now()) - context.startTime : 0;

  return (
    <Section title="3. Scan Summary">
      <View style={styles.grid}>
        <RiskCard level="CRITICAL" label="Critical" count={critical} total={total} />
        <RiskCard level="MEDIUM" label="Medium" count={medium} total={total} />
        <RiskCard level="NORMAL" label="Normal" count={normal} total={total} />
        <View style={styles.card}>
          <Text style={styles.metricLabel}>Files Scanned</Text>
          <Text style={styles.metricValue}>{context?.filesScanned ?? 0}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.metricLabel}>Files Skipped</Text>
          <Text style={styles.metricValue}>{context?.filesSkipped ?? 0}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.metricLabel}>Total Findings</Text>
          <Text style={styles.metricValue}>{total}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.metricLabel}>Scan Duration</Text>
          <Text style={styles.metricValue}>{formatDuration(elapsed)}</Text>
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  spinner: { marginRight: 10 },
  heading: { fontSize: 16, fontWeight: '700', color: COLORS.navy },
  subheading: { fontSize: 12, color: COLORS.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48%', paddingVertical: 4 },
  metricLabel: { fontSize: 11, color: COLORS.muted },
  metricValue: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  track: { height: 6, borderRadius: 3, backgroundColor: COLORS.chip, marginVertical: 10, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: COLORS.navy },
  detail: { fontSize: 12, color: COLORS.text, marginTop: 2 },
  card: {
    width: '48%',
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.panel,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.border,
  },
});
