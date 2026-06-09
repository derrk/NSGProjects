import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';

// TODO: Load from WatermelonDB — Transaction model
const PLACEHOLDER_TRANSACTIONS = [
  { id: '1', type: 'trade_in', status: 'completed', customerName: 'John D.', totalCredit: 3200, cardCount: 8, completedAt: '2026-05-07' },
  { id: '2', type: 'buylist', status: 'completed', customerName: 'Sarah M.', totalCredit: 1500, cardCount: 3, completedAt: '2026-05-06' },
  { id: '3', type: 'trade_in', status: 'open', customerName: null, totalCredit: 0, cardCount: 0, completedAt: null },
];

const TYPE_LABELS: Record<string, string> = {
  trade_in: 'Trade-In',
  buylist: 'Buylist',
  retail_pricing: 'Retail Pricing',
};

export default function TransactionsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
      </View>

      <TouchableOpacity style={styles.newButton}>
        <Text style={styles.newButtonText}>+ New Transaction</Text>
      </TouchableOpacity>

      <FlatList
        data={PLACEHOLDER_TRANSACTIONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.badge, item.status === 'open' && styles.badgeOpen]}>
                <Text style={styles.badgeText}>{item.status === 'open' ? 'OPEN' : TYPE_LABELS[item.type]}</Text>
              </View>
              {item.completedAt && (
                <Text style={styles.date}>{item.completedAt}</Text>
              )}
            </View>
            <Text style={styles.customer}>{item.customerName ?? 'No customer assigned'}</Text>
            {item.status === 'completed' && (
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>{item.cardCount} cards</Text>
                <Text style={styles.cardValue}>${(item.totalCredit / 100).toFixed(2)} credit</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: '#f8fafc' },
  newButton: {
    backgroundColor: '#6366f1',
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  newButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  list: { paddingHorizontal: 16 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  badge: {
    backgroundColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOpen: { backgroundColor: '#16a34a' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#f8fafc' },
  date: { fontSize: 12, color: '#475569' },
  customer: { fontSize: 15, fontWeight: '600', color: '#f8fafc' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cardMeta: { fontSize: 13, color: '#64748b' },
  cardValue: { fontSize: 13, fontWeight: '600', color: '#6366f1' },
});
