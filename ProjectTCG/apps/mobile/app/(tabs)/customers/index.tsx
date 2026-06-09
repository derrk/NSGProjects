import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { useState } from 'react';

// TODO: Load from WatermelonDB — Customer model
const PLACEHOLDER_CUSTOMERS = [
  { id: '1', name: 'John Doe', creditBalance: 3200, transactionCount: 4 },
  { id: '2', name: 'Sarah Miller', creditBalance: 500, transactionCount: 2 },
];

export default function CustomersScreen() {
  const [search, setSearch] = useState('');

  const filtered = PLACEHOLDER_CUSTOMERS.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search customers..."
        placeholderTextColor="#64748b"
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name[0]}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.transactionCount} transactions</Text>
            </View>
            <View style={styles.credit}>
              <Text style={styles.creditLabel}>Store Credit</Text>
              <Text style={styles.creditAmount}>${(item.creditBalance / 100).toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />

      <TouchableOpacity style={styles.fab}>
        <Text style={styles.fabText}>+ New Customer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: '#f8fafc' },
  search: {
    backgroundColor: '#1e293b',
    margin: 16,
    marginTop: 0,
    borderRadius: 10,
    padding: 14,
    color: '#f8fafc',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  list: { paddingHorizontal: 16 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#f8fafc' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  credit: { alignItems: 'flex-end' },
  creditLabel: { fontSize: 11, color: '#64748b' },
  creditAmount: { fontSize: 15, fontWeight: '700', color: '#6366f1' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
