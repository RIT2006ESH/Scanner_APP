// ============================================================
// "4. Findings" (web: index.html section 4).
// Search, risk filter, PII type filter, Clear Filters, Export, and
// 10 findings per page. A finding is shown as a card instead of a
// table row, because a phone screen is too narrow for 8 columns.
// ============================================================
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { exportFindingsCsv } from '../services/export/reportExport';
import { RISK_LEVELS, RiskLevel, ScanResult, SENSITIVE_DATA_TYPES, SensitiveDataType } from '../types';
import { Button, Chip, COLORS, Pager, RiskBadge, Section } from './components';
import { formatTimestamp, friendlyType } from './format';

const PAGE_SIZE = 10;

interface Props {
  // Newest first.
  findings: ScanResult[];
  // Shows a message at the top of the screen.
  onNotice: (message: string) => void;
  // Loads the findings of all earlier scans from the database.
  onLoadSaved: () => void;
}

function FindingCard({ item }: { item: ScanResult }): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.type}>{friendlyType(item.dataType)}</Text>
        <RiskBadge level={item.riskLevel} />
      </View>
      <Text style={styles.value}>{item.maskedValue}</Text>
      <Text style={styles.file} numberOfLines={1}>
        {item.fileName}
      </Text>
      <Text style={styles.path} numberOfLines={1}>
        {item.filePath}
      </Text>
      <Text style={styles.path}>
        Scanned {formatTimestamp(item.scanTimestamp)} · Modified {formatTimestamp(item.fileModifiedTime)}
        {item.fileCreationTime != null ? ' · Created ' + formatTimestamp(item.fileCreationTime) : ''}
      </Text>
    </View>
  );
}

export function FindingsSection({ findings, onNotice, onLoadSaved }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState<RiskLevel | ''>('');
  const [type, setType] = useState<SensitiveDataType | ''>('');
  const [page, setPage] = useState(1);

  // Findings that match the search and the filters.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return findings.filter((f) => {
      if (risk !== '' && f.riskLevel !== risk) {
        return false;
      }
      if (type !== '' && f.dataType !== type) {
        return false;
      }
      if (query !== '') {
        const haystack = (f.fileName + ' ' + f.filePath + ' ' + f.maskedValue).toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [findings, search, risk, type]);

  // Keep the page number valid when the list gets shorter.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // The Luhn warning appears whenever any card finding exists (same as web).
  const hasCardFindings = findings.some((f) => f.dataType === 'CARD_NUMBER');

  const clearFilters = (): void => {
    setSearch('');
    setRisk('');
    setType('');
    setPage(1);
  };

  const exportCsv = async (): Promise<void> => {
    if (filtered.length === 0) {
      onNotice('No findings to export.');
      return;
    }
    try {
      const path = await exportFindingsCsv(filtered);
      onNotice('Report saved: ' + path);
    } catch (error) {
      onNotice('Could not export the report: ' + String(error));
    }
  };

  return (
    <Section title={'4. Findings (' + filtered.length + ')'}>
      {hasCardFindings && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            ⚠️ Card number findings passed the Luhn checksum, which only confirms the number is mathematically
            well-formed. <Text style={styles.bold}>Luhn Pass ≠ Real/Active Card</Text> — it does NOT confirm the card is
            genuine, active, or usable.
          </Text>
        </View>
      )}

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          setPage(1);
        }}
        placeholder="Search by file name, path or value..."
        placeholderTextColor={COLORS.muted}
      />

      <View style={styles.chipRow}>
        <Chip label="All Risk Levels" selected={risk === ''} onPress={() => { setRisk(''); setPage(1); }} />
        {RISK_LEVELS.map((level) => (
          <Chip key={level} label={level} selected={risk === level} onPress={() => { setRisk(level); setPage(1); }} />
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
        <Chip label="All PII Types" selected={type === ''} onPress={() => { setType(''); setPage(1); }} />
        {SENSITIVE_DATA_TYPES.map((t) => (
          <Chip key={t} label={friendlyType(t)} selected={type === t} onPress={() => { setType(t); setPage(1); }} />
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Clear Filters" onPress={clearFilters} />
        </View>
        <View style={styles.action}>
          <Button label="Export Findings" onPress={exportCsv} />
        </View>
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Load saved results" onPress={onLoadSaved} />
        </View>
      </View>

      {pageItems.length === 0 ? (
        <Text style={styles.empty}>No findings match your filters</Text>
      ) : (
        pageItems.map((item, index) => (
          <FindingCard key={item.filePath + '|' + item.scanTimestamp + '|' + index} item={item} />
        ))
      )}

      <Pager page={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </Section>
  );
}

const styles = StyleSheet.create({
  warning: { padding: 10, borderRadius: 8, backgroundColor: COLORS.warningBg, marginBottom: 10 },
  warningText: { fontSize: 12, color: COLORS.warningText },
  bold: { fontWeight: '700' },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  typeScroll: { marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  action: { flex: 1 },
  empty: { textAlign: 'center', color: COLORS.muted, marginVertical: 20 },
  card: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  value: { fontSize: 16, color: '#000000', marginTop: 4, fontFamily: 'monospace' },
  file: { fontSize: 12, color: COLORS.text, marginTop: 4 },
  path: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
