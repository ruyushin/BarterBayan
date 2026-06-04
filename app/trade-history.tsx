import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../firebaseConfig.ts";

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2D2D7A";
const HEADER_BG = "#2f2f6f";
const LIGHT_BG = "#F4F5F9";
const ACCENT_RED = "#C0392B";
const GOLD = "#C9A227";

// ─── Types ────────────────────────────────────────────────────────────────────
// FIX: added "accepted" — tradeService.ts writes this status when a trade is accepted
export type TradeStatus =
  | "pending"
  | "accepted"
  | "completed"
  | "cancelled"
  | "declined";

export interface TradeRecord {
  id: string;
  counterpartUid: string;
  counterpartUsername: string;
  counterpartAvatarUrl?: string;
  offeredItemTitle: string;
  requestedItemTitle: string;
  status: TradeStatus;
  initiatedByMe: boolean;
  createdAt: Date;
  updatedAt: Date;
  note?: string;
}

type FilterTab = "all" | TradeStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "declined", label: "Declined" },
];

// ─── Status config ────────────────────────────────────────────────────────────
// FIX: "accepted" entry added so STATUS_CONFIG[trade.status] is never undefined
const STATUS_CONFIG: Record<
  TradeStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  pending: {
    label: "Pending",
    color: "#B45309",
    bg: "#FEF3C7",
    icon: "time",
  },
  accepted: {
    label: "Accepted",
    color: "#065F46",
    bg: "#D1FAE5",
    icon: "checkmark-circle",
  },
  completed: {
    label: "Completed",
    color: "#065F46",
    bg: "#D1FAE5",
    icon: "checkmark-circle",
  },
  cancelled: {
    label: "Cancelled",
    color: "#6B7280",
    bg: "#F3F4F6",
    icon: "close-circle",
  },
  declined: {
    label: "Declined",
    color: ACCENT_RED,
    bg: "#FEE2E2",
    icon: "close-circle",
  },
};

