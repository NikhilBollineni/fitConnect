import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

// ──────────────────────────────────────────────
// usePresence — Updates the current user's presence
// Call this once in a top-level component (e.g. ChatContext)
// Writes to: presence/{userId}.lastSeen
// ──────────────────────────────────────────────
export function usePresence() {
    const { user } = useAuth();

    useEffect(() => {
        if (!user?.uid) return;

        const presenceRef = doc(db, 'presence', user.uid);

        const updatePresence = () => {
            setDoc(presenceRef, { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        };

        // Update immediately on mount
        updatePresence();

        // Update every 60 seconds while app is active
        const interval = setInterval(updatePresence, 60000);

        // Also update when app returns to foreground
        const handleAppState = (state: AppStateStatus) => {
            if (state === 'active') updatePresence();
        };
        const subscription = AppState.addEventListener('change', handleAppState);

        return () => {
            clearInterval(interval);
            subscription.remove();
        };
    }, [user?.uid]);
}

// ──────────────────────────────────────────────
// useUserPresence — Real-time presence of another user
// Returns: { isOnline, statusText, lastSeen }
// ──────────────────────────────────────────────
export function useUserPresence(userId: string | null) {
    const [lastSeen, setLastSeen] = useState<Date | null>(null);
    const [now, setNow] = useState(Date.now());

    // Re-render every 30s to keep "last seen X ago" text fresh
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!userId) return;

        const presenceRef = doc(db, 'presence', userId);
        const unsubscribe = onSnapshot(
            presenceRef,
            (snap) => {
                if (snap.exists()) {
                    const ts = snap.data().lastSeen;
                    if (ts?.toDate) setLastSeen(ts.toDate());
                }
            },
            () => {} // Silently ignore errors (doc may not exist yet)
        );

        return () => unsubscribe();
    }, [userId]);

    const isOnline = lastSeen ? (now - lastSeen.getTime()) < 2 * 60 * 1000 : false;

    const getStatusText = (): string => {
        if (!lastSeen) return 'Offline';
        if (isOnline) return 'Online';

        const diffMs = now - lastSeen.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `Last seen ${diffMin}m ago`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `Last seen ${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays === 1) return 'Last seen yesterday';
        return `Last seen ${diffDays}d ago`;
    };

    return { isOnline, lastSeen, statusText: getStatusText() };
}
