import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, StyleSheet, Text } from "react-native";

const { width } = Dimensions.get("window");

const BB_ICON = require("../assets/images/BBicon.png");

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Logo fades + scales in
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
        }),
      ]),
      // 2. Wordmark fades in
      Animated.timing(wordmarkOpacity, {
        toValue: 1,
        duration: 320,
        delay: 60,
        useNativeDriver: true,
      }),
      // 3. Tagline fades in
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 280,
        delay: 80,
        useNativeDriver: true,
      }),
      // 4. Hold
      Animated.delay(780),
      // 5. Fade out entire screen
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: exitOpacity }]}>
      {/* Logo */}
      <Animated.View
        style={[
          styles.logoWrapper,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Image source={BB_ICON} style={styles.logo} resizeMode="cover" />
      </Animated.View>

      {/* Wordmark */}
      <Animated.View style={[styles.wordmarkRow, { opacity: wordmarkOpacity }]}>
        <Text style={styles.wordmarkBold}>Barter</Text>
        <Text style={styles.wordmarkLight}>Bayan</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Trade with your community
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  logoWrapper: {
    width: 80,
    height: 80,
    borderRadius: 22,
    overflow: "hidden",
    // Subtle lift
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
  },
  logo: {
    width: 80,
    height: 80,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 0,
    marginTop: 4,
  },
  wordmarkBold: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0e0435",
    letterSpacing: -0.5,
  },
  wordmarkLight: {
    fontSize: 30,
    fontWeight: "300",
    color: "rgba(4, 17, 87, 0.75)",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(2, 2, 27, 0.45)",
    fontWeight: "500",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: -4,
  },
});
