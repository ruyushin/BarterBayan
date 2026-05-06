import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput, TextStyle, TouchableOpacity,
  View, ViewStyle
} from 'react-native';

const NAVY = "#2f2f6f";

const CATEGORIES = [
  { id: "1", label: "Technology", emoji: "📱" },
  { id: "2", label: "Fashion", emoji: "👗" },
  { id: "3", label: "Living", emoji: "🪔" },
  { id: "4", label: "Beauty", emoji: "💄" },
  { id: "5", label: "Sports", emoji: "⚽" },
];

export default function AddItemScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("1");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const pickImage = async () => {
    if (photos.length >= 2) {
      Alert.alert("Limit reached", "You can only add up to 2 photos.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setPhotos([...photos, result.assets[0].uri]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Item</Text>
        </View>

        {/* Add Photos */}
        <Text style={styles.sectionLabel}>Add Photos</Text>
        <View style={styles.photoRow}>

          {/* Show picked photos */}
          {photos.map((uri, index) => (
            <TouchableOpacity key={index} onPress={pickImage}>
              <Image source={{ uri }} style={styles.photoBox} />
            </TouchableOpacity>
          ))}

          {/* Show placeholder if less than 1 photo */}
          {photos.length === 0 && (
            <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
              <Text style={styles.photoIcon}>🖼️</Text>
            </TouchableOpacity>
          )}

          {/* Always show + button if less than 2 photos */}
          {photos.length < 2 && (
            <TouchableOpacity style={styles.addPhotoBox} onPress={pickImage}>
              <Text style={styles.plusIcon}>+</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* Category */}
        <Text style={styles.sectionLabel}>Add Item Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={styles.categoryItem}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <View style={[
                styles.categoryCircle,
                selectedCategory === cat.id && styles.categoryCircleActive
              ]}>
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              </View>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Description */}
        <Text style={styles.sectionLabel}>Description</Text>
        <TextInput
          style={styles.descriptionInput}
          multiline
          numberOfLines={5}
          placeholder="Describe your item..."
          value={description}
          onChangeText={setDescription}
        />

        {/* Submit */}
        <TouchableOpacity style={styles.submitButton} onPress={() => router.back()}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  } as ViewStyle,
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  } as ViewStyle,
  backButton: {
    marginRight: 12,
    marginHorizontal: 15,
  } as ViewStyle,
  backArrow: {
    fontSize: 22,
    fontWeight: "900",
    color: "#222",
  } as TextStyle,
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  } as TextStyle,
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    marginBottom: 10,
    marginTop: 8,
    marginHorizontal: 15,
  } as TextStyle,
  photoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    marginHorizontal: 15,
  } as ViewStyle,
  photoBox: {
    width: 120,
    height: 120,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  photoIcon: {
    fontSize: 32,
  } as TextStyle,
  addPhotoBox: {
    width: 120,
    height: 120,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  plusIcon: {
    fontSize: 36,
    color: "#aaa",
  } as TextStyle,
  categoryRow: {
    marginBottom: 20,
    marginHorizontal: 15,
  } as ViewStyle,
  categoryItem: {
    alignItems: "center",
    marginRight: 16,
  } as ViewStyle,
  categoryCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#f0f0f5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "transparent",
  } as ViewStyle,
  categoryCircleActive: {
    borderColor: NAVY,
  } as ViewStyle,
  categoryEmoji: {
    fontSize: 28,
  } as TextStyle,
  categoryLabel: {
    fontSize: 12,
    color: "#333",
  } as TextStyle,
  descriptionInput: {
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 14,
    height: 130,
    textAlignVertical: "top",
    fontSize: 14,
    marginBottom: 24,
    marginHorizontal: 15,
  } as TextStyle,
  submitButton: {
    backgroundColor: NAVY,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 30,
    alignSelf: "flex-end",
    marginHorizontal: 15,
    paddingHorizontal: 30,
  } as ViewStyle,
  submitText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  } as TextStyle,
});
