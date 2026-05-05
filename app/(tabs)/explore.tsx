import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    FlatList,
    Image,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

/* ---------------- DATA ---------------- */

const FILTER_CATEGORIES = [
  "All",
  "Electronics",
  "Fashion",
  "Living",
  "School/Office",
  "Household",
];

const ITEMS = [
  {
    id: "1",
    user: "Trademaster_21",
    date: "11/26/2025",
    avatar: "https://i.pravatar.cc/150?img=3",
    image: "https://picsum.photos/400/200?1",
    title: "Wooden Chessboard Set",
    description: "Handcrafted chess set.",
    likes: 12,
    category: "Household",
  },
  {
    id: "2",
    user: "MarkySharky",
    date: "12/25/2025",
    avatar: "https://i.pravatar.cc/150?img=8",
    image: "https://picsum.photos/400/200?2",
    title: "HP Laptop",
    description: "Lightweight laptop.",
    likes: 20,
    category: "School/Office",
  },
  {
    id: "3",
    user: "HomeTrader",
    date: "01/10/2026",
    avatar: "https://i.pravatar.cc/150?img=12",
    image: "https://picsum.photos/400/200?3",
    title: "Flat Screen TV",
    description: "40 inch TV.",
    likes: 9,
    category: "Living",
  },
  {
    id: "4",
    user: "UrbanSeller",
    date: "01/18/2026",
    avatar: "https://i.pravatar.cc/150?img=15",
    image: "https://picsum.photos/400/200?4",
    title: "Running Shoes",
    description: "Nike shoes.",
    likes: 7,
    category: "Fashion",
  },
  {
    id: "5",
    user: "TraderX",
    date: "02/01/2026",
    avatar: "https://i.pravatar.cc/150?img=5",
    image: "https://picsum.photos/400/200?5",
    title: "Backpack",
    description: "Durable school bag.",
    likes: 15,
    category: "School/Office",
  },
  {
    id: "6",
    user: "GadgetGuy",
    date: "02/02/2026",
    avatar: "https://i.pravatar.cc/150?img=6",
    image: "https://picsum.photos/400/200?6",
    title: "Bluetooth Speaker",
    description: "Portable speaker.",
    likes: 25,
    category: "Electronics",
  },
];

/* ---------------- COMPONENT ---------------- */

export default function Screen() {
  const params = useLocalSearchParams<{ filter?: string; search?: string }>();
  const [search, setSearch] = useState("");
  const [sortType, setSortType] = useState("none");
  const [filter, setFilter] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    if (typeof params.filter === "string" && FILTER_CATEGORIES.includes(params.filter)) {
      setFilter(params.filter);
    } else {
      setFilter("All");
    }

    if (typeof params.search === "string") {
      setSearch(params.search);
    }
  }, [params.filter, params.search]);

  /* ---------- LOGIC ---------- */

  const filteredItems = ITEMS
    .filter((item) => {
      const matchSearch = item.title
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchFilter =
        filter === "All" || item.category === filter;

      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sortType === "likes") return b.likes - a.likes;
      if (sortType === "name") return a.title.localeCompare(b.title);
      return 0;
    });

  /* ---------- BUTTON ACTIONS ---------- */

  const handleSort = () => {
    setSortType((prev) =>
      prev === "none" ? "likes" : prev === "likes" ? "name" : "none"
    );
  };

  const handleFilterToggle = () => {
    setIsFilterOpen((prev) => !prev);
  };

  const handleCategorySelect = (category: string) => {
    setFilter(category);
    setIsFilterOpen(false);
  };

  /* ---------- UI ---------- */

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemCard item={item} />}
        ListHeaderComponent={
          <>
            {/* SEARCH */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#777" />
              <TextInput
                placeholder="Search for items..."
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
              />
              <Ionicons name="camera-outline" size={18} color="#777" />
            </View>

            {/* FILTER BUTTONS */}
            <View style={styles.filterRow}>
              <Pressable style={styles.filterBtn} onPress={handleSort}>
                <Text style={styles.filterText}>Sort ({sortType})</Text>
                <Ionicons name="swap-vertical" size={14} />
              </Pressable>

              <Pressable style={styles.filterBtn} onPress={handleFilterToggle}>
                <Text style={styles.filterText}>Filter ({filter})</Text>
                <Ionicons name={isFilterOpen ? "chevron-up" : "chevron-down"} size={14} />
              </Pressable>
            </View>
            {isFilterOpen && (
              <View style={styles.filterDropdown}>
                {FILTER_CATEGORIES.map((category) => (
                  <Pressable
                    key={category}
                    onPress={() => handleCategorySelect(category)}
                    style={styles.dropdownItem}
                  >
                    <Text
                      style={[
                        styles.dropdownText,
                        filter === category && styles.dropdownTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

/* ---------------- CARD ---------------- */

function ItemCard({ item }: any) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />

        <View style={{ flex: 1 }}>
          <Text style={styles.username}>{item.user}</Text>
          <Text style={styles.date}>{item.date}</Text>
        </View>

        <Ionicons name="ribbon" size={18} color="#FFC107" />
      </View>

      <Image source={{ uri: item.image }} style={styles.image} />

      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.desc}>{item.description}</Text>

      <Text style={styles.message}>Send Owner a Message.</Text>

      <View style={styles.footer}>
        <Ionicons name="heart-outline" size={16} />
        <Text style={{ marginHorizontal: 5 }}>{item.likes}</Text>
        <Ionicons name="chatbubble-outline" size={16} />
        <FontAwesome name="bookmark-o" size={16} />
      </View>
    </View>
  );
}


/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECECEC" },

  searchContainer: {
    backgroundColor: "#E0E0E0",
    margin: 15,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: { flex: 1, padding: 10 },

  filterRow: {
    flexDirection: "row",
    marginHorizontal: 15,
    marginBottom: 10,
  },

  filterBtn: {
    flexDirection: "row",
    backgroundColor: "#D9D9D9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 10,
    alignItems: "center",
  },

  filterText: { marginRight: 5, fontSize: 13 },

  filterDropdown: {
    marginHorizontal: 15,
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
    backgroundColor: "#F5F5F5",
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },

  username: { fontWeight: "600", fontSize: 13 },
  date: { fontSize: 11, color: "#777" },

  image: {
    width: "100%",
    height: 170,
    borderRadius: 8,
    marginVertical: 8,
  },

  title: { fontWeight: "bold", fontSize: 14 },
  desc: { fontSize: 12, color: "#555", marginTop: 3 },

  message: {
    fontSize: 12,
    marginTop: 6,
    textDecorationLine: "underline",
  },

  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
    gap: 8,
  },

  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "white",
    paddingVertical: 8,
  },

  navItem: { flex: 1, alignItems: "center" },
  navText: { fontSize: 10, color: "#777" },
});


