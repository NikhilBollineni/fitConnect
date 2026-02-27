import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, Alert } from 'react-native';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { MessageCircle, Users } from 'lucide-react-native';

// ─── Constants ───
const DEMO_PARTICIPANT_IDS = ['demo_trainer', 'coach_mike'];
const DEMO_EMAIL = 'nikhilbollineni11@gmail.com';
const MOCK_CHATS = [
    { id: 'mock1', participants: ['trainer', 'client1'], participantNames: { client1: 'Aarav Patel' }, lastMessage: "Thanks for the workout plan! My legs are sore.", updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 30) }, unreadCount: { 'trainer': 1 } }, // 30m ago, 1 unread
    { id: 'mock2', participants: ['trainer', 'client2'], participantNames: { client2: 'Emily Chen' }, lastMessage: "Can we reschedule our check-in?", updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 2) }, unreadCount: {} }, // 2h ago
    { id: 'mock3', participants: ['trainer', 'client3'], participantNames: { client3: 'Marcus Johnson' }, lastMessage: "Just hit a new PR on bench!", updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 5) }, unreadCount: {} }, // 5h ago
    { id: 'mock4', participants: ['trainer', 'client4'], participantNames: { client4: 'Priya Sharma' }, lastMessage: "Video sent. Form check please?", updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24) }, unreadCount: { 'trainer': 2 } }, // 1d ago, 2 unread
];

export default function ChatListScreen() {
    const { user, userRole } = useAuth();
    const navigation = useNavigation<any>();
    const [chats, setChats] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                // Filter out any leftover demo/test chats
                .filter((chat: any) =>
                    !chat.participants.some((p: string) => DEMO_PARTICIPANT_IDS.includes(p))
                );

            // Client-side sort by most recent
            data.sort((a: any, b: any) =>
                (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
            );

            // INJECT MOCK CHATS FOR DEMO USER
            if (user.email === DEMO_EMAIL) {
                // Better approach: Since mock chats are just for display, let's map them to have the current user's UID
                const personalizedMocks = MOCK_CHATS.map(mc => ({
                    ...mc,
                    participants: [user.uid, mc.participants[1]], // [MyUID, 'client1']
                    unreadCount: mc.unreadCount ? { [user.uid]: mc.unreadCount['trainer'] || 0 } : {}
                }));

                // Combine and re-sort
                const combined = [...data, ...personalizedMocks];
                combined.sort((a: any, b: any) => {
                    const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : (a.updatedAt?.seconds * 1000 || 0);
                    const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : (b.updatedAt?.seconds * 1000 || 0);
                    return timeB - timeA;
                });
                setChats(combined);
            } else {
                setChats(data);
            }
        });

        return () => unsubscribe();
    }, [user]);

    // ─── Helpers ───
    const getOtherParticipantName = (chat: any): string => {
        if (chat.participantNames && user) {
            const otherId = chat.participants.find((id: string) => id !== user.uid);
            return chat.participantNames[otherId] || 'User';
        }
        return 'Chat';
    };

    const handleDeleteChat = (chatId: string, name: string) => {
        Alert.alert(
            'Delete Chat',
            `Are you sure you want to delete the conversation with ${name}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'chats', chatId));
                        } catch (_e) {
                            Alert.alert('Error', 'Failed to delete chat.');
                        }
                    },
                },
            ]
        );
    };

    // ─── Render ───
    const renderItem = ({ item }: { item: any }) => {
        const name = getOtherParticipantName(item);
        const time = item.updatedAt?.toDate?.()?.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
        const lastMessage = item.lastMessage || 'Start a conversation';

        return (
            <TouchableOpacity
                style={tw`flex-row items-center p-4 mx-4 mb-2 bg-slate-900/50 rounded-2xl active:bg-slate-800`}
                onPress={() => navigation.navigate('Chat', { chatId: item.id, title: name })}
                onLongPress={() => handleDeleteChat(item.id, name)}
            >
                <View style={tw`relative`}>
                    <View style={tw`w-14 h-14 rounded-full bg-slate-700 items-center justify-center border-2 border-slate-800`}>
                        <Text style={tw`text-white font-bold text-lg`}>{name.charAt(0)}</Text>
                    </View>
                    {/* Online Status Dot (Green) */}
                    <View style={tw`absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-slate-900`} />

                    {/* N3: Unread Badge */}
                    {(item.unreadCount?.[user?.uid] || 0) > 0 && (
                        <View style={tw`absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center border-2 border-slate-900 px-1`}>
                            <Text style={tw`text-white text-[10px] font-bold`}>
                                {item.unreadCount[user.uid] > 9 ? '9+' : item.unreadCount[user.uid]}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={tw`flex-1 ml-4 justify-center`}>
                    <View style={tw`flex-row justify-between items-baseline mb-1`}>
                        <Text style={tw`text-white font-bold text-base flex-1 mr-2`} numberOfLines={1}>
                            {name}
                        </Text>
                        <Text style={tw`text-slate-500 text-xs font-medium`}>{time}</Text>
                    </View>
                    <Text style={tw`text-slate-400 text-sm`} numberOfLines={1}>
                        {lastMessage}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            <View style={tw`pt-16 pb-6 px-6 bg-[${COLORS.background}] z-10`}>
                <View style={tw`flex-row items-center justify-between`}>
                    <Text style={tw`text-white text-3xl font-bold tracking-tight`}>Messages</Text>
                    <View style={tw`bg-slate-800 p-2.5 rounded-full border border-white/10`}>
                        <MessageCircle color={COLORS.primary} size={22} />
                    </View>
                </View>
                <Text style={tw`text-slate-400 text-sm mt-1`}>
                    {userRole === 'trainer' ? 'Connect with your clients' : 'Connect with your coach'}
                </Text>
            </View>

            {/* Chat List */}
            <FlatList
                data={chats}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={tw`pb-20 pt-2`}
                ListEmptyComponent={
                    <View style={tw`flex-1 justify-center items-center mt-32 opacity-80`}>
                        <View style={tw`w-20 h-20 bg-slate-800 rounded-full items-center justify-center mb-6`}>
                            <MessageCircle size={40} color="#64748b" />
                        </View>
                        <Text style={tw`text-white text-xl font-bold mb-2`}>No messages yet</Text>
                        <Text style={tw`text-slate-500 text-center px-10 leading-relaxed mb-8`}>
                            {userRole === 'trainer'
                                ? "Your conversations with clients will appear here."
                                : "Your conversations with your coach will appear here."}
                        </Text>

                        {userRole === 'trainer' && (
                            <TouchableOpacity
                                onPress={() => navigation.navigate('AddClient')}
                                style={tw`border border-[${COLORS.primary}]/50 bg-[${COLORS.primary}]/10 px-8 py-3 rounded-full flex-row items-center gap-2`}
                            >
                                <Users size={18} color={COLORS.primary} />
                                <Text style={tw`text-[${COLORS.primary}] font-bold tracking-wide uppercase text-xs`}>Add Your First Client</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                }
            />
        </View>
    );
}
