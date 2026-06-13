import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { auth } from "../firebaseConfig";
import { addItem } from "../services/itemService";

const NAVY = "#2f2f6f";
const MAX_FILE_SIZE = 10485760;
const MAX_FILE_SIZE_MB = 10;
const MAX_VIDEO_SIZE = 104857600;
const MAX_VIDEO_SIZE_MB = 100;
const DESCRIPTION_MAX = 160;

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

const WEIGHT_UNITS = ["g", "kg", "lbs"];

type MediaItem = {
  uri: string;
  type: "image" | "video";
  originalUri?: string;
  dedupKey?: string;
};

async function toSafeUri(uri: string): Promise<string> {
  if (Platform.OS !== "web") return uri;
  if (uri.startsWith("blob:")) {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return uri;
}

async function checkFileSizeValid(
  uri: string,
  isVideo: boolean,
): Promise<{ valid: boolean; sizeMB?: number; message?: string }> {
  const limit = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
  const limitMB = isVideo ? MAX_VIDEO_SIZE_MB : MAX_FILE_SIZE_MB;
  try {
    if (uri.startsWith("data:")) {
      const base64Str = uri.split(",")[1] || "";
      const bytes = atob(base64Str).length;
      if (bytes > limit) {
        const sizeMB = (bytes / (1024 * 1024)).toFixed(2);
        return {
          valid: false,
          sizeMB: parseFloat(sizeMB),
          message: `File size too large (${sizeMB}MB). Max is ${limitMB}MB.`,
        };
      }
      return { valid: true };
    }
    if (uri.startsWith("blob:")) {
      const res = await fetch(uri);
      const blob = await res.blob();
      if (blob.size > limit) {
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        return {
          valid: false,
          sizeMB: parseFloat(sizeMB),
          message: `File size too large (${sizeMB}MB). Max is ${limitMB}MB.`,
        };
      }
      return { valid: true };
    }
    return { valid: true };
  } catch {
    return { valid: true };
  }
}

function VideoPlayerWrapper({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.modalVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

export default function AddItemScreen() {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [selectedCategory, setSelectedCategory] = useState("1");
  const [selectedCondition, setSelectedCondition] = useState("1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isConditionOpen, setIsConditionOpen] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);

  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [isWeightUnitOpen, setIsWeightUnitOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [additionalDescription, setAdditionalDescription] = useState("");

  const originalUriSetRef = useRef<Set<string>>(new Set());

  const imageCount = media.filter((m) => m.type === "image").length;
  const videoCount = media.filter((m) => m.type === "video").length;
  const isAtLimit = media.length >= 10;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(20)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  const incrementQuantity = () => {
    const current = parseInt(quantity || "0", 10);
    setQuantity(String(current + 1));
  };

  const decrementQuantity = () => {
    const current = parseInt(quantity || "0", 10);
    if (current > 1) setQuantity(String(current - 1));
  };

  // ─── Media picker ─────────────────────────────────────────────────────
  const pickMedia = async () => {
    if (isAtLimit) {
      Alert.alert("Limit reached", "You can only add up to 10 files.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your media.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newMedia: MediaItem[] = [];
      let oversizedCount = 0;
      let duplicateCount = 0;

      for (const asset of result.assets) {
        if (media.length + newMedia.length >= 10) {
          Alert.alert("Limit reached", "You can only add up to 10 files.");
          break;
        }

        const rawUri = asset.uri;
        const isVideo = asset.type === "video";

        if (typeof rawUri !== "string") continue;

        // ── Dedup by filename+filesize so same file picked across sessions is caught ──
        const dedupKey =
          asset.fileName && asset.fileSize
            ? `${asset.fileName}-${asset.fileSize}`
            : rawUri;

        if (originalUriSetRef.current.has(dedupKey)) {
          duplicateCount++;
          continue;
        }

        const sizeCheck = await checkFileSizeValid(rawUri, isVideo);
        if (!sizeCheck.valid) {
          console.warn("File rejected:", sizeCheck.message);
          oversizedCount++;
          continue;
        }

        const safeUri = await toSafeUri(rawUri);

        originalUriSetRef.current.add(dedupKey);
        newMedia.push({
          uri: safeUri,
          type: isVideo ? "video" : "image",
          originalUri: rawUri,
          dedupKey,
        });
      }

      const warnings: string[] = [];
      if (oversizedCount > 0)
        warnings.push(
          `${oversizedCount} file(s) skipped — too large.\n• Images: max ${MAX_FILE_SIZE_MB}MB\n• Videos: max ${MAX_VIDEO_SIZE_MB}MB`,
        );
      if (duplicateCount > 0)
        warnings.push(`${duplicateCount} duplicate file(s) were not added.`);
      if (warnings.length > 0)
        Alert.alert("Some files skipped", warnings.join("\n\n"));

      if (newMedia.length > 0) {
        setMedia((prev) => [...prev, ...newMedia]);
      }
    }
  };

  // ─── Cloudinary upload ────────────────────────────────────────────────
  const uploadToCloudinary = async (item: MediaItem): Promise<string> => {
    try {
      if (!item.uri) throw new Error("Invalid media file");

      const formData = new FormData();
      const isVideo = item.type === "video";
      const resourceType = isVideo ? "video" : "image";
      let fileBlob: Blob | null = null;

      if (item.uri.startsWith("data:")) {
        const res = await fetch(item.uri);
        fileBlob = await res.blob();
        const ext = fileBlob.type.split("/")[1] || (isVideo ? "mp4" : "jpg");
        formData.append("file", fileBlob, `media.${ext}`);
      } else if (item.uri.startsWith("blob:")) {
        const res = await fetch(item.uri);
        if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
        fileBlob = await res.blob();
        const ext = fileBlob.type.split("/")[1] || (isVideo ? "mp4" : "jpg");
        formData.append("file", fileBlob, `media.${ext}`);
      } else if (
        item.uri.startsWith("http://") ||
        item.uri.startsWith("https://")
      ) {
        const res = await fetch(item.uri);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        fileBlob = await res.blob();
        const ext = fileBlob.type.split("/")[1] || (isVideo ? "mp4" : "jpg");
        formData.append("file", fileBlob, `media.${ext}`);
      } else {
        const filename =
          item.uri.split("/").pop() ||
          `media-${Date.now()}.${isVideo ? "mp4" : "jpg"}`;
        const ext =
          filename.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          mp4: "video/mp4",
          mov: "video/quicktime",
          avi: "video/x-msvideo",
        };
        formData.append("file", {
          uri: item.uri,
          type: mimeMap[ext] || (isVideo ? "video/mp4" : "image/jpeg"),
          name: filename,
        } as any);
      }

      formData.append("upload_preset", "barterbayan_items");
      formData.append("folder", "items");

      const endpoint = `https://api.cloudinary.com/v1_1/dh97c25iz/${resourceType}/upload`;
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const responseData = await response.json();

      if (!response.ok)
        throw new Error(responseData.error?.message || "Upload failed");
      return responseData.secure_url as string;
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      throw error;
    }
  };

  // ─── Success animation ────────────────────────────────────────────────
  const showSuccessAnimation = () => {
    setSuccessModalVisible(true);
    scaleAnim.setValue(0);
    opacityAnim.setValue(0);
    checkAnim.setValue(0);
    textSlide.setValue(20);
    textOpacity.setValue(0);
    sparkle1.setValue(0);
    sparkle2.setValue(0);
    sparkle3.setValue(0);

    Animated.sequence([
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
      router.replace("/(tabs)/trade" as any);
    }, 2400);
  };

  // ─── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Missing field", "Please enter an item title.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing field", "Please enter a description.");
      return;
    }
    if (media.length === 0) {
      Alert.alert("Missing field", "Please add at least one photo or video.");
      return;
    }
    if (!selectedCategory) {
      Alert.alert("Missing field", "Please select a category.");
      return;
    }
    if (!selectedCondition) {
      Alert.alert("Missing field", "Please select a condition.");
      return;
    }

    const parsedWeight = parseFloat(weightValue);
    if (!weightValue.trim() || isNaN(parsedWeight) || parsedWeight <= 0) {
      Alert.alert("Missing field", "Please enter a valid estimated weight.");
      return;
    }

    const parsedQty = parseInt(quantity, 10);
    if (!quantity.trim() || isNaN(parsedQty) || parsedQty < 1) {
      Alert.alert(
        "Missing field",
        "Please enter a valid quantity (at least 1).",
      );
      return;
    }

    setIsLoading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const item of media) {
        const url = await uploadToCloudinary(item);
        uploadedUrls.push(url);
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "You must be logged in to add items.");
        setIsLoading(false);
        return;
      }

      await addItem({
        title,
        description,
        category:
          CATEGORIES.find((c) => c.id === selectedCategory)?.label || "Other",
        condition:
          CONDITIONS.find((c) => c.id === selectedCondition)?.label || "New",
        images: uploadedUrls,
        ownerId: currentUser.uid,
        likes: 0,
        likedBy: [],
        estimatedWeight: `${parsedWeight} ${weightUnit}`,
        quantity: parsedQty,
        ...(additionalDescription.trim()
          ? { additionalDescription: additionalDescription.trim() }
          : {}),
      });

      showSuccessAnimation();
    } catch (error) {
      console.error("Error adding item:", error);
      Alert.alert("Error", "Failed to add item. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Remove media ─────────────────────────────────────────────────────
  const removeMedia = (index: number) => {
    const item = media[index];
    if (item?.dedupKey) originalUriSetRef.current.delete(item.dedupKey);
    if (item?.originalUri) originalUriSetRef.current.delete(item.originalUri);
    originalUriSetRef.current.delete(item.uri);
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const openPreview = (item: MediaItem) => {
    setSelectedMedia(item);
    setPreviewModalVisible(true);
  };

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

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="height"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.replace("/(tabs)/trade" as any)}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#222" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Item</Text>
          </View>

          {/* ── Media Section ── */}
          <Text style={styles.sectionLabel}>
            Photos & Videos <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.sectionSub}>
            Up to 10 files. Duplicates are automatically skipped.
          </Text>

          <View style={[styles.limitBar, isAtLimit && styles.limitBarFull]}>
            <View style={styles.limitBarLeft}>
              <Ionicons
                name={isAtLimit ? "warning" : "information-circle"}
                size={14}
                color={isAtLimit ? "#ff4444" : NAVY}
              />
              <Text
                style={[
                  styles.limitBarText,
                  isAtLimit && styles.limitBarTextFull,
                ]}
              >
                {isAtLimit
                  ? "Limit reached! Remove a file to add more."
                  : `${media.length}/10 files · ${imageCount} photo${imageCount !== 1 ? "s" : ""}, ${videoCount} video${videoCount !== 1 ? "s" : ""}`}
              </Text>
            </View>
            <View style={styles.limitProgressOuter}>
              <View
                style={[
                  styles.limitProgressInner,
                  {
                    width: `${(media.length / 10) * 100}%` as any,
                    backgroundColor: isAtLimit ? "#ff4444" : NAVY,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.sizeLimitsRow}>
            <View style={styles.sizeLimitBadge}>
              <Ionicons name="image-outline" size={12} color="#666" />
              <Text style={styles.sizeLimitText}>
                Images: max {MAX_FILE_SIZE_MB}MB
              </Text>
            </View>
            <View style={styles.sizeLimitBadge}>
              <Ionicons name="videocam-outline" size={12} color="#666" />
              <Text style={styles.sizeLimitText}>
                Videos: max {MAX_VIDEO_SIZE_MB}MB · 60s
              </Text>
            </View>
          </View>

          <View style={styles.photoRow}>
            {media.map((item, index) => (
              <View key={index} style={styles.photoWrapper}>
                <TouchableOpacity onPress={() => openPreview(item)}>
                  {item.type === "image" ? (
                    <Image source={{ uri: item.uri }} style={styles.photoBox} />
                  ) : (
                    <View style={styles.videoThumb}>
                      <View style={styles.videoThumbOverlay}>
                        <Ionicons name="play-circle" size={40} color="white" />
                        <Text style={styles.videoLabel}>Tap to preview</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                <View
                  style={[
                    styles.typeBadge,
                    item.type === "video" && styles.typeBadgeVideo,
                  ]}
                >
                  <Ionicons
                    name={item.type === "video" ? "videocam" : "image"}
                    size={10}
                    color="white"
                  />
                </View>
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => removeMedia(index)}
                >
                  <Ionicons name="close" size={16} color="white" />
                </TouchableOpacity>
              </View>
            ))}
            {!isAtLimit && (
              <TouchableOpacity style={styles.addPhotoBox} onPress={pickMedia}>
                <Ionicons name="add" size={32} color="#999" />
                <Text style={styles.addPhotoText}>Photo/Video</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Title ── */}
          <Text style={styles.sectionLabel}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Brief title for your item"
            placeholderTextColor="#aaa"
            value={title}
            onChangeText={setTitle}
          />

          {/* ── Category ── */}
          <Text style={styles.sectionLabel}>
            Category <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => {
              setIsCategoryOpen(!isCategoryOpen);
              setIsConditionOpen(false);
              setIsWeightUnitOpen(false);
            }}
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
                      selectedCategory === cat.id &&
                        styles.dropdownItemSelected,
                    ]}
                  >
                    {cat.label}
                  </Text>
                  {selectedCategory === cat.id && (
                    <Ionicons name="checkmark" size={16} color={NAVY} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Condition ── */}
          <Text style={styles.sectionLabel}>
            Condition <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => {
              setIsConditionOpen(!isConditionOpen);
              setIsCategoryOpen(false);
              setIsWeightUnitOpen(false);
            }}
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
                  {selectedCondition === cond.id && (
                    <Ionicons name="checkmark" size={16} color={NAVY} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Estimated Weight ── */}
          <Text style={styles.sectionLabel}>
            Estimated Weight <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.weightRow}>
            <TextInput
              style={styles.weightInput}
              placeholder="e.g. 1.5"
              placeholderTextColor="#aaa"
              value={weightValue}
              onChangeText={(t) => {
                const cleaned = t
                  .replace(/[^0-9.]/g, "")
                  .replace(/(\..*)\./g, "$1");
                setWeightValue(cleaned);
              }}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.unitButton}
              onPress={() => {
                setIsWeightUnitOpen(!isWeightUnitOpen);
                setIsCategoryOpen(false);
                setIsConditionOpen(false);
              }}
            >
              <Text style={styles.unitButtonText}>{weightUnit}</Text>
              <Ionicons
                name={isWeightUnitOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={NAVY}
              />
            </TouchableOpacity>
          </View>
          {isWeightUnitOpen && (
            <View style={[styles.dropdownMenu, { marginTop: -4 }]}>
              {WEIGHT_UNITS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setWeightUnit(unit);
                    setIsWeightUnitOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      weightUnit === unit && styles.dropdownItemSelected,
                    ]}
                  >
                    {unit}
                  </Text>
                  {weightUnit === unit && (
                    <Ionicons name="checkmark" size={16} color={NAVY} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Quantity ── */}
          <Text style={styles.sectionLabel}>
            Quantity <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={[
                styles.qtyButton,
                parseInt(quantity || "0", 10) <= 1 && styles.qtyButtonDisabled,
              ]}
              onPress={decrementQuantity}
              disabled={parseInt(quantity || "0", 10) <= 1}
            >
              <Ionicons
                name="remove"
                size={20}
                color={parseInt(quantity || "0", 10) <= 1 ? "#ccc" : NAVY}
              />
            </TouchableOpacity>
            <TextInput
              style={styles.quantityInput}
              value={quantity}
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9]/g, "");
                setQuantity(cleaned);
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#aaa"
            />
            <TouchableOpacity
              style={styles.qtyButton}
              onPress={incrementQuantity}
            >
              <Ionicons name="add" size={20} color={NAVY} />
            </TouchableOpacity>
          </View>

          {/* ── Description ── */}
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>
              Description <Text style={styles.required}>*</Text>
            </Text>
            <Text
              style={[
                styles.charCount,
                description.length >= DESCRIPTION_MAX && styles.charCountLimit,
              ]}
            >
              {description.length}/{DESCRIPTION_MAX}
            </Text>
          </View>
          <TextInput
            style={styles.descriptionInput}
            multiline
            numberOfLines={4}
            placeholder="Describe your item in detail…"
            placeholderTextColor="#aaa"
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESCRIPTION_MAX))}
            maxLength={DESCRIPTION_MAX}
          />

          {/* ── Additional Description ── */}
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>Additional Description</Text>
            <Text style={styles.optionalBadge}>Optional</Text>
          </View>
          <TextInput
            style={styles.descriptionInput}
            multiline
            numberOfLines={4}
            placeholder="Any extra details, dimensions, defects, included accessories…"
            placeholderTextColor="#aaa"
            value={additionalDescription}
            onChangeText={setAdditionalDescription}
          />

          {/* ── Submit ── */}
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
      </KeyboardAvoidingView>

      {/* ── Preview Modal ── */}
      <Modal
        visible={previewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderText}>
              {selectedMedia?.type === "video"
                ? "Video Preview"
                : "Image Preview"}
            </Text>
            <TouchableOpacity
              onPress={() => setPreviewModalVisible(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            {selectedMedia?.type === "image" ? (
              <Image
                source={{ uri: selectedMedia.uri }}
                style={{ width: screenWidth, height: screenHeight * 0.75 }}
                resizeMode="contain"
              />
            ) : selectedMedia?.type === "video" ? (
              <VideoPlayerWrapper uri={selectedMedia.uri} />
            ) : null}
          </View>
          {selectedMedia?.type === "video" && (
            <View style={styles.modalFooter}>
              <Ionicons name="volume-medium" size={14} color="#aaa" />
              <Text style={styles.modalFooterText}>
                Use controls to play/pause
              </Text>
            </View>
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
            <View style={styles.sparkleContainer}>
              <Animated.Text
                style={[styles.sparkle, sparkleStyle(sparkle1, -38, -30)]}
              >
                {"✦"}
              </Animated.Text>
              <Animated.Text
                style={[styles.sparkle, sparkleStyle(sparkle2, 40, -38)]}
              >
                {"★"}
              </Animated.Text>
              <Animated.Text
                style={[styles.sparkle, sparkleStyle(sparkle3, -10, -50)]}
              >
                {"✦"}
              </Animated.Text>
            </View>
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
            <Animated.View
              style={{
                opacity: textOpacity,
                transform: [{ translateY: textSlide }],
                alignItems: "center",
              }}
            >
              <Text style={styles.successTitle}>Uploaded!</Text>
              {/* ── replaced emoji with Ionicon ── */}
              <View style={styles.successSubRow}>
                <Text style={styles.successSub}>Your item is now live</Text>
                <Ionicons name="trophy" size={16} color="#f5c842" />
              </View>
            </Animated.View>
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
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 32 } as ViewStyle,
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  } as ViewStyle,
  backButton: { marginRight: 12 } as ViewStyle,
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111" } as TextStyle,

  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
    marginTop: 16,
    marginHorizontal: 16,
  } as TextStyle,
  sectionSub: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
    marginHorizontal: 16,
  } as TextStyle,
  required: { color: "#e63946", fontWeight: "700" } as TextStyle,

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  } as ViewStyle,
  charCount: { fontSize: 12, color: "#999" } as TextStyle,
  charCountLimit: { color: "#e63946", fontWeight: "600" } as TextStyle,
  optionalBadge: {
    fontSize: 11,
    color: "#888",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  } as TextStyle,

  limitBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0f0f8",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  } as ViewStyle,
  limitBarFull: {
    backgroundColor: "#fff0f0",
    borderWidth: 1,
    borderColor: "#ffcccc",
  } as ViewStyle,
  limitBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  } as ViewStyle,
  limitBarText: {
    fontSize: 12,
    color: NAVY,
    fontWeight: "500",
    flex: 1,
  } as TextStyle,
  limitBarTextFull: { color: "#ff4444" } as TextStyle,
  limitProgressOuter: {
    width: 60,
    height: 6,
    backgroundColor: "#ddd",
    borderRadius: 3,
    overflow: "hidden",
  } as ViewStyle,
  limitProgressInner: { height: "100%", borderRadius: 3 } as ViewStyle,

  sizeLimitsRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  } as ViewStyle,
  sizeLimitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  } as ViewStyle,
  sizeLimitText: { fontSize: 11, color: "#666" } as TextStyle,

  photoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
    marginHorizontal: 16,
    flexWrap: "wrap",
  } as ViewStyle,
  photoWrapper: { position: "relative" } as ViewStyle,
  photoBox: {
    width: 100,
    height: 100,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
  } as any,
  videoThumb: {
    width: 100,
    height: 100,
    backgroundColor: "#111",
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  videoThumbOverlay: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  } as ViewStyle,
  videoLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
    fontWeight: "500",
  } as TextStyle,
  typeBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: NAVY,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  } as ViewStyle,
  typeBadgeVideo: { backgroundColor: "#8b0000" } as ViewStyle,
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
  addPhotoText: { fontSize: 10, color: "#999", marginTop: 4 } as TextStyle,

  input: {
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#111",
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
  dropdownText: { fontSize: 14, color: "#333", flex: 1 } as TextStyle,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  } as ViewStyle,
  dropdownItemText: { fontSize: 14, color: "#333" } as TextStyle,
  dropdownItemSelected: { color: NAVY, fontWeight: "600" } as TextStyle,

  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  } as ViewStyle,
  weightInput: {
    flex: 1,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#111",
  } as TextStyle,
  unitButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    minWidth: 72,
  } as ViewStyle,
  unitButtonText: { fontSize: 14, fontWeight: "600", color: NAVY } as TextStyle,

  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
  } as ViewStyle,
  qtyButton: {
    width: 46,
    height: 46,
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  } as ViewStyle,
  qtyButtonDisabled: { opacity: 0.4 } as ViewStyle,
  quantityInput: {
    flex: 1,
    backgroundColor: "#f0f0f5",
    marginHorizontal: 6,
    height: 46,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    textAlign: "center",
    paddingHorizontal: 0,
  } as TextStyle,

  descriptionInput: {
    backgroundColor: "#f0f0f5",
    borderRadius: 12,
    padding: 12,
    height: 110,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#111",
    marginBottom: 8,
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
    marginTop: 16,
    marginHorizontal: 16,
  } as ViewStyle,
  submitButtonDisabled: { opacity: 0.6 } as ViewStyle,
  submitText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  } as TextStyle,

  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "space-between",
  } as ViewStyle,
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  } as ViewStyle,
  modalHeaderText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  } as TextStyle,
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  modalContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#000",
    paddingVertical: 8,
  } as ViewStyle,
  modalVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  } as any,
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#222",
  } as ViewStyle,
  modalFooterText: { color: "#aaa", fontSize: 12 } as TextStyle,

  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,30,0.75)",
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
  successSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  } as ViewStyle,
  successSub: { fontSize: 14, color: "#888" } as TextStyle,
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