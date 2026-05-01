const { getReactNativePersistence, initializeAuth } = require('@firebase/auth/dist/rn') as any;
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { FacebookAuthProvider, getAuth, GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Platform } from 'react-native';

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
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });

export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

// Function para sa Login (Gamitin ito sa iyong UI button)
export const loginWithGoogle = () => {
  signInWithRedirect(auth, googleProvider);
};

// Function for Facebook Login
export const loginWithFacebook = () => {
  signInWithRedirect(auth, facebookProvider);
};