import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GiftedChat, Bubble, InputToolbar, Send } from 'react-native-gifted-chat';
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { ArrowLeft, Send as SendIcon, Dumbbell, Bell } from 'lucide-react-native';
import { getDoc } from 'firebase/firestore';


// --- Mock Data ---
const MOCK_CHATS_DATA: Record<string, any[]> = {
    'mock1': [
        { _id: 'm1_1', text: 'Thanks for the workout plan! My legs are sore.', createdAt: new Date(Date.now() - 30 * 60000), user: { _id: 'client1', name: 'Aarav' } },
        { _id: 'm1_2', text: 'No pain, no gain! How was the volume on squats?', createdAt: new Date(Date.now() - 60 * 60000), user: { _id: 'trainer', name: 'You' } },
    ],
    'mock2': [
        { _id: 'm2_1', text: 'Can we reschedule our check-in call to Friday?', createdAt: new Date(Date.now() - 120 * 60000), user: { _id: 'client2', name: 'Emily' } },
    ],
    'mock3': [
        { _id: 'm3_1', text: 'Just hit 140kg on deadlift!! check the video', createdAt: new Date(Date.now() - 300 * 60000), user: { _id: 'client3', name: 'Marcus' } },
    ],
    'mock4': [
        { _id: 'm4_1', text: 'Is my form correct in the second set? Sent you the video.', createdAt: new Date(Date.now() - 1440 * 60000), user: { _id: 'client4', name: 'Priya' } },
        { _id: 'm4_2', text: 'I will take a look tonight!', createdAt: new Date(Date.now() - 1400 * 60000), user: { _id: 'trainer', name: 'You' } },
    ]
};

