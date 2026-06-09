import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';

function SettingsRow({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && <Text style={styles.rowChevron}>›</Text>}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const session = useAuthStore((s) => s.session);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Text style={styles.sectionTitle}>STORE</Text>
      <View style={styles.section}>
        <SettingsRow label="Store Profile" onPress={() => {}} />
        <SettingsRow label="Subscription" value="Pro" onPress={() => {}} />
        <SettingsRow label="Staff Accounts" onPress={() => {}} />
      </View>

      <Text style={styles.sectionTitle}>RULES</Text>
      <View style={styles.section}>
        <SettingsRow label="Rule Sets" onPress={() => {}} />
        <SettingsRow label="Default Margin" value="40%" onPress={() => {}} />
      </View>

      <Text style={styles.sectionTitle}>PREFERENCES</Text>
      <View style={styles.section}>
        <SettingsRow label="Games Supported" onPress={() => {}} />
        <SettingsRow label="Pricing Sources" onPress={() => {}} />
        <SettingsRow label="Low Stock Threshold" value="1" onPress={() => {}} />
      </View>

      <Text style={styles.sectionTitle}>ACCOUNT</Text>
      <View style={styles.section}>
        <SettingsRow label="Email" value={session?.user?.email ?? '—'} />
        <SettingsRow label="Export Data" onPress={() => {}} />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.version}>
        <Text style={styles.versionText}>ProjectTCG v0.0.1</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: '#f8fafc' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    letterSpacing: 0.8,
  },
  section: {
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  rowLabel: { flex: 1, fontSize: 15, color: '#f8fafc' },
  rowValue: { fontSize: 14, color: '#64748b', marginRight: 8 },
  rowChevron: { fontSize: 18, color: '#475569' },
  signOutButton: {
    margin: 16,
    marginTop: 24,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
  version: { alignItems: 'center', padding: 24 },
  versionText: { color: '#334155', fontSize: 12 },
});
