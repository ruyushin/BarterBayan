import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

// ─── Enable LayoutAnimation on Android ───────────────────────────────────────
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DARK_BLUE = "#2D2D7A";
const LIGHT_BG = "#F4F5F9";

// ─── Icon mapping for categories ────────────────────────────────────────────
const getIconForCategory = (id: string): string => {
  switch (id) {
    case "getting-started":
      return "rocket";
    case "trading":
      return "swap-horizontal";
    case "account":
      return "person";
    case "ratings":
      return "star";
    case "safety":
      return "lock-closed";
    default:
      return "help-circle";
  }
};

// ─── FAQ Data ─────────────────────────────────────────────────────────────────
interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  emoji: string;
  title: string;
  items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
  {
    id: "getting-started",
    emoji: "🚀",
    title: "Getting Started",
    items: [
      {
        id: "gs-1",
        question: "How do I create an account?",
        answer:
          'Download the app and tap "Sign Up" on the login screen. Enter your email address, create a password, and verify your email. Once verified, complete your profile by adding your username and phone number to start trading.',
      },
      {
        id: "gs-2",
        question: "Is the app free to use?",
        answer:
          "Yes! Creating an account and browsing listings is completely free. We never charge you to post a listing or browse items available for trade.",
      },
      {
        id: "gs-3",
        question: "How do I get verified?",
        answer:
          "Tap the edit profile button from your profile screen and follow the verification steps. Verified users get a blue checkmark badge and are trusted more by the community.",
      },
    ],
  },
  {
    id: "trading",
    emoji: "🔄",
    title: "Trading",
    items: [
      {
        id: "tr-1",
        question: "How do I start a trade?",
        answer:
          'Find an item you like, tap it to view the listing, then hit "Propose Trade." You can offer one of your own listed items or describe what you can offer. The other user will accept, decline, or counter-propose.',
      },
      {
        id: "tr-2",
        question: "What counts as a completed trade?",
        answer:
          "A trade is marked as completed once both parties confirm the exchange was successfully made. Your Trades count on your profile updates automatically, and you can leave a rating for the other trader.",
      },
      {
        id: "tr-3",
        question: "Can I cancel a trade proposal?",
        answer:
          "Yes — you can withdraw a pending trade proposal at any time before the other user accepts it. Go to Trade History and tap on the pending trade to see cancellation options.",
      },
      {
        id: "tr-4",
        question: 'What is "Exchanged" on my profile?',
        answer:
          '"Exchanged" tracks the total number of individual items you\'ve sent out as part of completed trades. This is separate from your Trades count, which counts trade transactions.',
      },
    ],
  },
  {
    id: "account",
    emoji: "👤",
    title: "Account & Profile",
    items: [
      {
        id: "ac-1",
        question: "How do I change my profile photo?",
        answer:
          "Tap the edit button on your profile screen. From there you can tap your avatar to upload a new photo from your camera roll or take a new one.",
      },
      {
        id: "ac-2",
        question: "Can I change my username?",
        answer:
          "Yes, you can update your username from the edit profile screen. Usernames must be unique across the app and can only be changed once every 30 days.",
      },
      {
        id: "ac-3",
        question: "How do I delete my account?",
        answer:
          "Account deletion can be requested by contacting our support team at barterbayansupport@gmail.com. Please note that deletion is permanent and all your listings, trade history, and ratings will be removed.",
      },
    ],
  },
  {
    id: "ratings",
    emoji: "⭐",
    title: "Ratings & Trust",
    items: [
      {
        id: "rt-1",
        question: "How is my trader rating calculated?",
        answer:
          "Your rating is the average score from all reviews left by users you have completed trades with. Ratings are on a 1–5 star scale. You need at least one completed trade before your rating is visible.",
      },
      {
        id: "rt-2",
        question: "Can I dispute a rating?",
        answer:
          'If you believe a rating was left in bad faith or violates our community guidelines, you can report it via the "Report an Issue" option on your profile. Our team will review it within 3–5 business days.',
      },
      {
        id: "rt-3",
        question: "What is the Overview page?",
        answer:
          "The Overview page shows a detailed breakdown of your trading activity, review history, and reputation over time. Tap the gold Overview button on your profile to access it.",
      },
    ],
  },
  {
    id: "safety",
    emoji: "🔒",
    title: "Safety & Privacy",
    items: [
      {
        id: "sf-1",
        question: "How do I report a suspicious user?",
        answer:
          'On their profile or listing, tap the "..." menu and select "Report." You can also use "Report an Issue" from your own profile settings and choose "Scam or fraud" as the category.',
      },
      {
        id: "sf-2",
        question: "Is my personal information safe?",
        answer:
          "We take privacy seriously. Your email is never shared with other users — only your username and phone number (if you choose to display it) are visible on your public profile. See our Privacy Policy for full details.",
      },
      {
        id: "sf-3",
        question: "What are the community guidelines?",
        answer:
          "We require all users to trade honestly, respect each other, and list only items they actually own. Prohibited items include counterfeit goods, illegal items, and anything that violates local laws. Violations may result in account suspension.",
      },
    ],
  },
];

