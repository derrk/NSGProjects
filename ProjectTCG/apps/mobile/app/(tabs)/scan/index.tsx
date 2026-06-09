import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

// TODO: Integrate react-native-vision-camera + Google ML Kit OCR
// Phase: camera feed → set number OCR → card lookup → price fetch

type ScanMode = 'inventory' | 'trade_in' | 'buylist' | 'retail_pricing';

const MODES: { key: ScanMode; label: string; description: string }[] = [
  { key: 'inventory', label: 'Add to Inventory', description: 'Scan cards to add to your catalog' },
  { key: 'trade_in', label: 'Trade-In', description: 'Calculate trade offer using active rule set' },
  { key: 'buylist', label: 'Buylist', description: 'Generate cash/credit offer sheet' },
  { key: 'retail_pricing', label: 'Retail Pricing', description: 'Price cards using cost + margin' },
];

export default function ScanScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan</Text>
        <Text style={styles.subtitle}>Select a mode to begin</Text>
      </View>

      <View style={styles.modes}>
        {MODES.map((mode) => (
          <TouchableOpacity key={mode.key} style={styles.modeCard}>
            <Text style={styles.modeLabel}>{mode.label}</Text>
            <Text style={styles.modeDescription}>{mode.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.cameraPlaceholder}>
        <Text style={styles.cameraText}>📷</Text>
        <Text style={styles.cameraHint}>Camera integration coming soon</Text>
        <Text style={styles.cameraNote}>
          Requires react-native-vision-camera + native build
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: '#f8fafc' },
  subtitle: { fontSize: 15, color: '#94a3b8', marginTop: 4 },
  modes: { paddingHorizontal: 16, gap: 10 },
  modeCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeLabel: { fontSize: 15, fontWeight: '600', color: '#f8fafc' },
  modeDescription: { fontSize: 13, color: '#64748b', marginTop: 4 },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1e293b',
    borderStyle: 'dashed',
  },
  cameraText: { fontSize: 48, marginBottom: 12 },
  cameraHint: { fontSize: 15, color: '#94a3b8', fontWeight: '500' },
  cameraNote: { fontSize: 12, color: '#475569', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
