// ============================================================
// "1. Scan Configuration" (web: index.html section 1).
// Choosing files and starting the scan now happen in the bottom bar
// (ActionBar), so this section only holds the settings.
// Holds no scan logic: every choice goes up to App through props.
// ============================================================
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { ScanOptions } from '../services/core/scanContext';
import { MODEL_SIZE_LABEL } from '../services/slm/slmClassifier';
import { SENSITIVE_DATA_TYPES, SensitiveDataType } from '../types';
import { Button, Chip, COLORS, Section } from './components';
import { friendlyType } from './format';

interface Props {
  running: boolean;
  selectedNames: string[];
  selectedPii: SensitiveDataType[];
  onChangePii: (types: SensitiveDataType[]) => void;
  options: ScanOptions;
  onChangeOptions: (options: ScanOptions) => void;
  deepScan: boolean;
  onChangeDeepScan: (value: boolean) => void;
  modelReady: boolean | null;
  downloadPercent: number | null;
  onDownloadModel: () => void;
}

// One row with a label and a switch.
function SwitchRow(props: {
  label: string;
  hint?: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.switchLabel}>{props.label}</Text>
        {props.hint != null && <Text style={styles.hint}>{props.hint}</Text>}
      </View>
      <Switch value={props.value} onValueChange={props.onChange} disabled={props.disabled} />
    </View>
  );
}

export function ConfigSection(props: Props): React.JSX.Element {
  // Is the PII type list open?
  const [piiOpen, setPiiOpen] = useState(false);

  const piiLabel =
    props.selectedPii.length === 0
      ? 'All PII Types'
      : props.selectedPii.length === 1
        ? friendlyType(props.selectedPii[0])
        : props.selectedPii.length + ' PII Types selected';

  const togglePii = (type: SensitiveDataType): void => {
    props.onChangePii(
      props.selectedPii.includes(type) ? props.selectedPii.filter((t) => t !== type) : [...props.selectedPii, type],
    );
  };

  const downloading = props.downloadPercent != null;

  return (
    <Section title="1. Scan Configuration">
      {/* Files to scan: chosen with the button at the bottom of the screen */}
      <Text style={styles.label}>Files to scan</Text>
      <Text style={styles.selected}>
        {props.selectedNames.length === 0
          ? 'None selected. Tap "Select files" at the bottom.'
          : props.selectedNames.length <= 4
            ? props.selectedNames.join(', ')
            : props.selectedNames.slice(0, 4).join(', ') + ' and ' + (props.selectedNames.length - 4) + ' more'}
      </Text>

      {/* PII types (web: dropdown of chips) */}
      <Text style={[styles.label, styles.gap]}>
        PII Types <Text style={styles.hint}>(select one or more)</Text>
      </Text>
      <Button label={piiLabel + (piiOpen ? '  ▲' : '  ▼')} onPress={() => setPiiOpen(!piiOpen)} disabled={props.running} />
      {piiOpen && (
        <View style={styles.piiPanel}>
          <View style={styles.chipWrap}>
            {SENSITIVE_DATA_TYPES.map((type) => (
              <Chip
                key={type}
                label={friendlyType(type)}
                selected={props.selectedPii.includes(type)}
                onPress={() => togglePii(type)}
              />
            ))}
          </View>
          <View style={styles.piiFooter}>
            <View style={styles.footerButton}>
              <Button label="Select All" onPress={() => props.onChangePii([...SENSITIVE_DATA_TYPES])} />
            </View>
            <View style={styles.footerButton}>
              <Button label="Clear" onPress={() => props.onChangePii([])} />
            </View>
          </View>
        </View>
      )}

      {/* Scan options (web: three checkboxes) */}
      <Text style={[styles.label, styles.gap]}>Scan Options</Text>
      <Text style={styles.hint}>These apply when scanning folders.</Text>
      <SwitchRow
        label="Recursive Scan"
        value={props.options.recursive}
        disabled={props.running}
        onChange={(recursive) => props.onChangeOptions({ ...props.options, recursive })}
      />
      <SwitchRow
        label="Include Hidden Files"
        value={props.options.includeHiddenFiles}
        disabled={props.running}
        onChange={(includeHiddenFiles) => props.onChangeOptions({ ...props.options, includeHiddenFiles })}
      />
      <SwitchRow
        label="Exclude Configured Paths"
        value={props.options.excludeConfiguredPaths}
        disabled={props.running}
        onChange={(excludeConfiguredPaths) => props.onChangeOptions({ ...props.options, excludeConfiguredPaths })}
      />

      {/* Deep scan (new on the phone: Stage 2, the on-device model) */}
      <SwitchRow
        label="Deep scan"
        hint="On-device model double-checks uncertain matches"
        value={props.deepScan}
        disabled={props.running}
        onChange={props.onChangeDeepScan}
      />
      {props.deepScan && props.modelReady === false && (
        <Button
          label={
            downloading
              ? 'Downloading model... ' + props.downloadPercent + '%'
              : 'Download model (' + MODEL_SIZE_LABEL + ', one time)'
          }
          onPress={props.onDownloadModel}
          disabled={downloading}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  selected: { fontSize: 13, color: COLORS.navy },
  hint: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  gap: { marginTop: 14 },
  piiPanel: { marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: COLORS.panel },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  piiFooter: { flexDirection: 'row', gap: 8, marginTop: 4 },
  footerButton: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 14, color: COLORS.text },
});
