import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";

const NAVY = "#2f2f6f";

interface ItemDetailsCardProps {
  description?: string;
  additionalDescription?: string;
  condition?: string;
  category?: string;
  estimatedWeight?: string;
  quantity?: number;
  /** compact=true used inside the modal (slightly smaller type) */
  compact?: boolean;
  descriptionExpanded?: boolean;
  onToggleDescription?: () => void;
}

export function ItemDetailsCard({
  description,
  additionalDescription,
  condition,
  category,
  estimatedWeight,
  quantity,
  compact = false,
  descriptionExpanded = false,
  onToggleDescription,
}: ItemDetailsCardProps) {
  const TRUNCATE = compact ? 180 : 300;
  const descTruncated =
    description && description.length > TRUNCATE && !descriptionExpanded;

  return (
    <View style={styles.card}>
      {/* ── Section heading ── */}
      <Text style={[styles.cardHeader, compact && styles.cardHeaderCompact]}>
        Details
      </Text>

      {/* ── Pill row: condition + category ── */}
      {(!!condition || !!category) && (
        <View style={styles.pillRow}>
          {!!condition && (
            <View style={[styles.pill, styles.pillCondition]}>
              <Ionicons
                name="shield-checkmark-outline"
                size={12}
                color={NAVY}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.pillConditionText}>{condition}</Text>
            </View>
          )}
          {!!category && (
            <View style={[styles.pill, styles.pillCategory]}>
              <Ionicons
                name="pricetag-outline"
                size={12}
                color="#555"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.pillCategoryText}>{category}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Stats row: weight + quantity ── */}
      {(!!estimatedWeight || !!quantity) && (
        <View style={styles.statsRow}>
          {!!estimatedWeight && (
            <View style={styles.statBox}>
              <Ionicons name="scale-outline" size={16} color="#888" />
              <Text style={styles.statLabel}>Weight</Text>
              <Text style={styles.statValue}>{estimatedWeight}</Text>
            </View>
          )}
          {!!quantity && (
            <View style={styles.statBox}>
              <Ionicons name="layers-outline" size={16} color="#888" />
              <Text style={styles.statLabel}>Quantity</Text>
              <Text style={styles.statValue}>{quantity}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Divider before description ── */}
      {!!description &&
        (!!estimatedWeight || !!quantity || !!condition || !!category) && (
          <View style={styles.divider} />
        )}

      {/* ── Description ── */}
      {!!description && (
        <View style={styles.descBlock}>
          <View style={styles.descLabelRow}>
            <Ionicons name="document-text-outline" size={13} color="#888" />
            <Text style={styles.descLabel}>Description</Text>
          </View>
          <Text style={[styles.descText, compact && styles.descTextCompact]}>
            {descTruncated
              ? description.substring(0, TRUNCATE) + "…"
              : description}
          </Text>
          {description.length > TRUNCATE && !!onToggleDescription && (
            <Text style={styles.seeMore} onPress={onToggleDescription}>
              {descriptionExpanded ? "See less" : "See more"}
            </Text>
          )}
        </View>
      )}

      {/* ── Additional description ── */}
      {!!additionalDescription && (
        <View style={[styles.descBlock, styles.additionalBlock]}>
          <View style={styles.descLabelRow}>
            <Ionicons
              name="information-circle-outline"
              size={13}
              color="#888"
            />
            <Text style={styles.descLabel}>Additional info</Text>
          </View>
          <Text style={[styles.descText, compact && styles.descTextCompact]}>
            {additionalDescription}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    gap: 0,
  } as ViewStyle,

  cardHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  } as TextStyle,
  cardHeaderCompact: {
    fontSize: 15,
    marginBottom: 10,
  } as TextStyle,

  // Pills
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  } as ViewStyle,
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  } as ViewStyle,
  pillCondition: {
    backgroundColor: "#EEF0FF",
    borderWidth: 1,
    borderColor: "#C8CAEE",
  } as ViewStyle,
  pillConditionText: {
    fontSize: 12,
    fontWeight: "700",
    color: NAVY,
  } as TextStyle,
  pillCategory: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  } as ViewStyle,
  pillCategoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#555",
  } as TextStyle,

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  } as ViewStyle,
  statBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
  } as ViewStyle,
  statLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  } as TextStyle,
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  } as TextStyle,

  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginBottom: 12,
  } as ViewStyle,

  // Description
  descBlock: {
    gap: 6,
    marginBottom: 4,
  } as ViewStyle,
  additionalBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  } as ViewStyle,
  descLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  } as ViewStyle,
  descLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  } as TextStyle,
  descText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
  } as TextStyle,
  descTextCompact: {
    fontSize: 13,
    lineHeight: 20,
  } as TextStyle,
  seeMore: {
    fontSize: 13,
    fontWeight: "700",
    color: NAVY,
    marginTop: 4,
  } as TextStyle,
});
