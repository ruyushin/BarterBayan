import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth } from "../firebaseConfig";
import { getUserPostedItems } from "../services/itemService";
import { getOffersForItem, proposeTrade } from "../services/tradeService";

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = "#2f2f6f";
const GOLD = "#C9A227";
const ACCENT_RED = "#C0392B";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TargetItem {
  id: string;
  title: string;
  images?: string[];
  image?: string;
  ownerId: string;
  category?: string;
}

interface OwnItem {
  id: string;
  title: string;
  images?: string[];
  image?: string;
  category?: string;
  description?: string;
}

interface ProposeTradeModalProps {
  visible: boolean;
  targetItem: TargetItem | null;
  onClose: () => void;
  onSuccess?: () => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function resolveImage(item: { images?: string[]; image?: string }): string {
  if (Array.isArray(item.images) && item.images.length > 0)
    return item.images[0];
  return item.image ?? "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export const ProposeTradeModal: React.FC<ProposeTradeModalProps> = ({
  visible,
  targetItem,
  onClose,
  onSuccess,
}) => {
  const [ownItems, setOwnItems] = useState<OwnItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [hasExistingOffer, setHasExistingOffer] = useState(false);
  const [checkingOffer, setCheckingOffer] = useState(false);

  // Fetch the current user's own posted items whenever modal opens
  useEffect(() => {
    if (!visible) return;
    setSelectedItemId(null);
    setMessage("");
    setSucceeded(false);
    setHasExistingOffer(false);

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Check if user already has a pending offer on this item
    if (targetItem?.id) {
      setCheckingOffer(true);
      getOffersForItem(targetItem.id)
        .then((offers) => {
          const alreadyProposed = offers.some(
            (o) => o.offererId === uid && o.status === "pending",
          );
          setHasExistingOffer(alreadyProposed);
        })
        .catch(() => {})
        .finally(() => setCheckingOffer(false));
    }

    setLoadingItems(true);
    getUserPostedItems(uid)
      .then((items) => setOwnItems(items as OwnItem[]))
      .catch(() => setOwnItems([]))
      .finally(() => setLoadingItems(false));
  }, [visible]);

  const handleSubmit = async () => {
    if (!selectedItemId) {
      Alert.alert(
        "No item selected",
        "Please choose one of your items to offer.",
      );
      return;
    }
    if (!targetItem) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert("Not logged in", "You must be logged in to propose a trade.");
      return;
    }

    // Guard: cannot trade for your own item
    if (currentUser.uid === targetItem.ownerId) {
      Alert.alert("Oops", "You cannot propose a trade for your own item.");
      return;
    }

    const offeredItem = ownItems.find((i) => i.id === selectedItemId);
    if (!offeredItem) return;

    setSubmitting(true);
    try {
      await proposeTrade(
        offeredItem,
        targetItem,
        {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
        },
        message,
      );

      // Show inline success screen, then auto-close after 2.5 s
      setSucceeded(true);
      setTimeout(() => {
        onClose();
        onSuccess?.();
      }, 2500);
    } catch (err: any) {
      Alert.alert(
        "Failed to propose trade",
        err?.message ?? "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedItem = ownItems.find((i) => i.id === selectedItemId) ?? null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.sheet}>
          {/* ── Handle ── */}
          <View style={styles.handle} />

          {/* ── SUCCESS SCREEN ── */}
          {succeeded ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark" size={48} color="#fff" />
              </View>
              <Text style={styles.successTitle}>Trade Proposal Sent! 🤝</Text>
              <Text style={styles.successBody}>
                Your offer has been sent to the owner of{" "}
                <Text style={styles.successItemName}>
                  {targetItem?.title ?? ""}
                </Text>
                . You'll be notified once they respond.
              </Text>
            </View>
          ) : checkingOffer ? (
            <View style={styles.checkingBox}>
              <ActivityIndicator size="small" color={NAVY} />
              <Text style={styles.checkingText}>Checking offers…</Text>
            </View>
          ) : hasExistingOffer ? (
            <View style={styles.existingOfferContainer}>
              <View style={styles.existingOfferIconCircle}>
                <Ionicons name="time-outline" size={36} color={NAVY} />
              </View>
              <Text style={styles.existingOfferTitle}>Offer Already Sent</Text>
              <Text style={styles.existingOfferBody}>
                You already have a pending trade proposal for{" "}
                <Text style={styles.existingOfferItemName}>
                  {targetItem?.title ?? ""}
                </Text>
                . Wait for the owner to respond before sending another.
              </Text>
              <TouchableOpacity
                style={styles.existingOfferCloseBtn}
                onPress={onClose}
              >
                <Text style={styles.existingOfferCloseBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Header ── */}
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Propose a Trade</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    For:{" "}
                    <Text style={styles.targetTitle}>
                      {targetItem?.title ?? ""}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  disabled={submitting}
                >
                  <Ionicons name="close" size={22} color="#555" />
                </TouchableOpacity>
              </View>

              {/* ── Trade visual: your item ⇄ their item ── */}
              <View style={styles.tradePreview}>
                {/* Your side */}
                <View style={styles.previewSide}>
                  <View
                    style={[
                      styles.previewImageBox,
                      !selectedItem && styles.previewImageBoxEmpty,
                    ]}
                  >
                    {selectedItem ? (
                      <Image
                        source={{ uri: resolveImage(selectedItem) }}
                        style={styles.previewImage}
                      />
                    ) : (
                      <Ionicons name="cube-outline" size={28} color="#CCCCCC" />
                    )}
                  </View>
                  <Text style={styles.previewLabel} numberOfLines={2}>
                    {selectedItem ? selectedItem.title : "Select below ↓"}
                  </Text>
                </View>

                {/* Arrow */}
                <View style={styles.previewArrow}>
                  <Ionicons name="swap-horizontal" size={26} color={NAVY} />
                </View>

                {/* Their side */}
                <View style={styles.previewSide}>
                  <View style={styles.previewImageBox}>
                    {targetItem ? (
                      <Image
                        source={{ uri: resolveImage(targetItem) }}
                        style={styles.previewImage}
                      />
                    ) : (
                      <View style={styles.previewImageBoxEmpty} />
                    )}
                  </View>
                  <Text style={styles.previewLabel} numberOfLines={2}>
                    {targetItem?.title ?? ""}
                  </Text>
                </View>
              </View>

              {/* ── Pick your item ── */}
              <Text style={styles.sectionLabel}>Choose your item to offer</Text>

              {loadingItems ? (
                <View style={styles.loaderBox}>
                  <ActivityIndicator size="small" color={NAVY} />
                  <Text style={styles.loaderText}>Loading your items…</Text>
                </View>
              ) : ownItems.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="cube-outline" size={36} color="#CCCCCC" />
                  <Text style={styles.emptyTitle}>No items listed</Text>
                  <Text style={styles.emptyText}>
                    Add items in the Trade tab first before you can propose a
                    trade.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={ownItems}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.itemList}
                  renderItem={({ item }) => {
                    const isSelected = selectedItemId === item.id;
                    const imgUri = resolveImage(item);
                    return (
                      <TouchableOpacity
                        style={[
                          styles.itemCard,
                          isSelected && styles.itemCardSelected,
                        ]}
                        onPress={() => setSelectedItemId(item.id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.itemImageBox}>
                          {imgUri ? (
                            <Image
                              source={{ uri: imgUri }}
                              style={styles.itemImage}
                            />
                          ) : (
                            <View style={styles.itemImagePlaceholder}>
                              <Ionicons
                                name="image-outline"
                                size={22}
                                color="#CCC"
                              />
                            </View>
                          )}
                          {isSelected && (
                            <View style={styles.itemSelectedOverlay}>
                              <Ionicons
                                name="checkmark-circle"
                                size={24}
                                color="#fff"
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.itemTitle,
                            isSelected && styles.itemTitleSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {item.title}
                        </Text>
                        {item.category ? (
                          <Text style={styles.itemCategory} numberOfLines={1}>
                            {item.category}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              {/* ── Optional message ── */}
              <Text style={styles.sectionLabel}>Add a message (optional)</Text>
              <TextInput
                style={styles.messageInput}
                placeholder="Hi! I'd love to trade my item for yours…"
                placeholderTextColor="#AAAAAA"
                multiline
                numberOfLines={3}
                maxLength={200}
                value={message}
                onChangeText={setMessage}
                textAlignVertical="top"
                editable={!submitting}
              />
              <Text style={styles.charCount}>{message.length}/200</Text>

              {/* ── Submit ── */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (!selectedItemId || submitting) && styles.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!selectedItemId || submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={18} color="#fff" />
                    <Text style={styles.submitText}>Send Trade Offer</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={submitting}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: "92%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 14,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 10,
  },
  title: { fontSize: 19, fontWeight: "800", color: "#1A1A2E" },
  subtitle: { fontSize: 13, color: "#888", marginTop: 2 },
  targetTitle: { fontWeight: "700", color: NAVY },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },

  // ── Trade Preview ──
  tradePreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F8FC",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  previewSide: { flex: 1, alignItems: "center", gap: 8 },
  previewImageBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: NAVY,
  },
  previewImageBoxEmpty: {
    borderColor: "#D0D0D0",
    borderStyle: "dashed",
  },
  previewImage: { width: "100%", height: "100%" },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    maxWidth: 90,
  },
  previewArrow: {
    paddingHorizontal: 10,
    backgroundColor: "#ECEDF8",
    borderRadius: 20,
    padding: 8,
  },

  // ── Section Labels ──
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Loader / Empty ──
  loaderBox: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
    marginBottom: 16,
  },
  loaderText: { fontSize: 13, color: "#888" },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 16,
    backgroundColor: "#F7F8FC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "#333" },
  emptyText: {
    fontSize: 12,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Item list ──
  itemList: { paddingBottom: 4, gap: 10, marginBottom: 18 },
  itemCard: {
    width: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
    padding: 6,
    alignItems: "center",
    gap: 5,
  },
  itemCardSelected: {
    borderColor: NAVY,
    backgroundColor: "#ECEDF8",
  },
  itemImageBox: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    position: "relative",
  },
  itemImage: { width: "100%", height: "100%" },
  itemImagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F0F0",
  },
  itemSelectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(47,47,111,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  itemTitleSelected: { color: NAVY },
  itemCategory: {
    fontSize: 10,
    color: "#AAAAAA",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // ── Message ──
  messageInput: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#1A1A2E",
    minHeight: 72,
    backgroundColor: "#FAFAFA",
    marginBottom: 4,
    placeholderTextColor: "#AAAAAA",
  },
  charCount: {
    fontSize: 11,
    color: "#BBBBBB",
    textAlign: "right",
    marginBottom: 16,
  },

  // ── Buttons ──
  submitBtn: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  submitBtnDisabled: { opacity: 0.45, elevation: 0, shadowOpacity: 0 },
  submitText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: "#888", fontWeight: "600", fontSize: 14 },

  // ── Checking state ──
  checkingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  checkingText: { fontSize: 14, color: "#888" },

  // ── Existing offer screen ──
  existingOfferContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 14,
  },
  existingOfferIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ECEDF8",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  existingOfferTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
  },
  existingOfferBody: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  existingOfferItemName: {
    fontWeight: "700",
    color: NAVY,
  },
  existingOfferCloseBtn: {
    marginTop: 8,
    backgroundColor: NAVY,
    paddingVertical: 13,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  existingOfferCloseBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  // ── Success screen ──
  successContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 16,
  },
  successIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
  },
  successBody: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  successItemName: {
    fontWeight: "700",
    color: NAVY,
  },
});
