import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    User,
    GoogleAuthProvider,
    signInWithCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { Alert } from 'react-native';
import { registerForPushNotificationsAsync } from '../utils/notifications';

// Lazy-load GoogleSignin to prevent crash in Expo Go
let GoogleSignin: any = null;
let statusCodes: any = null;
try {
    const googleSignInModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = googleSignInModule.GoogleSignin;
    statusCodes = googleSignInModule.statusCodes;
} catch (e) {
    console.warn('Google Sign-In native module not available. Google Auth will be disabled.');
}

type UserRole = 'client' | 'trainer' | null;

interface AuthContextType {
    user: User | null;
    userRole: UserRole;
    loading: boolean;
    signIn: (email: string, pass: string) => Promise<void>;
    signUp: (email: string, pass: string, name: string) => Promise<void>;
    logOut: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    setUserRole: (role: 'client' | 'trainer') => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRoleState] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);
    const pushRegisteredRef = useRef<string | null>(null);

    useEffect(() => {
        if (GoogleSignin) {
            try {
                GoogleSignin.configure({
                    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                    offlineAccess: true,
                });
            } catch (e) {
                console.warn('Google Sign-In configuration failed:', e);
            }
        }

        let isCurrent = true;
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                try {
                    const docRef = doc(db, 'clientProfiles', currentUser.uid);
                    const docSnap = await getDoc(docRef);
                    if (!isCurrent) return;
                    const role = docSnap.exists() ? (docSnap.data().role || null) : null;

                    // Register push token only once per user session
                    if (pushRegisteredRef.current !== currentUser.uid) {
                        pushRegisteredRef.current = currentUser.uid;
                        registerForPushNotificationsAsync(currentUser.uid, 'clientProfiles');
                        if (role === 'trainer') {
                            registerForPushNotificationsAsync(currentUser.uid, 'trainerProfiles');
                        }
                    }

                    if (docSnap.exists()) {
                        setUserRoleState(role);
                    } else {
                        await setDoc(docRef, {
                            id: currentUser.uid,
                            name: currentUser.displayName || 'User',
                            email: currentUser.email,
                            createdAt: Timestamp.now(),
                        });
                        setUserRoleState(null);
                    }
                } catch (e) {
                    console.error("Error fetching user profile:", e);
                }
            } else {
                setUserRoleState(null);
                pushRegisteredRef.current = null;
            }

            if (isCurrent) setLoading(false);
        });
        return () => { isCurrent = false; unsubscribe(); };
    }, []);

    const signIn = async (email: string, pass: string) => {
        await signInWithEmailAndPassword(auth, email, pass);
    };

    const signUp = async (email: string, pass: string, name: string) => {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        // Create user profile in Firestore WITHOUT a role — role is chosen next
        await setDoc(doc(db, 'clientProfiles', result.user.uid), {
            id: result.user.uid,
            name,
            email,
            createdAt: Timestamp.now(),
            // role is intentionally omitted — set during role selection
        });
    };

    const setUserRole = async (role: 'client' | 'trainer') => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'clientProfiles', user.uid), { role });

            // Auto-create trainerProfiles entry so clients can look up trainer info
            if (role === 'trainer') {
                await setDoc(doc(db, 'trainerProfiles', user.uid), {
                    name: user.displayName || 'Coach',
                    email: user.email || '',
                    createdAt: Timestamp.now(),
                }, { merge: true });
            }

            setUserRoleState(role);
        } catch (e) {
            console.error('Error setting role:', e);
            throw e;
        }
    };

    const logOut = async () => {
        if (GoogleSignin) {
            await GoogleSignin.signOut().catch(() => { });
        }
        await signOut(auth);
        setUserRoleState(null);
    };

    const signInWithGoogle = async () => {
        if (!GoogleSignin) {
            Alert.alert(
                'Not Available',
                'Google Sign-In requires a Development Build. It does not work in Expo Go.'
            );
            return;
        }

        try {
            await GoogleSignin.hasPlayServices();
            const { data } = await GoogleSignin.signIn();

            if (data?.idToken) {
                const credential = GoogleAuthProvider.credential(data.idToken);
                await signInWithCredential(auth, credential);
            }
        } catch (error: any) {
            if (error.code === statusCodes?.SIGN_IN_CANCELLED) {

            } else if (error.code === statusCodes?.IN_PROGRESS) {

            } else if (error.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
                Alert.alert('Play Services Not Available', 'Please install/update Play Services.');
            } else {
                console.error('Google Sign-In Error:', error);
                Alert.alert('Error', 'Google Sign-In failed. Make sure you are using a development build.');
            }
        }
    };

    return (
        <AuthContext.Provider value={{ user, userRole, loading, signIn, signUp, logOut, signInWithGoogle, setUserRole }}>
            {children}
        </AuthContext.Provider>
    );
};
