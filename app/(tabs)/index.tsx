import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@/components/themed-view";
import { Ionicons } from "@expo/vector-icons";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { auth } from "../../firebaseConfig";

import ItemCard from "../../components/ItemCard";
import { ProductDetailModal } from "../../components/ProductDetailModal";
import { useItems } from "../../hooks/useItems";
import { getUserPostedItems } from "../../services/itemService";

const CATEGORIES = [
  { id: "1", name: "Electronics", icon: "phone-portrait" },
  { id: "2", name: "Fashion", icon: "shirt" },
  { id: "3", name: "Living", icon: "bulb" },
  { id: "4", name: "School/Office", icon: "school" },
  { id: "5", name: "Household", icon: "home" },
];

const MAGNIFIER_IMG = require("../../assets/images/magnifier.png");

const NAVY = "#2f2f6f";

export default function HomeScreen() {
  const { items, loading } = useItems("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [userPostedItems, setUserPostedItems] = useState<any[]>([]);
  const [loadingUserItems, setLoadingUserItems] = useState(true);
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      const fetchUserItems = async () => {
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const postedItems = await getUserPostedItems(currentUser.uid);
            setUserPostedItems(postedItems);
          }
        } catch (error) {
          console.error("Error fetching user items:", error);
        } finally {
          setLoadingUserItems(false);
        }
      };

      fetchUserItems();
    }, []),
  );

  const query = searchQuery.toLowerCase().trim();
  const filteredResults = query
    ? items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query),
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
      setSearchQuery("");
    }
  };

  const handleItemPress = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const handleItemLongPress = (item: any) => {
    if (item.ownerId) {
      router.push({
        pathname: "/user-profile",
        params: { userId: item.ownerId },
      });
    }
  };

  const hasItems = userPostedItems.length > 0;

  const bannerDescription = () => {
    if (userPostedItems.length === 0)
      return "No trades listed yet. Adding even one item increases your chances of finding the perfect deal.";
    if (userPostedItems.length === 1)
      return `Great start! You have ${userPostedItems.length} item listed. Keep adding more to boost your chances!`;
    if (userPostedItems.length < 5)
      return `Nice collection! You have ${userPostedItems.length} items listed. You're on your way to finding great deals!`;
    return `Awesome! You're a trading pro with ${userPostedItems.length} items! You're part of our top traders. Keep it up!`;
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <ThemedView style={styles.container}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            {/* Logo mark */}
            <View style={styles.logoMark}>
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
            </View>
            {/* Wordmark */}
            <Text style={styles.headerWordmark}>
              <Text style={styles.headerWordmarkBold}>Barter</Text>
              <Text style={styles.headerWordmarkLight}>Bayan</Text>
            </Text>
          </View>

          {/* Right actions */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.push("/inbox")}
              activeOpacity={0.75}
            >
              <Ionicons name="notifications-outline" size={22} color={NAVY} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Search ── */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search-outline"
              size={20}
              color="#5B5B7B"
              style={styles.searchIcon}
            />
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
                  : "No related posts found"}
              </Text>
              {searchResults.length > 0 ? (
                <FlatList
                  data={searchResults}
                  showsVerticalScrollIndicator={false}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.searchResultLink}
                      onPress={() => handleSearchResultPress(item.title)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.searchResultItem}>
                        <Text style={styles.searchResultText}>
                          {item.title}
                        </Text>
                        <Text style={styles.searchResultCategory}>
                          {item.category}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
                  contentContainerStyle={styles.searchResultList}
                />
              ) : (
                <Text style={styles.noResultsText}>
                  Try a different keyword or category.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Categories ── */}
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
            <Link
              href={`/explore?filter=${encodeURIComponent(item.name)}`}
              style={styles.categoryLink}
            >
              <View style={styles.categoryItem}>
                <View style={styles.categoryCircle}>
                  <Ionicons name={item.icon as any} size={22} color="#2f2f6f" />
                </View>
                <Text style={styles.categoryText}>{item.name}</Text>
              </View>
            </Link>
          )}
        />

        {/* ── Your Trades Banner ── */}
        <ThemedView
          style={[styles.bannerCard, hasItems && styles.bannerCardActive]}
        >
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>Your Trades</Text>
            <Text style={styles.bannerDescription}>{bannerDescription()}</Text>

            {hasItems && (
              <TouchableOpacity
                style={styles.bannerButton}
                onPress={() => router.push("/trade")}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={16} color="#3F51F4" />
                <Text style={styles.bannerButtonText}>View Trades</Text>
              </TouchableOpacity>
            )}

            {!hasItems && (
              <TouchableOpacity
                style={styles.bannerButton}
                onPress={() => router.push("/add-item")}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={16} color="#3F51F4" />
                <Text style={styles.bannerButtonText}>Add an Item</Text>
              </TouchableOpacity>
            )}
          </View>

          <Image
            source={MAGNIFIER_IMG}
            style={styles.bannerImage}
            resizeMode="contain"
          />
        </ThemedView>

        {/* ── Trending ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending</Text>
          <Link href="/explore?type=trending">
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
              <ItemCard
                item={item}
                onPress={() => handleItemPress(item)}
                onLongPress={() => handleItemLongPress(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            contentContainerStyle={styles.horizontalList}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No items found. Check your Firestore collection or try another
                search.
              </Text>
            }
          />
        )}

        {/* ── Suggested ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Suggested</Text>
          <Link href="/explore?type=personalized">
            <Text style={styles.seeAllText}>See all</Text>
          </Link>
        </View>

        <FlatList
          data={displayItems}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `suggested-${item.id}`}
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              onPress={() => handleItemPress(item)}
              onLongPress={() => handleItemLongPress(item)}
            />
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
    backgroundColor: "#FFFFFF",
    paddingBottom: 24,
  },
  scrollView: {
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 100,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  headerWordmark: {
    fontSize: 22,
    letterSpacing: -0.3,
  },
  headerWordmarkBold: {
    fontWeight: "800",
    color: NAVY,
  },
  headerWordmarkLight: {
    fontWeight: "400",
    color: "#5B5B9F",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Search ──────────────────────────────────────────────────────────────────
  searchWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    position: "relative",
    overflow: "visible",
    zIndex: 9999,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    paddingHorizontal: 14,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    color: "#242424",
    fontSize: 15,
    paddingVertical: 8,
  },
  searchPopup: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 30,
    zIndex: 10000,
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  searchResultList: { paddingBottom: 6 },
  searchResultLink: { width: "100%" },
  searchResultItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchResultText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  searchResultCategory: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  noResultsText: { color: "#6B7280", fontSize: 13, lineHeight: 20 },

  // ── Categories ───────────────────────────────────────────────────────────────
  sectionHeaderSmall: { marginHorizontal: 16, marginBottom: 8, marginTop: 16 },
  sectionTitleSmall: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  categoryList: { paddingHorizontal: 16, paddingVertical: 6 },
  categoryLink: { marginRight: 18 },
  categoryItem: { alignItems: "center", flexDirection: "column" },
  categoryCircle: {
    width: 62,
    height: 62,
    borderRadius: 32,
    backgroundColor: "#F5F7FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8EEF9",
  },
  categoryText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
  },

  // ── Banner Card ──────────────────────────────────────────────────────────────
  bannerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3f51f4",
    borderRadius: 22,
    marginHorizontal: 16,
    marginVertical: 22,
    overflow: "hidden",
    minHeight: 140,
    paddingLeft: 22,
    paddingVertical: 22,
  },
  bannerCardActive: {
    backgroundColor: "#2d3aa1",
    shadowColor: "#3f51f4",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 15,
  },
  bannerContent: {
    flex: 1,
    paddingRight: 12,
  },
  bannerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  bannerDescription: {
    color: "#EBF0FF",
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.95,
    marginBottom: 14,
  },
  bannerButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
  },
  bannerButtonText: {
    color: "#3F51F4",
    fontSize: 13,
    fontWeight: "700",
  },
  bannerImage: {
    width: 130,
    height: 160,
    marginBottom: -22,
    alignSelf: "flex-end",
  },

  // ── Section headers ──────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  seeAllText: { color: "#5D5FEF", fontSize: 14, fontWeight: "700" },

  // ── Lists ────────────────────────────────────────────────────────────────────
  loaderContainer: { paddingVertical: 24, alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 13, color: "#000000" },
  emptyText: { opacity: 0.6, paddingVertical: 18, color: "#6B7280" },
  horizontalList: { paddingHorizontal: 16, paddingBottom: 18 },
});
