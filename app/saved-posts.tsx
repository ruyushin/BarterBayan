import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { auth } from "../firebaseConfig";
import { getSavedItems } from "../services/itemService";

interface SavedItem {
  id: string;
  title: string;
  description?: string;
  image?: string;
  images?: string[];
  category: string;
  ownerId: string;
  owner?: any;
  likes?: number;
}

const DARK_BLUE = "#2f2f6f";
const ACCENT_RED = "#C0392B";

export default function SavedPostsScreen() {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUserId(currentUser.uid);
      fetchSavedItems(currentUser.uid);
    });

    return () => unsubscribe();
  }, [router]);

  const fetchSavedItems = async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await getSavedItems(uid);
      setSavedItems(items);
    } catch (err) {
      console.error("Error fetching saved items:", err);
      setError("Failed to load saved items");
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = (itemId: string) => {
    router.push(`/item/${itemId}` as any);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/profile" as any);
    }
  };

  const handleRefresh = () => {
    if (userId) {
      fetchSavedItems(userId);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saved Listings</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={DARK_BLUE} />
          <Text style={styles.loadingText}>Loading saved items…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saved Listings</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Listings</Text>
        <View style={{ width: 28 }} />
      </View>

      {savedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔖</Text>
          <Text style={styles.emptyTitle}>No saved items yet</Text>
          <Text style={styles.emptyMessage}>
            Explore listings and save your favorites to view them here.
          </Text>
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => router.replace("/(tabs)/explore" as any)}
          >
            <Text style={styles.exploreText}>Browse Listings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={savedItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SavedItemCard item={item} onPress={handleItemPress} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={handleRefresh}
        />
      )}
    </SafeAreaView>
  );
}

interface SavedItemCardProps {
  item: SavedItem;
  onPress: (itemId: string) => void;
}

function SavedItemCard({ item, onPress }: SavedItemCardProps) {
  const displayImage =
    item.image ||
    (item.images && item.images[0]) ||
    "https://via.placeholder.com/200";

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={() => onPress(item.id)}
      android_ripple={{ color: "rgba(0,0,0,0.1)" }}
    >
      <Image source={{ uri: displayImage }} style={styles.cardImage} />

      <View style={styles.cardContent}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>

        {item.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>

          <View style={styles.statsRow}>
            <Ionicons name="heart" size={14} color={ACCENT_RED} />
            <Text style={styles.likesText}>{item.likes || 0}</Text>
          </View>
        </View>

        {item.owner && (
          <View style={styles.ownerRow}>
            {item.owner.avatarUrl ? (
              <Image
                source={{ uri: item.owner.avatarUrl }}
                style={styles.ownerAvatar}
              />
            ) : (
              <View style={styles.ownerAvatarPlaceholder}>
                <Text style={styles.ownerInitial}>
                  {(item.owner.username?.[0] || "?").toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>
                {item.owner.username || "Unknown"}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F5F9",
  },
  header: {
    backgroundColor: DARK_BLUE,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  exploreButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  exploreText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  listContent: {
    padding: 12,
  },
  cardContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardImage: {
    width: "100%",
    height: 160,
    backgroundColor: "#E5E7EB",
  },
  cardContent: {
    padding: 12,
  },
  titleRow: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  cardDescription: {
    fontSize: 13,
    color: "#666",
    marginBottom: 10,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  categoryBadge: {
    backgroundColor: "#F0F0F0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  likesText: {
    fontSize: 12,
    color: ACCENT_RED,
    fontWeight: "600",
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  ownerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  ownerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  ownerInitial: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  ownerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A2E",
  },
});
