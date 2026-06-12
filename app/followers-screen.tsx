/**
 * app/followers-screen.tsx
 *
 * Screen that lists followers OR following for any user.
 * Navigate with:
 *   router.push({ pathname: "/followers-screen", params: { userId, tab: "followers" | "following" } })
 */

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";
import {
  FollowUser,
  getFollowers,
  getFollowing,
  subscribeToFollowState,
  toggleFollow,
} from "../services/followService";
import { getUserInfo } from "../services/itemService";

const NAVY = "#2f2f6f";

// ── Display name resolver ─────────────────────────────────────────────────────
// Mirrors ProductDetailModal: firstName + lastName first, then falls through
// displayName, name, fullName, username handle.
function resolveDisplayName(user: FollowUser): string {
  const firstName = (user as any).firstName?.trim();
  const lastName = (user as any).lastName?.trim();
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return (
    (user as any).displayName?.trim() ||
    (user as any).name?.trim() ||
    (user as any).fullName?.trim() ||
    firstName ||                   // single first name if no last name
    user.username?.trim() ||
    "User"
  );
}

// ─── Follow Button (self-contained, real-time) ────────────────────────────────
function FollowBtn({
  targetUserId,
  targetUserData,
}: {
  targetUserId: string;
  targetUserData: { username: string; avatarUrl?: string };
}) {
  const currentUser = auth.currentUser;
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.uid === targetUserId) return;
    const unsub = subscribeToFollowState(
      currentUser.uid,
      targetUserId,
      setFollowing,
    );
    return unsub;
  }, [currentUser, targetUserId]);

  if (!currentUser || currentUser.uid === targetUserId) return null;

  const handlePress = async () => {
    setLoading(true);
    try {
      // Use the resolved display name (not handle) in follow records
      const currentDisplayName =
        currentUser.displayName?.trim() ||
        currentUser.email?.split("@")[0] ||
        "User";
      const currentAvatar = currentUser.photoURL ?? undefined;
      await toggleFollow(
        currentUser.uid,
        { username: currentDisplayName, avatarUrl: currentAvatar },
        targetUserId,
        targetUserData,
        following,
      );
    } catch {
      Alert.alert("Error", "Could not update follow status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.followBtn, following && styles.followBtnActive]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={following ? NAVY : "#fff"} />
      ) : (
        <Text
          style={[
            styles.followBtnText,
            following && styles.followBtnTextActive,
          ]}
        >
          {following ? "Following" : "Follow"}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ user }: { user: FollowUser }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  // Seed from follow record immediately; upgrade to full profile name async
  const [displayName, setDisplayName] = useState(resolveDisplayName(user));
  const [resolvedAvatar, setResolvedAvatar] = useState(user.avatarUrl);

  useEffect(() => {
    if (!user.uid) return;
    let cancelled = false;
    getUserInfo(user.uid)
      .then((info) => {
        if (cancelled || !info) return;
        const firstName = info.firstName?.trim();
        const lastName = info.lastName?.trim();
        const name =
          firstName && lastName
            ? `${firstName} ${lastName}`
            : info.displayName?.trim() ||
              info.name?.trim() ||
              info.fullName?.trim() ||
              firstName ||
              info.username?.trim() ||
              info.userName?.trim() ||
              resolveDisplayName(user);
        if (name) setDisplayName(name);
        if (info.avatarUrl) setResolvedAvatar(info.avatarUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() =>
        router.push({ pathname: "/user-profile", params: { userId: user.uid } })
      }
    >
      {resolvedAvatar && !failed ? (
        <Image
          source={{ uri: resolvedAvatar }}
          style={styles.avatar}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>
            {(displayName || "?")[0].toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{displayName}</Text>
        {user.isVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        )}
      </View>

      <FollowBtn
        targetUserId={user.uid}
        targetUserData={{ username: displayName, avatarUrl: resolvedAvatar }}
      />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FollowersScreen() {
  const router = useRouter();
  const {
    userId,
    tab: initialTab,
    username,
  } = useLocalSearchParams<{
    userId: string;
    tab?: "followers" | "following";
    username?: string;
  }>();

  const [activeTab, setActiveTab] = useState<"followers" | "following">(
    initialTab ?? "followers",
  );
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Real-time counts from user doc
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(doc(db, "users", userId), (snap) => {
      const data = snap.data();
      setFollowerCount(data?.followerCount ?? 0);
      setFollowingCount(data?.followingCount ?? 0);
    });
    return unsub;
  }, [userId]);

  // Load lists
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([getFollowers(userId), getFollowing(userId)])
      .then(([f, fg]) => {
        setFollowers(f);
        setFollowing(fg);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const data = activeTab === "followers" ? followers : following;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {username ?? "User"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "followers" && styles.tabActive]}
          onPress={() => setActiveTab("followers")}
        >
          <Text
            style={[
              styles.tabCount,
              activeTab === "followers" && styles.tabCountActive,
            ]}
          >
            {followerCount}
          </Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === "followers" && styles.tabLabelActive,
            ]}
          >
            Followers
          </Text>
        </TouchableOpacity>

        <View style={styles.tabDivider} />

        <TouchableOpacity
          style={[styles.tab, activeTab === "following" && styles.tabActive]}
          onPress={() => setActiveTab("following")}
        >
          <Text
            style={[
              styles.tabCount,
              activeTab === "following" && styles.tabCountActive,
            ]}
          >
            {followingCount}
          </Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === "following" && styles.tabLabelActive,
            ]}
          >
            Following
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.uid}
          renderItem={({ item }) => <UserRow user={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>
                {activeTab === "followers"
                  ? "No followers yet"
                  : "Not following anyone yet"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 13,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  tabActive: {},
  tabDivider: { width: 1, backgroundColor: "#ececec", marginVertical: 4 },
  tabCount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#ccc",
  },
  tabCountActive: { color: NAVY },
  tabLabel: { fontSize: 12, fontWeight: "600", color: "#bbb", marginTop: 2 },
  tabLabelActive: { color: NAVY },

  list: { paddingTop: 8, paddingBottom: 40 },
  separator: { height: 1, backgroundColor: "#F0F0F0", marginLeft: 76 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8E8E8",
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 18, fontWeight: "800" },

  rowInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowName: { fontSize: 15, fontWeight: "700", color: "#1a1a2e" },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1877F2",
    justifyContent: "center",
    alignItems: "center",
  },

  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: NAVY,
    minWidth: 90,
    alignItems: "center",
  },
  followBtnActive: {
    backgroundColor: "#ECEDF8",
    borderWidth: 1.5,
    borderColor: "#C8CAEE",
  },
  followBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  followBtnTextActive: { color: NAVY },

  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: "#bbb", fontWeight: "600" },
});