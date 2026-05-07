import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    Animated,
    FlatList,
    Image,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { auth } from "../../firebaseConfig";
import { getAllItems } from "../../services/itemService";

const DATA: any[] = [];

const OFFERS_DATA: any[] = [];

const FILTER_CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Living",
  "School/Office",
  "Household",
];

const NAVY = "#2e2d7c";

export default function TradeScreen() {
  const [activeTab, setActiveTab] = useState("trades");
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState("none");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userItems, setUserItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchUserItems();
  }, []);

  const fetchUserItems = async () => {
    try {
      setLoading(true);
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) return;

      const allItems = await getAllItems();
      const userOwnedItems = allItems.filter((item: any) => item.ownerId === currentUserId);
      setUserItems(userOwnedItems);
    } catch (error) {
      console.error("Error fetching user items:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = () => {
    setSortType((prev) =>
      prev === "none" ? "likes" : prev === "likes" ? "name" : "none"
    );
  };

  const handleFilterToggle = () => {
    setIsFilterOpen((prev) => !prev);
  };

  const handleCategorySelect = (category: string) => {
    setFilterCategory(category);
    setIsFilterOpen(false);
  };

  const switchTab = (tab: string) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
    setActiveTab(tab);
  };

  const handleAddItemPress = () => {
    Animated.sequence([
      Animated.timing(addButtonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(addButtonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.push("/add-item");
    });
  };
  const filteredItems = userItems
    .filter((item) => {
      const matchSearch = search.length === 0 || (
        (item.title && item.title.toLowerCase().includes(search.toLowerCase())) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
      );

      const matchFilter =
        filterCategory === "All" || (item.category === filterCategory);

      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortType === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sortType === "name") return (a.title || "").localeCompare(b.title || "");
      return 0;
    });
  const renderTradeItem = ({ item }: any) => {
    const imageUrl = Array.isArray(item?.images) && item.images.length > 0 
      ? item.images[0] 
      : item?.image || "https://via.placeholder.com/200";
    return (
      <View style={styles.card}>
        <Image source={{ uri: imageUrl }} style={styles.image} />
        <Text style={styles.itemName}>{item.title || item.name}</Text>
        <TouchableOpacity style={styles.offerButton}>
          <Text style={styles.offerText}>See Offers</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderOfferItem = ({ item }: any) => {
    const imageUrl = Array.isArray(item?.images) && item.images.length > 0 
      ? item.images[0] 
      : item?.image || "https://via.placeholder.com/200";
    return (
      <View style={styles.card}>
        <Image source={{ uri: imageUrl }} style={styles.image} />
        <Text style={styles.itemName}>{item.title || item.name}</Text>
        <TouchableOpacity style={styles.statusButton}>
          <Text style={styles.offerText}>Status</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Bar at Top */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#5B5B7B" style={styles.searchIcon} />
        <TextInput
          placeholder="Search for items..."
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={activeTab === "trades" ? styles.activeTab : styles.inactiveTab}
          onPress={() => switchTab("trades")}
        >
          <Text style={activeTab === "trades" ? styles.activeText : styles.inactiveText}>
            Your Trades
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={activeTab === "offers" ? styles.activeTab : styles.inactiveTab}
          onPress={() => switchTab("offers")}
        >
          <Text style={activeTab === "offers" ? styles.activeText : styles.inactiveText}>
            Your Offers
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sort + Filter */}
      <View style={styles.row}>
        <TouchableOpacity style={styles.smallButton} onPress={handleSort}>
          <Ionicons name="swap-vertical" size={14} color="#333" />
          <Text style={styles.smallText}>Sort ({sortType})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallButton} onPress={handleFilterToggle}>
          <Ionicons name="funnel" size={14} color="#333" />
          <Text style={styles.smallText}>Filter ({filterCategory})</Text>
        </TouchableOpacity>
      </View>

      {isFilterOpen && (
        <View style={styles.filterDropdown}>
          {FILTER_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              onPress={() => handleCategorySelect(category)}
              style={styles.dropdownItem}
            >
              <Text
                style={[
                  styles.dropdownText,
                  filterCategory === category && styles.dropdownTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Item List */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={activeTab === "trades" ? filteredItems : filteredItems}
          renderItem={activeTab === "trades" ? renderTradeItem : renderOfferItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            !loading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
                <Text style={{ color: '#999', fontSize: 16 }}>
                  {activeTab === "trades" ? "No items added yet" : "No offers yet"}
                </Text>
              </View>
            ) : null
          }
        />
      </Animated.View>

      {/* Add Item */}
      <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddItemPress}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addText}>Add Item</Text>
        </TouchableOpacity>
      </Animated.View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#efeff4",
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
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 16,
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
  tabs: {
    flexDirection: "row",
    marginBottom: 12,
    marginHorizontal: 16,
  },
  activeTab: {
    backgroundColor: NAVY,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginRight: 8
  },
  inactiveTab: {
    backgroundColor: "#bfbfbf",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginRight: 8
  },
  activeText: {
    color: "white",
    fontWeight: "600"
  },
  inactiveText: {
    color: "#555"
  },
  row: {
    flexDirection: "row",
    marginBottom: 12,
    marginHorizontal: 16,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d0d0d0",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 8
  },
  smallText: {
    fontSize: 13,
    color: "#444",
    marginLeft: 6,
  },
  filterDropdown: {
    marginHorizontal: 16,
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    overflow: "hidden",
    marginBottom: 10,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  dropdownText: {
    fontSize: 13,
    color: "#333",
  },
  dropdownTextActive: {
    fontWeight: "700",
    color: "#5E3EA1",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6e6ea",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  image: {
    width: 55,
    height: 55,
    borderRadius: 8,
    marginRight: 10
  },
  itemName: {
    flex: 1,
    fontWeight: "600",
    color: "#222"
  },
  offerButton: {
    backgroundColor: "#bfbfbf",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7
  },
  statusButton: {
    backgroundColor: "#bfbfbf",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7
  },
  offerText: {
    fontSize: 12,
    color: "#333"
  },
  addButton: {
    position: "absolute",
    bottom: 20,
    right: 16,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10
  },
  addText: {
    color: "white",
    fontWeight: "700",
    marginLeft: 6,
  }
});