import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ImageStyle,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { auth } from "../firebaseConfig";
import { addItem } from "../services/itemService";

const NAVY = "#2f2f6f";

const CATEGORIES = [
  { id: "1", label: "Electronics" },
  { id: "2", label: "Fashion" },
  { id: "3", label: "Living" },
  { id: "4", label: "School/Office" },
  { id: "5", label: "Household" },
];

const CONDITIONS = [
  { id: "1", label: "New" },
  { id: "2", label: "Used - Like New" },
  { id: "3", label: "Used - Good" },
  { id: "4", label: "Used - Fair" },
];

export default function AddItemScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("1");
  const [selectedCondition, setSelectedCondition] = useState("1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isConditionOpen, setIsConditionOpen] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);

  // Animation refs
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(20)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  const pickImage = async () => {
    if (photos.length >= 10) {
      Alert.alert("Limit reached", "You can only add up to 10 photos.");
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
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      if (typeof uri === "string") {
        setPhotos((prev) => [...prev, uri]);
      }
    }
  };

  // ── Upload a single image URI to Cloudinary ──
  const uploadImageToCloudinary = async (imageUri: string): Promise<string> => {
    try {
      if (typeof imageUri !== "string" || !imageUri) {
        throw new Error("Invalid image URI");
      }

      const formData = new FormData();

      if (
        imageUri.startsWith("blob:") ||
        imageUri.startsWith("data:") ||
        imageUri.startsWith("http://") ||
        imageUri.startsWith("https://")
      ) {
        // Web platform — fetch the URI and convert to a real Blob
        const fetchResponse = await fetch(imageUri);
        if (!fetchResponse.ok) {
          throw new Error(`Failed to fetch image: ${fetchResponse.status}`);
        }
        const blob = await fetchResponse.blob();
        formData.append("file", blob, "photo.jpg");
      } else if (
        imageUri.startsWith("file://") ||
        imageUri.startsWith("/")
      ) {
        // Native platform (iOS / Android) — pass as a file URI object
        const filename =
          imageUri.split("/").pop() || `image-${Date.now()}.jpg`;
        formData.append("file", {
          uri: imageUri,
          type: "image/jpeg",
          name: filename,
        } as any);
      } else {
        // Fallback: try fetching as blob
        const fetchResponse = await fetch(imageUri);
        const blob = await fetchResponse.blob();
        formData.append("file", blob, "photo.jpg");
      }

      formData.append("upload_preset", "barterbayan_items");

      const response = await fetch(
        "https://api.cloudinary.com/v1_1/dh97c25iz/image/upload",
        { method: "POST", body: formData }
      );

      const responseData = await response.json();

      if (!response.ok) {
        console.error(
          "Cloudinary error response:",
          JSON.stringify(responseData, null, 2)
        );
        throw new Error(responseData.error?.message || "Upload failed");
      }

      return responseData.secure_url as string;
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      throw error;
    }
  };

  const showSuccessAnimation = () => {
    setSuccessModalVisible(true);

    // Reset all values
    scaleAnim.setValue(0);
    opacityAnim.setValue(0);
    checkAnim.setValue(0);
    textSlide.setValue(20);
    textOpacity.setValue(0);
    sparkle1.setValue(0);
    sparkle2.setValue(0);
    sparkle3.setValue(0);

    Animated.sequence([
      // Pop in the card
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
      // Animate checkmark + text + sparkles together
      Animated.parallel([
        Animated.spring(checkAnim, {
          toValue: 1,
          friction: 4,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(textSlide, {
          toValue: 0,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.stagger(80, [
          Animated.spring(sparkle1, {
            toValue: 1,
            friction: 4,
            tension: 50,
            useNativeDriver: true,
          }),
          Animated.spring(sparkle2, {
            toValue: 1,
            friction: 4,
            tension: 50,
            useNativeDriver: true,
          }),
          Animated.spring(sparkle3, {
            toValue: 1,
            friction: 4,
            tension: 50,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    setTimeout(() => {
      setSuccessModalVisible(false);
      router.replace("/(tabs)" as any);
    }, 2400);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter item title");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Error", "Please enter description");
      return;
    }
    if (photos.length === 0) {
      Alert.alert("Error", "Please add at least one photo");
      return;
    }

    setIsLoading(true);
    try {
      // Upload all images to Cloudinary
      const uploadedImages: string[] = [];
      for (const photo of photos) {
        const cloudinaryUrl = await uploadImageToCloudinary(photo);
        uploadedImages.push(cloudinaryUrl);
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "You must be logged in to add items");
        setIsLoading(false);
        return;
      }

      const newItem = {
        title,
        description,
        category:
          CATEGORIES.find((c) => c.id === selectedCategory)?.label || "Other",
        condition:
          CONDITIONS.find((c) => c.id === selectedCondition)?.label || "New",
        images: uploadedImages,
        ownerId: currentUser.uid,
        likes: 0,
        likedBy: [],
      };

      await addItem(newItem);
      showSuccessAnimation();
    } catch (error) {
      console.error("Error adding item:", error);
      Alert.alert("Error", "Failed to add item. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const openPhotoModal = (photoUri: string) => {
    setSelectedPhoto(photoUri);
    setPhotoModalVisible(true);
  };

  // Sparkle interpolations
  const sparkleStyle = (anim: Animated.Value, tx: number, ty: number) => ({
    opacity: anim,
    transform: [
      {
        translateX: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, tx],
        }),
      },
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, ty],
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 1.4, 1],
        }),
      },
    ],
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)" as any)}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#222" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Item</Text>
        </View>

        {/* Add Photos */}
        <Text style={styles.sectionLabel}>Add Photos (Max 10)</Text>
        <View style={styles.photoRow}>
          {photos.map((uri, index) => (
            <View key={index} style={styles.photoWrapper}>
              <TouchableOpacity onPress={() => openPhotoModal(uri)}>
                <Image source={{ uri }} style={styles.photoBox} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removePhotoBtn}
                onPress={() => removePhoto(index)}
              >
                <Ionicons name="close" size={16} color="white" />
              </TouchableOpacity>
            </View>
          ))}

          {photos.length < 10 && (
            <TouchableOpacity style={styles.addPhotoBox} onPress={pickImage}>
              <Ionicons name="add" size={32} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {/* Title */}
        <Text style={styles.sectionLabel}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Brief title for your item"
          value={title}
          onChangeText={setTitle}
        />

        {/* Category Dropdown */}
        <Text style={styles.sectionLabel}>Category</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setIsCategoryOpen(!isCategoryOpen)}
        >
          <Text style={styles.dropdownText}>
            {CATEGORIES.find((c) => c.id === selectedCategory)?.label ||
              "Select Category"}
          </Text>
          <Ionicons
            name={isCategoryOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={NAVY}
          />
        </TouchableOpacity>
        {isCategoryOpen && (
          <View style={styles.dropdownMenu}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedCategory(cat.id);
                  setIsCategoryOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selectedCategory === cat.id && styles.dropdownItemSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Condition Dropdown */}
        <Text style={styles.sectionLabel}>Condition</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setIsConditionOpen(!isConditionOpen)}
        >
          <Text style={styles.dropdownText}>
            {CONDITIONS.find((c) => c.id === selectedCondition)?.label ||
              "Select Condition"}
          </Text>
          <Ionicons
            name={isConditionOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={NAVY}
          />
        </TouchableOpacity>
        {isConditionOpen && (
          <View style={styles.dropdownMenu}>
            {CONDITIONS.map((cond) => (
              <TouchableOpacity
                key={cond.id}
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedCondition(cond.id);
                  setIsConditionOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selectedCondition === cond.id &&
                      styles.dropdownItemSelected,
                  ]}
                >
                  {cond.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Description */}
        <Text style={styles.sectionLabel}>Description</Text>
        <TextInput
          style={styles.descriptionInput}
          multiline
          numberOfLines={5}
          placeholder="Describe your item in detail..."
          value={description}
          onChangeText={setDescription}
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            isLoading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={18} color="white" />
              <Text style={styles.submitText}>Submit</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Photo Preview Modal */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setPhotoModalVisible(false)}
          >
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image source={{ uri: selectedPhoto }} style={styles.modalImage} />
          )}
        </View>
      </Modal>

      {/* ── Success Modal ── */}
      <Modal visible={successModalVisible} transparent animationType="none">
        <View style={styles.successOverlay}>
          <Animated.View
            style={[
              styles.successCard,
              { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
            ]}
          >
            {/* Sparkles */}
            <View style={styles.sparkleContainer}>
              <Animated.Text
                style={[styles.sparkle, sparkleStyle(sparkle1, -38, -30)]}
              >
                ✦
              </Animated.Text>
              <Animated.Text
                style={[styles.sparkle, sparkleStyle(sparkle2, 40, -38)]}
              >
                ★
              </Animated.Text>
              <Animated.Text
                style={[styles.sparkle, sparkleStyle(sparkle3, -10, -50)]}
              >
                ✦
              </Animated.Text>
            </View>

            {/* Checkmark circle */}
            <Animated.View
              style={[
                styles.checkCircle,
                {
                  transform: [
                    {
                      scale: checkAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.4, 1],
                      }),
                    },
                  ],
                  opacity: checkAnim,
                },
              ]}
            >
              <Ionicons name="checkmark" size={52} color="#fff" />
            </Animated.View>

            {/* Text */}
            <Animated.View
              style={{
                opacity: textOpacity,
                transform: [{ translateY: textSlide }],
                alignItems: "center",
              }}
            >
              <Text style={styles.successTitle}>Uploaded!</Text>
              <Text style={styles.successSub}>
                Your item is now live 🎉
              </Text>
            </Animated.View>

            {/* Bottom pill */}
            <Animated.View
              style={[styles.successPill, { opacity: textOpacity }]}
            >
              <Ionicons name="arrow-forward" size={13} color={NAVY} />
              <Text style={styles.successPillText}>Taking you back…</Text>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  } as ViewStyle,
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  } as ViewStyle,
  backButton: {
    marginRight: 12,
  } as ViewStyle,
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  } as TextStyle,
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    marginBottom: 8,
    marginTop: 16,
    marginHorizontal: 16,
  } as TextStyle,
  photoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    marginHorizontal: 16,
    flexWrap: "wrap",
  } as ViewStyle,
  photoWrapper: {
    position: "relative",
  } as ViewStyle,
  photoBox: {
    width: 100,
    height: 100,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
  } as ImageStyle,
  removePhotoBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#ff4444",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  addPhotoBox: {
    width: 100,
    height: 100,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ddd",
    borderStyle: "dashed",
  } as ViewStyle,
  input: {
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
    marginHorizontal: 16,
  } as TextStyle,
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 16,
  } as ViewStyle,
  dropdownText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  } as TextStyle,
  dropdownMenu: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  } as ViewStyle,
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f5",
  } as ViewStyle,
  dropdownItemText: {
    fontSize: 14,
    color: "#333",
  } as TextStyle,
  dropdownItemSelected: {
    color: NAVY,
    fontWeight: "600",
  } as TextStyle,
  descriptionInput: {
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 12,
    height: 130,
    textAlignVertical: "top",
    fontSize: 14,
    marginBottom: 24,
    marginHorizontal: 16,
  } as TextStyle,
  submitButton: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 30,
    marginHorizontal: 16,
  } as ViewStyle,
  submitButtonDisabled: {
    opacity: 0.6,
  } as ViewStyle,
  submitText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  } as TextStyle,
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 1,
  } as ViewStyle,
  modalImage: {
    width: "90%",
    height: "80%",
    resizeMode: "contain",
  } as ImageStyle,

  // ── Success modal ──
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 10, 30, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  successCard: {
    width: 300,
    backgroundColor: "#fff",
    borderRadius: 32,
    paddingTop: 48,
    paddingBottom: 28,
    paddingHorizontal: 32,
    alignItems: "center",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 20,
  } as ViewStyle,
  sparkleContainer: {
    position: "absolute",
    top: 56,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  } as ViewStyle,
  sparkle: {
    position: "absolute",
    fontSize: 22,
    color: "#f5c842",
  } as TextStyle,
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  } as ViewStyle,
  successTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.5,
    marginBottom: 6,
  } as TextStyle,
  successSub: {
    fontSize: 14,
    color: "#888",
    marginBottom: 24,
  } as TextStyle,
  successPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0f0f8",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  } as ViewStyle,
  successPillText: {
    fontSize: 12,
    color: NAVY,
    fontWeight: "600",
  } as TextStyle,
});
