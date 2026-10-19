// ============================================================
// Small shared building blocks for all screens.
// ============================================================
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScanRunStatus } from '../services/core/scanContext';
import { RiskLevel } from '../types';

export const COLORS = {
  navy: '#0D2B4E',
  text: '#263238',
  muted: '#78909C',
  border: '#CFD8DC',
  panel: '#F5F7FA',
  chip: '#EEF2F7',
  white: '#FFFFFF',
  danger: '#C62828',
  warningBg: '#FFF8E1',
  warningText: '#6D4C00',
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: '#C62828',
  MEDIUM: '#EF6C00',
  NORMAL: '#2E7D32',
};

// A numbered section with a title, like the sections of the web page.
export function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
}): React.JSX.Element {
  const kind = props.kind ?? 'secondary';
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        kind === 'primary' && styles.buttonPrimary,
        kind === 'danger' && styles.buttonDanger,
        props.disabled && styles.disabled,
      ]}>
      <Text style={[styles.buttonText, kind === 'secondary' && styles.buttonTextDark]}>{props.label}</Text>
    </Pressable>
  );
}

// A small selectable pill (filters, PII types).
export function Chip(props: { label: string; selected: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={props.onPress} style={[styles.chip, props.selected && styles.chipSelected]}>
      <Text style={[styles.chipText, props.selected && styles.chipTextSelected]}>{props.label}</Text>
    </Pressable>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }): React.JSX.Element {
  return (
    <View style={[styles.riskBadge, { backgroundColor: RISK_COLORS[level] }]}>
      <Text style={styles.riskBadgeText}>{level}</Text>
    </View>
  );
}

// The badge in the top bar.
export function StatusBadge({ status }: { status: ScanRunStatus | null }): React.JSX.Element {
  const text =
    status === null ? 'Scanner Ready'
    : status === 'RUNNING' ? 'Scanning…'
    : status === 'COMPLETED' ? 'Completed'
    : status === 'FAILED' ? 'Failed'
    : 'Cancelled';
  const color =
    status === 'RUNNING' ? '#1565C0' : status === 'COMPLETED' ? '#2E7D32' : status === 'FAILED' ? '#C62828' : COLORS.muted;
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{text}</Text>
    </View>
  );
}

// "Showing 1 to 10 of 25   ‹  1/3  ›"
export function Pager(props: {
  page: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
}): React.JSX.Element | null {
  if (props.totalItems === 0) {
    return null;
  }
  const totalPages = Math.max(1, Math.ceil(props.totalItems / props.pageSize));
  const start = (props.page - 1) * props.pageSize + 1;
  const end = Math.min(props.page * props.pageSize, props.totalItems);
  return (
    <View style={styles.pager}>
      <Text style={styles.pagerInfo}>
        Showing {start} to {end} of {props.totalItems}
      </Text>
      <View style={styles.pagerButtons}>
        <Pressable
          onPress={() => props.onChange(props.page - 1)}
          disabled={props.page <= 1}
          style={[styles.pagerButton, props.page <= 1 && styles.disabled]}>
          <Text style={styles.pagerButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.pagerInfo}>
          {props.page} / {totalPages}
        </Text>
        <Pressable
          onPress={() => props.onChange(props.page + 1)}
          disabled={props.page >= totalPages}
          style={[styles.pagerButton, props.page >= totalPages && styles.disabled]}>
          <Text style={styles.pagerButtonText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 10 },
  button: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.chip,
  },
  buttonPrimary: { backgroundColor: COLORS.navy },
  buttonDanger: { backgroundColor: COLORS.danger },
  buttonText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  buttonTextDark: { color: COLORS.navy },
  disabled: { opacity: 0.4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: COLORS.chip,
    marginRight: 6,
    marginBottom: 6,
  },
  chipSelected: { backgroundColor: COLORS.navy },
  chipText: { fontSize: 12, color: COLORS.navy, fontWeight: '600' },
  chipTextSelected: { color: COLORS.white },
  riskBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4 },
  riskBadgeText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  pager: { marginTop: 8, alignItems: 'center' },
  pagerInfo: { fontSize: 12, color: COLORS.muted },
  pagerButtons: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  pagerButton: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 6, backgroundColor: COLORS.chip },
  pagerButtonText: { fontSize: 18, color: COLORS.navy, fontWeight: '700' },
});
