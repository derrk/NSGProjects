import { View, Text, StyleSheet } from 'react-native';

// Minimal screen — testing bare expo-router setup
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>ProjectTCG is running ✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#f8fafc', fontSize: 18, fontWeight: '600' },
});
