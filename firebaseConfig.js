import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // Add this

const firebaseConfig = {
  apiKey: "AIzaSyCnKXpp6R9BqkLF0_joqxA3Ur0Gqi-e3Ic", //
  authDomain: "barterbayan.firebaseapp.com",
  projectId: "barterbayan",
  storageBucket: "barterbayan.firebasestorage.app",
  messagingSenderId: "1081232685961",
  appId: "1:1081232685961:web:565d7fcae9e5f7c0b1bf58",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); //
export const db = getFirestore(app); // Export this for user data storage