export default function ChatScreen() {
    const { user } = useAuth();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { chatId, title } = route.params;
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<any[]>([]);
    const [recipientId, setRecipientId] = useState<string | null>(null);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerShown: false, // Custom header
        });
    }, [navigation]);

    useEffect(() => {
        if (chatId.startsWith('mock') && user) {
            const rawParams = MOCK_CHATS_DATA[chatId] || [];
            const personalized = rawParams.map(m => ({
                ...m,
                user: m.user._id === 'trainer' ? { ...m.user, _id: user.uid } : m.user
            }));
            personalized.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            setMessages(personalized);
            return;
        }

        let isMounted = true;

        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!isMounted) return;
            setMessages(
                snapshot.docs.map(doc => ({
                    _id: doc.id,
                    createdAt: doc.data().createdAt?.toDate?.() || new Date(),
                    text: doc.data().text,
                    user: doc.data().user,
                    metadata: doc.data().metadata,
                }))
            );
        });

        if (user?.uid) {
            const chatRef = doc(db, 'chats', chatId);
            updateDoc(chatRef, {
                [`unreadCount.${user.uid}`]: 0
            }).catch(err => console.error("Failed to reset unread count:", err));
        }

        (async () => {
            const chatDoc = await getDoc(doc(db, 'chats', chatId));
            if (!isMounted) return;
            if (chatDoc.exists()) {
                const data = chatDoc.data();
                const other = (data.participants || []).find((p: string) => p !== user?.uid);
                if (other) setRecipientId(other);
            }
        })();

        return () => { isMounted = false; unsubscribe(); };
    }, [chatId, user?.uid]);

    const onSend = useCallback(async (newMessages = []) => {
        // INJECT MOCK SEND
        if (chatId.startsWith('mock')) {
            setMessages(previous => GiftedChat.append(previous, newMessages));
            return;
        }

        const { _id, createdAt, text, user: msgUser } = newMessages[0];

        try {
            // 1. Write the message to the messages sub-collection
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                _id,
                createdAt,
                text,
                user: msgUser,
            });

            // 2. Update the parent chat doc with lastMessage & timestamp for instant UI feedback.
            //    NOTE: unreadCount is NOT incremented here — the Cloud Function
            //    (functions/src/index.ts > onMessageCreated) handles both the
            //    unreadCount increment and push notification delivery.
            const chatRef = doc(db, 'chats', chatId);
            await updateDoc(chatRef, {
                lastMessage: text,
                updatedAt: createdAt,
            });
        } catch (error) {
            console.error('Error sending message:', error);
            Alert.alert('Send Failed', 'Your message could not be sent. Please try again.');
        }
    }, [chatId]);

    const renderBubble = useCallback((props: any) => {
        const { currentMessage } = props;
        const isPlanUpdate = currentMessage.metadata?.type === 'plan_update';
        const isPlanRequest = currentMessage.metadata?.type === 'plan_request';
        const isWorkoutSummary = currentMessage.metadata?.type === 'workout_summary';
        const isMyMessage = currentMessage.user?._id === user?.uid;

        const alignmentStyle = isMyMessage ? tw`justify-end` : tw`justify-start`;
        const cardBg = isMyMessage ? tw`bg-[#1e293b] border-[${COLORS.primary}]` : tw`bg-slate-800 border-white/10`;

        if (isPlanUpdate) {
            const planType = currentMessage.metadata?.planType || 'both';
            const planLabel = planType === 'meal' ? 'Meal Plan Update' : planType === 'exercise' ? 'Exercise Plan Update' : 'Plan Update';
            const planEmoji = planType === 'meal' ? '🍽️' : planType === 'exercise' ? '💪' : '🚀';
            const planDesc = planType === 'meal'
                ? 'Your coach has updated your meal plan.'
                : planType === 'exercise'
                    ? 'Your coach has updated your exercise plan.'
                    : 'Your coach has updated your meal & exercise plan.';
            const defaultTab = planType === 'meal' ? 'nutrition' : 'workout';

            return (
                <View style={[tw`mb-2 flex-row w-full px-2`, alignmentStyle]}>
                    <TouchableOpacity
                        onPress={() => {
                            if (isMyMessage) {
                                // Trainer taps → go directly to the plan editor
                                const cId = currentMessage.metadata?.clientId;
                                const cName = currentMessage.metadata?.clientName;
                                if (cId) {
                                    navigation.navigate('EditPlan', { clientId: cId, clientName: cName || 'Client' });
                                }
                            } else {
                                // Client taps → view their program
                                navigation.navigate('Program', { defaultTab });
                            }
                        }}
                        style={[tw`rounded-2xl overflow-hidden border w-64`, cardBg, isMyMessage ? tw`border-[${COLORS.primary}]/30` : tw`border-white/10`]}
                    >
                        {/* Header */}
                        <View style={tw`bg-[${COLORS.primary}]/10 p-3 border-b border-[${COLORS.primary}]/10 flex-row justify-between items-center`}>
                            <View style={tw`flex-row items-center gap-2`}>
                                <Dumbbell size={14} color={COLORS.primary} />
                                <Text style={tw`text-[${COLORS.primary}] font-bold text-xs uppercase tracking-wider`}>{planLabel}</Text>
                            </View>
                            <Text style={tw`text-slate-400 text-[10px]`}>
                                {currentMessage.createdAt ? new Date(currentMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </Text>
                        </View>

                        {/* Content */}
                        <View style={tw`p-4`}>
                            <Text style={tw`text-white font-bold text-lg mb-1 leading-6`}>{currentMessage.text || `New Program Available! ${planEmoji}`}</Text>
                            <Text style={tw`text-slate-400 text-xs`}>
                                {isMyMessage ? `You updated ${planType === 'both' ? 'the meal & exercise' : planType === 'meal' ? 'the meal' : 'the exercise'} plan.` : planDesc}
                            </Text>
                        </View>

                        {/* Footer */}
                        <View style={tw`bg-black/20 p-3 items-center border-t border-white/5`}>
                            <Text style={tw`text-white font-bold text-xs`}>{isMyMessage ? 'View Client Plan >' : 'View Program >'}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            );
        }

        if (isPlanRequest) {
            const requestType = currentMessage.metadata?.requestType || 'exercise';
            const day = currentMessage.metadata?.day || 'today';
            const typeEmoji = requestType === 'both' ? '💪🍽️' : requestType === 'exercise' ? '💪' : '🍽️';
            const typeLabel = requestType === 'both' ? 'Workout & Meal' : requestType === 'exercise' ? 'Workout' : 'Meal';

            return (
                <View style={[tw`mb-2 flex-row w-full px-2`, alignmentStyle]}>
                    <TouchableOpacity
                        onPress={() => {
                            // Trainer taps to go to client's plan tab for the requested day
                            if (!isMyMessage) {
                                const cId = currentMessage.metadata?.clientId;
                                const cName = currentMessage.metadata?.clientName;
                                if (cId) {
                                    navigation.navigate('ClientDetail', { client: { id: cId, name: cName || 'Client' }, initialTab: 'plan', selectedDay: day });
                                }
                            }
                            // Client sees their own sent message — no action needed
                        }}
                        activeOpacity={isMyMessage ? 1 : 0.7}
                        style={[tw`rounded-2xl overflow-hidden border w-64 bg-slate-800`, isMyMessage ? tw`border-amber-500/20` : tw`border-amber-500/40`]}
                    >
                        {/* Header */}
                        <View style={tw`bg-amber-500/10 p-3 border-b border-amber-500/10 flex-row justify-between items-center`}>
                            <View style={tw`flex-row items-center gap-2`}>
                                <Bell size={14} color="#f59e0b" />
                                <Text style={tw`text-amber-400 font-bold text-xs uppercase tracking-wider`}>Plan Request</Text>
                            </View>
                            <Text style={tw`text-slate-400 text-[10px]`}>
                                {currentMessage.createdAt ? new Date(currentMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </Text>
                        </View>

                        {/* Content */}
                        <View style={tw`p-4`}>
                            <Text style={tw`text-white font-bold text-base mb-2 leading-5`}>{currentMessage.text}</Text>
                            <View style={tw`flex-row items-center gap-2`}>
                                <View style={tw`bg-amber-500/10 px-2.5 py-1 rounded-full`}>
                                    <Text style={tw`text-amber-400 text-xs font-bold`}>{typeEmoji} {typeLabel}</Text>
                                </View>
                                <View style={tw`bg-white/5 px-2.5 py-1 rounded-full`}>
                                    <Text style={tw`text-slate-400 text-xs font-bold`}>{day}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Footer */}
                        <View style={tw`bg-black/20 p-3 items-center border-t border-white/5`}>
                            {isMyMessage ? (
                                <Text style={tw`text-slate-500 text-xs`}>Request Sent ✓</Text>
                            ) : (
                                <Text style={tw`text-amber-400 font-bold text-xs`}>Create Plan ›</Text>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>
            );
        }

        if (isWorkoutSummary) {
            return (
                <View style={[tw`mb-2 flex-row w-full px-2`, alignmentStyle]}>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('WorkoutView', {
                            workoutData: { id: currentMessage.metadata.workoutId },
                            workoutId: currentMessage.metadata.workoutId,
                            mode: 'review'
                        })}
                        style={[tw`rounded-2xl overflow-hidden border w-64`, cardBg, isMyMessage ? tw`border-[${COLORS.primary}]/30` : tw`border-white/10`]}
                    >
                        {/* Header */}
                        <View style={tw`bg-[${COLORS.primary}]/10 p-3 border-b border-[${COLORS.primary}]/10 flex-row justify-between items-center`}>
                            <View style={tw`flex-row items-center gap-2`}>
                                <Text style={tw`text-[${COLORS.primary}] font-bold text-xs uppercase tracking-wider`}>Workout Log</Text>
                            </View>
                            <Text style={tw`text-slate-400 text-[10px]`}>
                                {currentMessage.createdAt ? new Date(currentMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </Text>
                        </View>

                        {/* Content */}
                        <View style={tw`p-4`}>
                            <Text style={tw`text-white font-bold text-lg mb-1`}>{currentMessage.metadata.workoutTitle}</Text>
                            <View style={tw`flex-row items-center gap-3 mb-3`}>
                                <Text style={tw`text-slate-400 text-xs`}>⏱ {currentMessage.metadata.duration}</Text>
                                <Text style={tw`text-slate-400 text-xs`}>🏋️ {currentMessage.metadata.exercisesCount} Exercises</Text>
                            </View>

                            {/* Stats Grid */}
                            <View style={tw`flex-row gap-2`}>
                                <View style={tw`bg-black/20 flex-1 p-2 rounded-lg items-center`}>
                                    <Text style={tw`text-white font-bold`}>{currentMessage.metadata.totalLoad}kg</Text>
                                    <Text style={tw`text-slate-500 text-[8px] uppercase`}>Vol</Text>
                                </View>
                                {/* Add more stats if needed */}
                            </View>
                        </View>

                        {/* Footer */}
                        <View style={tw`bg-black/20 p-3 items-center border-t border-white/5`}>
                            <Text style={tw`text-white font-bold text-xs`}>View Details &gt;</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <Bubble
                {...props}
                wrapperStyle={{
                    right: {
                        backgroundColor: COLORS.primary,
                        borderBottomRightRadius: 0,
                        marginBottom: 4,
                        padding: 4,
                    },
                    left: {
                        backgroundColor: '#1e293b', // slate-800
                        borderBottomLeftRadius: 0,
                        marginBottom: 4,
                        padding: 4,
                    },
                }}
                textStyle={{
                    right: { color: '#000', fontSize: 15 },
                    left: { color: '#fff', fontSize: 15 },
                }}
                timeTextStyle={{
                    right: { color: 'rgba(0,0,0,0.5)' },
                    left: { color: '#94a3b8' }
                }}
            />
        );
    }, [user?.uid, navigation]);

    const renderSend = (props: any) => (
        <Send {...props}>
            <View style={tw`bg-[${COLORS.primary}] w-10 h-10 rounded-full items-center justify-center mr-2 mb-1`}>
                <SendIcon color="#000" size={20} fill="#000" />
            </View>
        </Send>
    );

    const renderInputToolbar = (props: any) => (
        <InputToolbar
            {...props}
            containerStyle={{
                backgroundColor: '#0f172a', // slate-900
                borderTopWidth: 0,
                paddingHorizontal: 10,
                paddingTop: 10,
                paddingBottom: Math.max(10, insets.bottom + 6),
            }}
            primaryStyle={{
                backgroundColor: '#1e293b', // slate-800
                borderRadius: 25,
                paddingHorizontal: 10,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#334155'
            }}
        />
    );

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Custom Header */}
            <View style={[tw`pb-4 px-4 bg-slate-900 border-b border-white/5 flex-row items-center shadow-lg shadow-black/50`, { paddingTop: Math.max(insets.top, 20) + 14 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`mr-3 p-2 -ml-2`}>
                    <ArrowLeft color="white" size={24} />
                </TouchableOpacity>

                <View style={tw`w-10 h-10 rounded-full bg-slate-700 items-center justify-center mr-3 border border-white/10 overflow-hidden`}>
                    <Text style={tw`text-white font-bold`}>{title ? title.charAt(0) : '?'}</Text>
                </View>

                <View>
                    <Text style={tw`text-white font-bold text-lg`}>{title || 'Chat'}</Text>
                    <View style={tw`flex-row items-center`}>
                        <View style={tw`w-2 h-2 rounded-full bg-green-500 mr-1.5`} />
                        <Text style={tw`text-green-500 text-xs font-bold`}>Online</Text>
                    </View>
                </View>
            </View>

            <KeyboardAvoidingView
                style={tw`flex-1`}
                behavior="padding"
                keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            >
                <GiftedChat
                    messages={messages}
                    onSend={(messages: any) => onSend(messages)}
                    user={{
                        _id: user?.uid || 'guest',
                        name: user?.displayName || 'User',
                        avatar: 'https://ui-avatars.com/api/?name=User&background=random',
                    }}
                    renderBubble={renderBubble}
                    renderSend={renderSend}
                    renderInputToolbar={renderInputToolbar}
                    minInputToolbarHeight={60}
                    isKeyboardInternallyHandled={false}
                />
            </KeyboardAvoidingView>
        </View>
    );
}
