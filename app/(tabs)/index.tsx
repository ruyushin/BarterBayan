import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={20} color="#999" />
          <TextInput
            placeholder="Search for items..."
            style={styles.searchInput}
          />
          <Ionicons name="camera-outline" size={22} color="#999" />
        </View>

        {/* Categories */}
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.categories}>
          <Category icon="phone-portrait" label="Technology" />
          <Category icon="shirt" label="Fashion" />
          <Category icon="home" label="Living" />
          <Category icon="sparkles" label="Beauty" />
        </View>

        {/* Trades Card */}
        <View style={styles.tradeCard}>
          <View>
            <Text style={styles.tradeTitle}>Your Trades</Text>
            <Text style={styles.tradeText}>
              No trades listed yet. Adding even one item increases your chances
              of finding the perfect deal.
            </Text>
          </View>
          <Image
            source={require("@/app/(tabs)/images/searching.jpg")}
            style={styles.tradeImage}
          />
        </View>

        {/* Trending */}
        <Section title="Trending" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Item
            image={require("@/app/(tabs)/images/android-cellphone.png")}
            name="Android Cellphone"
          />
          <Item
            image={require("@/app/(tabs)/images/diamond-necklace.png")}
            name="Diamond Necklace"
          />
          <Item
            image={require("@/app/(tabs)/images/roasted-chicken.png")}
            name="Chicken"
          />
        </ScrollView>

        {/* Suggested */}
        <Section title="Suggested" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Item
            image={require("@/app/(tabs)/images/android-cellphone.png")}
            name="Android Cellphone"
          />
          <Item
            image={require("@/app/(tabs)/images/diamond-necklace.png")}
            name="Diamond Necklace"
          />
          <Item
            image={require("@/app/(tabs)/images/roasted-chicken.png")}
            name="Chicken"
          />
        </ScrollView>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <NavIcon icon="home" label="Home" active />
        <NavIcon icon="search" label="Explore" />
        <NavIcon icon="swap-horizontal" label="Trade" />
        <NavIcon icon="mail" label="Inbox" />
        <NavIcon icon="person" label="Account" />
      </View>
    </View>
  );
}

/* COMPONENTS */

const Category = ({ icon, label }) => (
  <View style={styles.category}>
    <Ionicons name={icon} size={26} color="#4B4BAA" />
    <Text style={styles.categoryText}>{label}</Text>
  </View>
);

const Item = ({ image, name }) => (
  <View style={styles.itemCard}>
    <Image source={image} style={styles.itemImage} />
    <Text style={styles.itemText}>{name}</Text>
  </View>
);

const Section = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.seeAll}>See all</Text>
  </View>
);

const NavIcon = ({ icon, label, active }) => (
  <View style={styles.navItem}>
    <Ionicons name={icon} size={24} color={active ? "#4B4BAA" : "#999"} />
    <Text style={{ color: active ? "#4B4BAA" : "#999", fontSize: 12 }}>
      {label}
    </Text>
  </View>
);

/* STYLES */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F2",
    borderRadius: 12,
    padding: 10,
    margin: 15,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginHorizontal: 15,
    marginTop: 10,
  },
  categories: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 15,
  },
  category: {
    alignItems: "center",
  },
  categoryText: {
    marginTop: 5,
    fontSize: 12,
  },
  tradeCard: {
    flexDirection: "row",
    backgroundColor: "#4B4BAA",
    margin: 15,
    borderRadius: 15,
    padding: 15,
    alignItems: "center",
  },
  tradeTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  tradeText: {
    color: "#E0E0E0",
    marginTop: 5,
    width: 200,
  },
  tradeImage: {
    width: 80,
    height: 80,
    marginLeft: "auto",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 15,
    marginTop: 10,
  },
  seeAll: {
    color: "#4B4BAA",
  },
  itemCard: {
    width: 120,
    backgroundColor: "#fff",
    borderRadius: 12,
    margin: 10,
    padding: 10,
    elevation: 3,
  },
  itemImage: {
    width: "100%",
    height: 80,
    resizeMode: "contain",
  },
  itemText: {
    textAlign: "center",
    marginTop: 5,
    fontSize: 12,
  },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#eee",
  },
  navItem: {
    alignItems: "center",
  },
});
