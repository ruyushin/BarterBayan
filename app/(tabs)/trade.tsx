import { useRouter } from "expo-router";
import { useRef, useState } from "react";
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

const DATA = [
  { id: "1", name: "Ralph Lauren Polo", image: "https://i.imgur.com/8Km9tLL.png" },
  { id: "2", name: "Bench Perfume", image: "https://i.imgur.com/j0J7K9M.png" },
  { id: "3", name: "Thanos Gauntlet", image: "https://i.imgur.com/xZ9YF6G.png" },
  { id: "4", name: "Fila Bag", image: "https://i.imgur.com/2nCt3Sbl.png" },
  { id: "5", name: "Adidas Cap", image: "https://i.imgur.com/6oK4B8M.png" },
];

const OFFERS_DATA = [
  { id: "1", name: "Fila Bag", image: "https://i.imgur.com/2nCt3Sbl.png" },
  { id: "2", name: "Adidas Cap", image: "https://i.imgur.com/6oK4B8M.png" },
  { id: "3", name: "Freedom Graphic Tee", image: "https://via.placeholder.com/60" },
];

const NAVY = "#2e2d7c";

export default function TradeScreen() {
  const [activeTab, setActiveTab] = useState("trades");
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

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

  const renderTradeItem = ({ item }: any) => (
    <View style={styles.card}>
      <Image source={{ uri: item.image }} style={styles.image} />
      <Text style={styles.itemName}>{item.name}</Text>
      <TouchableOpacity style={styles.offerButton}>
        <Text style={styles.offerText}>See Offers</Text>
      </TouchableOpacity>
    </View>
  );

  const renderOfferItem = ({ item }: any) => (
    <View style={styles.card}>
      <Image source={{ uri: item.image }} style={styles.image} />
      <Text style={styles.itemName}>{item.name}</Text>
      <TouchableOpacity style={styles.statusButton}>
        <Text style={styles.offerText}>Status</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>

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

      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          placeholder="Search for items..."
          placeholderTextColor="#888"
          style={styles.searchInput}
        />
      </View>

      {/* Sort + Filter */}
      <View style={styles.row}>
        <TouchableOpacity style={styles.smallButton}>
          <Text style={styles.smallText}>Sort ⬍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallButton}>
          <Text style={styles.smallText}>Filter 🔽</Text>
        </TouchableOpacity>
      </View>

      {/* Item List */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={activeTab === "trades" ? DATA : OFFERS_DATA}
          renderItem={activeTab === "trades" ? renderTradeItem : renderOfferItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      </Animated.View>

      {/* Add Item */}
      <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddItemPress}>
          <Text style={styles.addText}>Add Item  +</Text>
        </TouchableOpacity>
      </Animated.View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#efeff4",
    padding: 14
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 12,
    marginHorizontal: 15,
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
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6e6ea",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    marginHorizontal: 15,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8
  },
  searchInput: {
    flex: 1
  },
  row: {
    flexDirection: "row",
    marginBottom: 10,
    marginHorizontal: 15,
  },
  smallButton: {
    backgroundColor: "#d0d0d0",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 8
  },
  smallText: {
    fontSize: 13,
    color: "#444"
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6e6ea",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 15,
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
    right: 20,
    backgroundColor: NAVY,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10
  },
  addText: {
    color: "white",
    fontWeight: "700"
  }
});