import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// All wording lives here so it is easy to review and keep true.
const POINTS: { title: string; body: string }[] = [
  {
    title: 'Your files stay on your phone',
    body: 'SentinelScan reads the files you choose and checks them on this device. The app does not ask for internet access.',
  },
  {
    title: 'What it looks for',
    body: 'Card numbers, Aadhaar, PAN, phone numbers, bank details, UPI IDs and similar personal data.',
  },
  {
    title: 'Results are masked',
    body: 'Findings are stored in masked form (for example **** **** **** 1111). The full value is not kept in the results.',
  },
  {
    title: 'You choose what to scan',
    body: 'The app reads files only while a scan is running. If you allow All files access, a whole-phone scan can read every file Android lets it open.',
  },
  {
    title: 'It can be wrong',
    body: 'Detection is automatic. It can miss some data or flag something harmless, so treat the results as a guide.',
  },
];

type Props = { onDone: () => void };

export function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Welcome to SentinelScan</Text>
        <Text style={styles.sub}>Find personal data hiding in your files.</Text>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.card}>
            <Text style={styles.cardTitle}>{p.title}</Text>
            <Text style={styles.cardBody}>{p.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={styles.button}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Get started">
          <Text style={styles.buttonText}>Get started</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingBottom: 12 },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '700', marginTop: 12 },
  sub: { color: '#94a3b8', fontSize: 15, marginTop: 6, marginBottom: 18 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardBody: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  footer: { padding: 16 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
