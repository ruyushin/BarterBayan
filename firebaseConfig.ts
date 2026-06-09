import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { initializeApp } from "firebase/app";
import {
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { Platform } from "react-native";

const { getReactNativePersistence, initializeAuth } =
  require("@firebase/auth/dist/rn") as any;

const firebaseConfig = {
  apiKey: "AIzaSyCnKXpp6R9BqkLF0_joqxA3Ur0Gqi-e3Ic",
  authDomain: "barterbayan.firebaseapp.com",
  projectId: "barterbayan",
  storageBucket: "barterbayan.firebasestorage.app",
  messagingSenderId: "1081232685961",
  appId: "1:1081232685961:web:565d7fcae9e5f7c0b1bf58",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Use native AsyncStorage persistence for React Native, web auth for browser
export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

// Configure Google Sign-In with web client ID
GoogleSignin.configure({
  webClientId:
    "1081232685961-ej4te66gtudrhi4l70jjm37ffball2b6.apps.googleusercontent.com",
});

// Native Google Sign-In for Android/iOS
export const loginWithGoogle = async () => {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;
    if (!idToken) throw new Error("No ID token returned");
    const credential = GoogleAuthProvider.credential(idToken);
    return await signInWithCredential(auth, credential);
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
};

// Function for Facebook Login
export const loginWithFacebook = () => {
  const { signInWithRedirect } = require("firebase/auth");
  signInWithRedirect(auth, facebookProvider);
};
