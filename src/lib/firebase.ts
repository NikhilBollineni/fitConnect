import { initializeApp, getApps, getApp } from "firebase/app";
// React Native requires initializeAuth with AsyncStorage persistence
// getAuth() uses browser-only IndexedDB which causes api-key-not-valid errors in RN
// @ts-ignore
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with React Native persistence
// This is the critical fix — getAuth() alone fails in React Native
let auth: ReturnType<typeof initializeAuth>;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch (e) {
    // If auth was already initialized (hot reload), fall back to getAuth
    auth = getAuth(app) as any;
}

export { auth };
// Firestore — use default memory cache for React Native compatibility.
// persistentLocalCache() relies on IndexedDB which is NOT natively available
// in React Native and can silently break real-time onSnapshot listeners for
// server-side writes (e.g., Cloud Function incrementing unreadCount).
import { getFirestore } from 'firebase/firestore';
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
