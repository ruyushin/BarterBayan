// SwipeableMessage component - UPDATED VERSION
function SwipeableMessage({
  children,
  onSwipeReply,
  isMe,
  timeStr,
  readStatus,
}: {
  children: React.ReactNode;
  onSwipeReply: () => void;
  isMe: boolean;
  timeStr?: string;
  readStatus?: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);
  const THRESHOLD = 50;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_: any, gs: any) => {
        // Only enable swipe for right-aligned messages (isMe)
        // Swipe LEFT (negative dx) to reveal timestamps
        if (!isMe) return false;
        return Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && gs.dx < 0;
      },
      onPanResponderMove: (_: any, gs: any) => {
        // Swipe left to reveal timestamps (negative dx becomes positive for visual effect)
        if (gs.dx < 0) {
          const value = Math.min(-gs.dx, THRESHOLD + 20);
          translateX.setValue(value);
        }
      },
      onPanResponderRelease: (_: any, gs: any) => {
        if (-gs.dx >= THRESHOLD && !triggered.current) {
          triggered.current = true;
          onSwipeReply();
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: Platform.OS !== 'web',
          tension: 80,
          friction: 10,
        }).start(() => {
          triggered.current = false;
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: Platform.OS !== 'web',
        }).start(() => {
          triggered.current = false;
        });
      },
    }),
  ).current;

  const opacity = translateX.interpolate({
    inputRange: [0, THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Only show swipe overlay for right-aligned messages
  if (!isMe) {
    return (
      <View {...panResponder.panHandlers}>
        {children}
      </View>
    );
  }

  return (
    <View style={{ position: "relative" }}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          { flex: 1, transform: [{ translateX }] },
        ]}
      >
        {children}
      </Animated.View>
      {/* Timestamp appears on RIGHT when swiping left on right-aligned messages */}
      {timeStr && isMe && (
        <Animated.View
          style={[
            styles.swipeTimeOverlay,
            styles.swipeTimeRight,
            { opacity },
            { position: "absolute", right: 0, top: "50%", transform: [{ translateY: -10 }] },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.swipeTimeText}>{timeStr}</Text>
          <Ionicons
            name={readStatus ? "checkmark-done" : "checkmark"}
            size={14}
            color="#999"
            style={{ marginLeft: 4 }}
          />
        </Animated.View>
      )}
    </View>
  );
}
