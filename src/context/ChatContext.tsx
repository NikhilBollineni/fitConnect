import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { usePresence } from '../hooks/usePresence';

interface ChatContextType {
    totalUnreadCount: number;
    unreadCounts: Record<string, number>;
}

const ChatContext = createContext<ChatContextType>({
    totalUnreadCount: 0,
    unreadCounts: {},
});

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

    // Keep current user's presence alive while app is running
    usePresence();

    useEffect(() => {
        setTotalUnreadCount(0);
        setUnreadCounts({});

        if (!user) return;

        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let total = 0;
            const counts: Record<string, number> = {};

            snapshot.docs.forEach(chatDoc => {
                const data = chatDoc.data();
                const count = data.unreadCount?.[user.uid] || 0;
                if (count > 0) {
                    total += count;
                    counts[chatDoc.id] = count;
                }
            });

            setTotalUnreadCount(total);
            setUnreadCounts(counts);
        }, (error) => {
            console.error('[ChatContext] Error listening to chat updates:', error);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    return (
        <ChatContext.Provider value={{ totalUnreadCount, unreadCounts }}>
            {children}
        </ChatContext.Provider>
    );
};
