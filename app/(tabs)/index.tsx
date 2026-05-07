import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';

import ItemCard from '../../components/ItemCard';
import { ProductDetailModal } from '../../components/ProductDetailModal';
import { useItems } from '../../hooks/useItems';

const CATEGORIES = [
  { id: '1', name: 'Electronics', icon: 'phone-portrait' },
  { id: '2', name: 'Fashion', icon: 'shirt' },
  { id: '3', name: 'Living', icon: 'bulb' },
  { id: '4', name: 'School/Office', icon: 'school' },
  { id: '5', name: 'Household', icon: 'home' },
];

export default function HomeScreen() {
  const { items, loading } = useItems('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const router = useRouter();

  const query = searchQuery.toLowerCase().trim();
  const filteredResults = query
    ? items.filter((item) =>
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      )
    : [];
  const searchResults = filteredResults.slice(0, 5);
  const totalResults = filteredResults.length;

  const displayItems = items;

  const handleSearchResultPress = (itemTitle: string) => {
    router.push(`/explore?search=${encodeURIComponent(itemTitle)}`);
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim().length > 0) {
      router.push(`/explore?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const handleItemPress = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <ThemedView style={styles.container}>
        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color="#5B5B7B" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for items..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              returnKeyLabel="Search"
            />
          </View>

          {query.length > 0 && (
            <View style={styles.searchPopup}>
              <Text style={styles.popupTitle}>
                {totalResults > 0
                  ? `Found ${totalResults} related posts`
                  : 'No related posts found'}
              </Text>
              {searchResults.length > 0 ? (
                <FlatList
                  data={searchResults}
                  showsVerticalScrollIndicator={false}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View
                      style={styles.searchResultLink}
                      onTouchEnd={() => handleSearchResultPress(item.title)}
                    >
                      <View style={styles.searchResultItem}>
                        <Text style={styles.searchResultText}>{item.title}</Text>
                        <Text style={styles.searchResultCategory}>{item.category}</Text>
                      </View>
                    </View>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
                  contentContainerStyle={styles.searchResultList}
                />
              ) : (
                <Text style={styles.noResultsText}>Try a different keyword or category.</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.sectionHeaderSmall}>
          <Text style={styles.sectionTitleSmall}>Categories</Text>
        </View>

        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => (
            <Link href={`/explore?filter=${encodeURIComponent(item.name)}`} style={styles.categoryLink}>
              <View style={styles.categoryItem}>
                <View style={styles.categoryCircle}>
                  <Ionicons name={item.icon as any} size={22} color="#2f2f6f" />
                </View>
                <Text style={styles.categoryText}>{item.name}</Text>
              </View>
            </Link>
          )}
        />

        <ThemedView style={styles.bannerCard}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>Your Trades</Text>
            <Text style={styles.bannerDescription}>
              No trades listed yet. Adding even one item increases your chances of finding the perfect deal.
            </Text>
          </View>
          <View style={styles.bannerIconOuter}>
            <View style={styles.bannerIconCircle}>
              <Ionicons name="search" size={24} color="#3F51F4" />
            </View>
          </View>
        </ThemedView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending</Text>
          <Link href="/explore">
            <Text style={styles.seeAllText}>See all</Text>
          </Link>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color="#5D5FEF" />
            <Text style={styles.loadingText}>Loading items...</Text>
          </View>
        ) : (
          <FlatList
            data={displayItems}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ItemCard item={item} onPress={() => handleItemPress(item)} />
            )}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            contentContainerStyle={styles.horizontalList}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No items found. Check your Firestore collection or try another search.
              </Text>
            }
          />
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Suggested</Text>
          <Link href="/explore">
            <Text style={styles.seeAllText}>See all</Text>
          </Link>
        </View>

        <FlatList
          data={displayItems}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `suggested-${item.id}`}
          renderItem={({ item }) => (
            <ItemCard item={item} onPress={() => handleItemPress(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          contentContainerStyle={styles.horizontalList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No suggested items available right now.
            </Text>
          }
        />

        {selectedItem && (
          <ProductDetailModal
            visible={modalVisible}
            item={selectedItem}
            onClose={() => setModalVisible(false)}
          />
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingBottom: 24,
  },
  scrollView: {
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  searchWrapper: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    position: 'relative',
    overflow: 'visible',
    zIndex: 9999,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#E9E9E9',
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#242424',
    fontSize: 15,
    paddingVertical: 8,
  },
  searchPlaceholder: {
    flex: 1,
    color: '#888',
    fontSize: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  titleText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionHeaderSmall: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitleSmall: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  categoryList: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  categoryLink: {
    marginRight: 18,
  },
  categoryItem: {
    alignItems: 'center',
    flexDirection: 'column',
  },
  categoryCircle: {
    width: 62,
    height: 62,
    borderRadius: 32,
    backgroundColor: '#F5F7FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EEF9',
  },
  categoryText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  searchPopup: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 30,
    zIndex: 10000,
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  searchResultList: {
    paddingBottom: 6,
  },
  searchResultLink: {
    width: '100%',
  },
  searchResultItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchResultText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  searchResultCategory: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  noResultsText: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 20,
  },
  bannerCard: {
    backgroundColor: '#3F51F4',
    borderRadius: 22,
    padding: 22,
    marginHorizontal: 16,
    marginBottom: 22,
    overflow: 'hidden',
    minHeight: 140,
  },
  bannerContent: {
    flex: 1,
    maxWidth: '70%',
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  bannerDescription: {
    color: '#EBF0FF',
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.95,
  },
  bannerIconOuter: {
    position: 'absolute',
    right: 18,
    bottom: 18,
  },
  bannerIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F9E16F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  seeAllText: {
    color: '#5D5FEF',
    fontSize: 14,
    fontWeight: '700',
  },
  loaderContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#000000',
  },
  emptyText: {
    opacity: 0.6,
    paddingVertical: 18,
    color: '#6B7280',
  },
  horizontalList: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
});