// ─── Accordion Item ───────────────────────────────────────────────────────────
function AccordionItem({ item }: { item: FAQItem }) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.spring(rotateAnim, {
      toValue: expanded ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
    setExpanded((prev) => !prev);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  return (
    <View style={accordionStyles.container}>
      <TouchableOpacity
        style={accordionStyles.header}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <Text
          style={[
            accordionStyles.question,
            expanded && accordionStyles.questionActive,
          ]}
        >
          {item.question}
        </Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <View
            style={[
              accordionStyles.iconCircle,
              expanded && accordionStyles.iconCircleActive,
            ]}
          >
            <Text
              style={[
                accordionStyles.icon,
                expanded && accordionStyles.iconActive,
              ]}
            >
              +
            </Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
      {expanded && (
        <View style={accordionStyles.body}>
          <View style={accordionStyles.divider} />
          <Text style={accordionStyles.answer}>{item.answer}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({ category }: { category: FAQCategory }) {
  return (
    <View style={sectionStyles.wrapper}>
      <View style={sectionStyles.titleRow}>
        <Ionicons
          name={getIconForCategory(category.id) as any}
          size={24}
          color={DARK_BLUE}
        />
        <Text style={sectionStyles.title}>{category.title}</Text>
      </View>
      <View style={sectionStyles.card}>
        {category.items.map((item, index) => (
          <React.Fragment key={item.id}>
            <AccordionItem item={item} />
            {index < category.items.length - 1 && (
              <View style={sectionStyles.separator} />
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FAQScreen() {
  const router = useRouter();

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FAQs</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Ionicons name="chatbubble" size={48} color={DARK_BLUE} />
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>
            Find answers to the most common questions about trading, your
            account, and staying safe.
          </Text>
        </View>
        {FAQ_DATA.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}
        <View style={styles.contactCard}>
          <Ionicons name="mail" size={40} color={DARK_BLUE} />
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactText}>
            Can't find what you're looking for? Our support team is happy to
            assist.
          </Text>
          <Text style={styles.contactEmail}>barterbayansupport@gmail.com</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },

  // Header
  header: {
    backgroundColor: "#2f2f6f",
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
  headerSpacer: {
    width: 36,
  },

  // Scroll
  scrollContent: {
    paddingBottom: 100,
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 28,
  },
  heroEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },

  // Contact footer
  contactCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: DARK_BLUE,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  contactEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  contactTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
  },
  contactText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 12,
  },
  contactEmail: {
    fontSize: 14,
    color: "#C9A227",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

// ─── Section Styles ───────────────────────────────────────────────────────────
const sectionStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingLeft: 2,
  },
  emoji: {
    fontSize: 18,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A2E",
    letterSpacing: 0.2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ECECEC",
    marginHorizontal: 18,
  },
});

// ─── Accordion Styles ─────────────────────────────────────────────────────────
const accordionStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  question: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "600",
    color: "#1A1A2E",
    lineHeight: 20,
  },
  questionActive: {
    color: DARK_BLUE,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D0D0D0",
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleActive: {
    borderColor: DARK_BLUE,
    backgroundColor: "#ECEDF8",
  },
  icon: {
    fontSize: 17,
    color: "#AAAAAA",
    lineHeight: 20,
    fontWeight: "400",
  },
  iconActive: {
    color: DARK_BLUE,
  },
  body: {
    marginTop: 10,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginBottom: 10,
  },
  answer: {
    fontSize: 13.5,
    color: "#555",
    lineHeight: 20,
  },
});