// FIX: fallback config used when a trade carries an unrecognised status string
const FALLBACK_STATUS_CONFIG = {
  label: "Unknown",
  color: "#6B7280",
  bg: "#F3F4F6",
  icon: "help-circle",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function avatarInitial(name: string): string {
  return (name ?? "U")[0].toUpperCase();
}

// ─── Trade Card ───────────────────────────────────────────────────────────────
function TradeCard({ trade }: { trade: TradeRecord }) {
  const scale = useRef(new Animated.Value(1)).current;

  // FIX: fall back to FALLBACK_STATUS_CONFIG so .bg / .color never throw
  const cfg = STATUS_CONFIG[trade.status] ?? FALLBACK_STATUS_CONFIG;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={cardStyles.card}
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Left: Avatar */}
        <View style={cardStyles.avatarWrapper}>
          <View style={cardStyles.avatarCircle}>
            <Text style={cardStyles.avatarText}>
              {avatarInitial(trade.counterpartUsername)}
            </Text>
          </View>
          <View
            style={[
              cardStyles.directionBadge,
              { backgroundColor: trade.initiatedByMe ? DARK_BLUE : GOLD },
            ]}
          >
            <Text style={cardStyles.directionText}>
              {trade.initiatedByMe ? "↑" : "↓"}
            </Text>
          </View>
        </View>

        {/* Center: Trade details */}
        <View style={cardStyles.info}>
          <View style={cardStyles.nameRow}>
            <Text style={cardStyles.counterpart} numberOfLines={1}>
              {trade.counterpartUsername}
            </Text>
            <Text style={cardStyles.dateText}>
              {formatDate(trade.createdAt)}
            </Text>
          </View>

          <View style={cardStyles.itemsRow}>
            <Text style={cardStyles.itemLabel} numberOfLines={1}>
              {trade.offeredItemTitle}
            </Text>
            <Text style={cardStyles.arrow}>⇄</Text>
            <Text style={cardStyles.itemLabel} numberOfLines={1}>
              {trade.requestedItemTitle}
            </Text>
          </View>

          {trade.note ? (
            <Text style={cardStyles.note} numberOfLines={1}>
              "{trade.note}"
            </Text>
          ) : null}

          <View style={[cardStyles.statusPill, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
            <Text style={[cardStyles.statusLabel, { color: cfg.color }]}>
              {cfg.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ filter }: { filter: FilterTab }) {
  const messages: Record<
    FilterTab,
    { icon: string; title: string; subtitle: string }
  > = {
    all: {
      icon: "swap-horizontal",
      title: "No trades yet",
      subtitle:
        "Your trade history will appear here once you start proposing or receiving trades.",
    },
    pending: {
      icon: "time",
      title: "No pending trades",
      subtitle: "Trades waiting for a response will show up here.",
    },
    accepted: {
      icon: "checkmark-circle",
      title: "No accepted trades",
      subtitle: "Trades that have been accepted will appear here.",
    },
    completed: {
      icon: "checkmark-circle",
      title: "No completed trades",
      subtitle: "Successfully exchanged trades will be recorded here.",
    },
    cancelled: {
      icon: "close-circle",
      title: "No cancelled trades",
      subtitle: "Trades you or your counterpart cancelled will appear here.",
    },
    declined: {
      icon: "close-circle",
      title: "No declined trades",
      subtitle: "Trades that were declined will show up here.",
    },
  };

  const msg = messages[filter] ?? messages["all"];

  return (
    <View style={emptyStyles.container}>
      <View style={emptyStyles.iconCircle}>
        <Ionicons name={msg.icon as any} size={48} color={DARK_BLUE} />
      </View>
      <Text style={emptyStyles.title}>{msg.title}</Text>
      <Text style={emptyStyles.subtitle}>{msg.subtitle}</Text>
    </View>
  );
}

// ─── Summary Bar ─────────────────────────────────────────────────────────────
function SummaryBar({ trades }: { trades: TradeRecord[] }) {
  // FIX: count "accepted" as completed-equivalent for the summary
  const completed = trades.filter(
    (t) => t.status === "completed" || t.status === "accepted",
  ).length;
  const pending = trades.filter((t) => t.status === "pending").length;
  const total = trades.length;

  return (
    <View style={summaryStyles.bar}>
      <View style={summaryStyles.stat}>
        <Text style={summaryStyles.statNum}>{total}</Text>
        <Text style={summaryStyles.statLabel}>Total</Text>
      </View>
      <View style={summaryStyles.divider} />
      <View style={summaryStyles.stat}>
        <Text style={[summaryStyles.statNum, { color: "#065F46" }]}>
          {completed}
        </Text>
        <Text style={summaryStyles.statLabel}>Accepted</Text>
      </View>
      <View style={summaryStyles.divider} />
      <View style={summaryStyles.stat}>
        <Text style={[summaryStyles.statNum, { color: "#B45309" }]}>
          {pending}
        </Text>
        <Text style={summaryStyles.statLabel}>Pending</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TradeHistoryScreen() {
  const router = useRouter();
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
      }),
    ]).start();
  };

  const handleBackPress = () => {
    try {
      if (router.canGoBack?.()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      router.replace("/(tabs)");
    }
  };

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, [router]);

  // ── Firestore real-time listener ───────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    setError(null);

    const tradesRef = collection(db, "trades");
    const q = query(
      tradesRef,
      where("participants", "array-contains", currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(100),
    );

    const unsubscribeTrades = onSnapshot(
      q,
      (snapshot) => {
        const fetched: TradeRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();

          // FIX: resolve counterpart name + uid from tradeService fields
          // tradeService stores: offererId, ownerId, offererName
          // we derive counterpart from whichever side is NOT the current user
          const isOfferer = d.offererId === currentUser.uid;
          const counterpartUid = isOfferer ? d.ownerId : d.offererId;
          const counterpartUsername = isOfferer
            ? (d.ownerName ?? d.counterpartUsername ?? "Unknown")
            : (d.offererName ?? d.counterpartUsername ?? "Unknown");
          const counterpartAvatarUrl = isOfferer
            ? (d.ownerAvatar ?? d.counterpartAvatarUrl)
            : (d.offererAvatar ?? d.counterpartAvatarUrl);

          // FIX: map tradeService field names → TradeRecord field names
          const offeredItemTitle =
            d.offeredItemTitle ?? d.offeredItem ?? "Unknown item";
          const requestedItemTitle =
            d.requestedItemTitle ?? d.requestedItem ?? "Unknown item";

          // FIX: coerce unrecognised status strings to "pending" so the
          //      fallback config handles them gracefully rather than crashing
          const rawStatus = d.status ?? "pending";
          const knownStatuses: TradeStatus[] = [
            "pending",
            "accepted",
            "completed",
            "cancelled",
            "declined",
          ];
          const status: TradeStatus = knownStatuses.includes(rawStatus)
            ? rawStatus
            : "pending";

          return {
            id: docSnap.id,
            counterpartUid,
            counterpartUsername,
            counterpartAvatarUrl,
            offeredItemTitle,
            requestedItemTitle,
            status,
            initiatedByMe: isOfferer,
            createdAt: d.createdAt?.toDate?.() ?? new Date(),
            updatedAt: d.updatedAt?.toDate?.() ?? new Date(),
            note: d.message ?? d.note,
          } as TradeRecord;
        });

        setTrades(fetched);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        animateIn();
      },
      (err) => {
        console.error("Trade history error:", err);
        const isOffline =
          err?.code === "unavailable" || /offline/i.test(err?.message ?? "");
        const isIndexError = err?.code === "failed-precondition";

        if (isIndexError) {
          const errorMsg = err?.message ?? "";
          const indexUrl = errorMsg.match(
            /https:\/\/console\.firebase\.google\.com[^\s]+/,
          )?.[0];

          if (indexUrl) {
            setError(
              "Trade history requires a database index. Tap to create it in Firebase Console.",
            );
            Linking.openURL(indexUrl).catch(() => {
              setError(
                "Please create the composite index in Firebase Console to view trade history.",
              );
            });
          } else {
            setError(
              "Trade history needs a Firestore index. Check your Firebase Console.",
            );
          }
        } else if (isOffline) {
          setError("You appear to be offline. Showing cached data.");
        } else {
          setError("Failed to load trade history.");
        }

        setLoading(false);
        setRefreshing(false);
        animateIn();
      },
    );

    return () => unsubscribeTrades();
  }, [currentUser]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filteredTrades =
    activeFilter === "all"
      ? trades
      : trades.filter((t) => t.status === activeFilter);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trade History</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DARK_BLUE} />
          <Text style={styles.loadingText}>Loading trades…</Text>
        </View>
      </View>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade History</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={DARK_BLUE}
            colors={[DARK_BLUE]}
          />
        }
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* Error Banner */}
          {error && (
            <View style={styles.errorBanner}>
              <View style={styles.errorBannerContent}>
                <Ionicons name="alert-circle" size={18} color="#F5A623" />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            </View>
          )}

          {/* Summary Bar */}
          {trades.length > 0 && <SummaryBar trades={trades} />}

          {/* Filter Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContainer}
            style={styles.tabsScroll}
          >
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.key;
              const count =
                tab.key === "all"
                  ? trades.length
                  : trades.filter((t) => t.status === tab.key).length;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => setActiveFilter(tab.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                  >
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        styles.tabBadge,
                        isActive && styles.tabBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabBadgeText,
                          isActive && styles.tabBadgeTextActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Trade List or Empty State */}
          {filteredTrades.length === 0 ? (
            <EmptyState filter={activeFilter} />
          ) : (
            <View style={styles.listContainer}>
              {/* Direction legend */}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: DARK_BLUE }]}
                  >
                    <Text style={styles.legendDotText}>↑</Text>
                  </View>
                  <Text style={styles.legendLabel}>You initiated</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: GOLD }]}>
                    <Text style={styles.legendDotText}>↓</Text>
                  </View>
                  <Text style={styles.legendLabel}>They initiated</Text>
                </View>
              </View>

              {filteredTrades.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LIGHT_BG },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 15,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  backIcon: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: -2,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  headerSpacer: { width: 36 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14, color: "#888" },
  errorBanner: {
    backgroundColor: "#FFF3CD",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#F5A623",
  },
  errorBannerContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorBannerText: {
    color: "#856404",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  scrollContent: { paddingBottom: 100 },
  tabsScroll: { marginTop: 16 },
  tabsContainer: { paddingHorizontal: 16, gap: 8 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E5E5E5",
    gap: 6,
  },
  tabActive: { backgroundColor: DARK_BLUE, borderColor: DARK_BLUE },
  tabLabel: { fontSize: 13, fontWeight: "600", color: "#555" },
  tabLabelActive: { color: "#fff" },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ECECEC",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  tabBadgeText: { fontSize: 11, fontWeight: "700", color: "#666" },
  tabBadgeTextActive: { color: "#fff" },
  listContainer: { marginTop: 16, paddingHorizontal: 16, gap: 10 },
  legend: { flexDirection: "row", gap: 16, marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  legendDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  legendLabel: { fontSize: 12, color: "#888", fontWeight: "500" },
});

// ─── Card Styles ──────────────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  avatarWrapper: { position: "relative", width: 48, height: 48 },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: DARK_BLUE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  directionBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  directionText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
  info: { flex: 1, gap: 5 },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  counterpart: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
    flex: 1,
  },
  dateText: {
    fontSize: 11,
    color: "#AAAAAA",
    fontWeight: "500",
    marginLeft: 8,
  },
  itemsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemLabel: { flex: 1, fontSize: 12.5, color: "#555", fontWeight: "500" },
  arrow: { fontSize: 14, color: DARK_BLUE, fontWeight: "700" },
  note: { fontSize: 12, color: "#AAAAAA", fontStyle: "italic" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 4,
    marginTop: 2,
  },
  statusLabel: { fontSize: 11, fontWeight: "700" },
});

// ─── Summary Styles ───────────────────────────────────────────────────────────
const summaryStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statNum: { fontSize: 22, fontWeight: "800", color: DARK_BLUE },
  statLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: { width: 1, backgroundColor: "#ECECEC", marginVertical: 4 },
});

// ─── Empty State Styles ───────────────────────────────────────────────────────
const emptyStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ECEDF8",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
});
