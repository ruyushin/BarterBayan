import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface ItemProps {
  item: {
    id: string;
    title: string;
    image: string;
    category: string;
  };
}

export default function ItemCard({ item }: ItemProps) {
  return (
    <Pressable style={styles.card}>
      <ThemedView style={styles.container}>
        <Image 
          source={{ uri: item.image || 'https://picsum.photos/200' }} 
          style={styles.image} 
        />
        <View style={styles.info}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {item.title}
          </ThemedText>
          <ThemedText style={styles.category}>
            {item.category}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    marginRight: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#E5E7EB',
  },
  info: {
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  category: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});