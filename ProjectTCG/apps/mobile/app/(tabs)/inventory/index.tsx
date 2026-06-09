import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { useState } from 'react';

// TODO: Replace with real data from WatermelonDB
const PLACEHOLDER_ITEMS = [
  { id: '1', name: 'Charizard ex', set: 'SV3pt5', number: '199/165', condition: 'NM', qty: 2, sellPrice: 4500 },
  { id: '2', name: 'Pikachu', set: 'SV3pt5', number: '005/165', condition: 'LP', qty: 5, sellPrice: 150 },
];

export default function InventoryScreen() {
  const [search, setSearch] = useState('');

  const filtered = PLACEHOLDER_ITEMS.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <View style={styles.headerStats}>
          <Text style={styles.stat}>2 cards</Text>
          <Text style={styles.statDivider}>·</Text>
          <Text style={styles.stat}>$46.50 value</Text>
        </View>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search cards..."
        placeholderTextColor="#64748b"
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.set} · #{item.number} · {item.condition}</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardPrice}>${(item.sellPrice / 100).toFixed(2)}</Text>
              <Text style={styles.cardQty}>x{item.qty}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />

      <TouchableOpacity style={styles.fab}>
        <Text style={styles.fabText}>+ Add Card</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: '#f8fafc' },
  headerStats: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  stat: { fontSize: 14, color: '#94a3b8' },
  statDivider: { color: '#475569', marginHorizontal: 8 },
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
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#f8fafc' },
  cardMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardPrice: { fontSize: 15, fontWeight: '700', color: '#6366f1' },
  cardQty: { fontSize: 12, color: '#64748b', marginTop: 2 },
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
