import { Ionicons } from "@expo/vector-icons";
import {
    deleteUser,
    EmailAuthProvider,
    reauthenticateWithCredential,
    User,
} from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { db } from "../firebaseConfig";

const DARK_BLUE = "#2D2D7A";
const ACCENT_RED = "#C0392B";
const SUCCESS_GREEN = "#065F46";
const LIGHT_BG = "#F4F5F9";

function AppModal({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        elevation: 99,
      }}
    >
      {children}
    </View>
  );
}

export function DeleteAccountModal({
  visible,
  onClose,
  currentUser,
  router,
}: {
  visible: boolean;
  onClose: () => void;
  currentUser: User | null;
  router: any;
}) {
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleDelete = async () => {
    if (!password.trim()) {
      setPasswordError("Password is required to delete your account.");
      return;
    }

    if (!currentUser?.email) {
      Alert.alert("Error", "No user session found. Please log in again.");
      return;
    }

    setDeleting(true);
    setPasswordError("");

    try {
      // Reauthenticate with password
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        password
      );
      await reauthenticateWithCredential(currentUser, credential);

      // Delete Firestore document
      try {
        await deleteDoc(doc(db, "users", currentUser.uid));
      } catch (dbErr: any) {
        console.error("Firestore delete error:", dbErr);
      }

      // Delete Firebase Auth user
      await deleteUser(currentUser);

      // Success
      Alert.alert(
        "Account Deleted",
        "Your account and all data have been permanently deleted.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
      );

      onClose();
    } catch (err: any) {
      console.error("Delete account error:", err);

      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setPasswordError("Incorrect password. Please try again.");
      } else if (err.code === "auth/requires-recent-login") {
        Alert.alert(
          "Re-authentication Required",
          "For security, please log out and log back in, then delete your account again.",
          [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
        );
      } else {
        Alert.alert(
          "Error",
          err?.message ?? "Failed to delete account. Please try again or contact support."
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: "100%",
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#FEE2E2",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="trash-outline" size={28} color={ACCENT_RED} />
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: DARK_BLUE,
              marginBottom: 8,
            }}
          >
            Delete Account?
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: "#666",
              lineHeight: 20,
              marginBottom: 16,
            }}
          >
            This action cannot be undone. All your listings, trades, messages,
            and data will be permanently erased.
          </Text>

          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: DARK_BLUE,
                marginBottom: 6,
              }}
            >
              Enter your password to confirm
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: passwordError ? ACCENT_RED : "#E0E0E0",
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: "#333",
              }}
              placeholder="Password"
              placeholderTextColor="#CCCCCC"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError("");
              }}
              editable={!deleting}
            />
            {passwordError && (
              <Text
                style={{
                  color: ACCENT_RED,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {passwordError}
              </Text>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 8,
            }}
          >
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: "#E0E0E0",
                justifyContent: "center",
                alignItems: "center",
              }}
              onPress={onClose}
              disabled={deleting}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: DARK_BLUE,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 6,
                backgroundColor: ACCENT_RED,
                justifyContent: "center",
                alignItems: "center",
              }}
              onPress={handleDelete}
              disabled={deleting}
              activeOpacity={0.85}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#fff",
                  }}
                >
                  Delete Account
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AppModal>
  );
}
