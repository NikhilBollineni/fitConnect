import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GiftedChat, Bubble, InputToolbar, Send } from 'react-native-gifted-chat';
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { ArrowLeft, Send as SendIcon, Dumbbell, Bell, Calendar, Check, Pencil, CheckCheck } from 'lucide-react-native';
import { getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import DatePickerModal from '../components/DatePickerModal';
import { useUserPresence } from '../hooks/usePresence';


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
    const { chatId, title: paramTitle } = (route.params as any) || {};
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<any[]>([]);
    const [recipientId, setRecipientId] = useState<string | null>(null);
    const [resolvedTitle, setResolvedTitle] = useState<string>(paramTitle || '');

    // Presence & Read Receipts
    const [recipientLastRead, setRecipientLastRead] = useState<Date | null>(null);
    const presence = useUserPresence(recipientId);

    // Journey date picker state (lifted from renderBubble)
    const [showJourneyPicker, setShowJourneyPicker] = useState(false);
    const [journeyEditContext, setJourneyEditContext] = useState<{
        messageId: string;
        proposedDate: string;
        clientId: string;
    } | null>(null);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerShown: false, // Custom header
        });
    }, [navigation]);

    // Sync title from navigation params when they change
    useEffect(() => {
        if (paramTitle) setResolvedTitle(paramTitle);
    }, [paramTitle]);

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
                if (other) {
                    setRecipientId(other);
                    // Resolve chat title from participantNames if not provided via params
                    if (!paramTitle && data.participantNames?.[other]) {
                        setResolvedTitle(data.participantNames[other]);
                    }
                }
            }
        })();

        return () => { isMounted = false; unsubscribe(); };
    }, [chatId, user?.uid]);

    // ─── Read Receipts: listen for recipient's lastRead & update own lastRead ───
    useEffect(() => {
        if (!chatId || chatId.startsWith('mock') || !user?.uid) return;

        // Mark chat as read (update my lastRead timestamp)
        const chatRef = doc(db, 'chats', chatId);
        updateDoc(chatRef, {
            [`lastRead.${user.uid}`]: serverTimestamp(),
        }).catch(() => {});

        // Listen for the other user's lastRead
        const unsubscribe = onSnapshot(chatRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (recipientId && data.lastRead?.[recipientId]) {
                    const ts = data.lastRead[recipientId];
                    if (ts?.toDate) setRecipientLastRead(ts.toDate());
                }
            }
        }, () => {});

        return () => unsubscribe();
    }, [chatId, user?.uid, recipientId]);

    // Update lastRead whenever new messages arrive (user is viewing them)
    useEffect(() => {
        if (!chatId || chatId.startsWith('mock') || !user?.uid || messages.length === 0) return;
        const chatRef = doc(db, 'chats', chatId);
        updateDoc(chatRef, {
            [`lastRead.${user.uid}`]: serverTimestamp(),
        }).catch(() => {});
    }, [messages.length]);

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
                            workoutData: {
                                id: currentMessage.metadata.workoutId,
                                title: currentMessage.metadata.workoutTitle,
                            },
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

        // ─── JOURNEY DATE PROPOSAL CARD ───
        const isJourneyDateProposal = currentMessage.metadata?.type === 'journey_date_proposal';
        if (isJourneyDateProposal) {
            const proposedDate = currentMessage.metadata?.proposedDate;
            const proposedByRole = currentMessage.metadata?.proposedByRole;
            const clientId = currentMessage.metadata?.clientId;
            let displayDate = '';
            try { displayDate = format(new Date(proposedDate), 'MMMM d, yyyy'); } catch { displayDate = proposedDate; }

            const handleAcceptJourneyDate = async () => {
                if (!clientId || !user?.uid) return;
                try {
                    const profileRef = doc(db, 'clientProfiles', clientId);
                    await updateDoc(profileRef, {
                        journeyStartDate: Timestamp.fromDate(new Date(proposedDate)),
                        pendingJourneyDate: null,
                        journeyDateStatus: 'confirmed',
                    });
                    // Send confirmation message
                    const confirmText = `✅ I've confirmed ${displayDate} as our journey start date!`;
                    await addDoc(collection(db, 'chats', chatId, 'messages'), {
                        _id: Date.now().toString(),
                        text: confirmText,
                        user: { _id: user.uid, name: user.displayName || 'Client' },
                        createdAt: serverTimestamp(),
                    });
                    await updateDoc(doc(db, 'chats', chatId), { lastMessage: confirmText, updatedAt: serverTimestamp() });
                    Alert.alert('Confirmed!', `Journey start date set to ${displayDate}.`);
                } catch (error) {
                    console.error('Error accepting journey date:', error);
                    Alert.alert('Error', 'Failed to confirm date.');
                }
            };

            const handleEditJourneyDate = () => {
                setJourneyEditContext({ messageId: currentMessage._id, proposedDate, clientId });
                setShowJourneyPicker(true);
            };

            return (
                <View style={[tw`mb-2 flex-row w-full px-2`, alignmentStyle]}>
                    <View style={[tw`rounded-2xl overflow-hidden border w-64`, isMyMessage ? tw`bg-[#1e293b] border-purple-500/30` : tw`bg-slate-800 border-purple-500/20`]}>
                        {/* Header */}
                        <View style={tw`bg-purple-500/10 p-3 border-b border-purple-500/10 flex-row justify-between items-center`}>
                            <View style={tw`flex-row items-center gap-2`}>
                                <Calendar size={14} color="#c084fc" />
                                <Text style={tw`text-purple-400 font-bold text-xs uppercase tracking-wider`}>Journey Date</Text>
                            </View>
                            <Text style={tw`text-slate-400 text-[10px]`}>
                                {currentMessage.createdAt ? new Date(currentMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </Text>
                        </View>

                        {/* Content */}
                        <View style={tw`p-4`}>
                            <Text style={tw`text-white font-bold text-lg mb-1`}>📅 {displayDate}</Text>
                            <Text style={tw`text-slate-400 text-xs`}>
                                {isMyMessage
                                    ? (proposedByRole === 'trainer'
                                        ? 'You proposed this as the journey start date.'
                                        : 'You updated the journey start date.')
                                    : (proposedByRole === 'trainer'
                                        ? 'Your coach proposed this as your journey start date.'
                                        : `${currentMessage.metadata?.clientName || 'Client'} updated their journey start date.`)
                                }
                            </Text>
                        </View>

                        {/* Footer */}
                        {!isMyMessage && proposedByRole === 'trainer' ? (
                            <View style={tw`p-3 border-t border-white/5 flex-row gap-2`}>
                                <TouchableOpacity
                                    onPress={handleAcceptJourneyDate}
                                    style={tw`flex-1 bg-[${COLORS.primary}] py-2.5 rounded-xl items-center flex-row justify-center gap-1.5`}
                                >
                                    <Check size={14} color="black" />
                                    <Text style={tw`text-black font-bold text-xs`}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleEditJourneyDate}
                                    style={tw`flex-1 bg-white/5 border border-white/10 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5`}
                                >
                                    <Pencil size={12} color="#c084fc" />
                                    <Text style={tw`text-purple-400 font-bold text-xs`}>Edit</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={tw`bg-black/20 p-3 items-center border-t border-white/5`}>
                                <Text style={tw`text-purple-400 font-bold text-xs`}>
                                    {isMyMessage ? 'Proposal Sent ✓' : 'Date Updated ✓'}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            );
        }

        // ─── Read receipt ticks for sent messages ───
        const isRight = currentMessage.user?._id === user?.uid;
        const msgTime = currentMessage.createdAt instanceof Date
            ? currentMessage.createdAt.getTime()
            : new Date(currentMessage.createdAt).getTime();
        const isSeen = isRight && recipientLastRead && recipientLastRead.getTime() >= msgTime;

        return (
            <View>
                <Bubble
                    {...props}
                    wrapperStyle={{
                        right: {
                            backgroundColor: COLORS.primary,
                            borderRadius: 18,
                            borderBottomRightRadius: 4,
                            marginBottom: 2,
                            paddingHorizontal: 2,
                            paddingVertical: 2,
                        },
                        left: {
                            backgroundColor: '#1e293b',
                            borderRadius: 18,
                            borderBottomLeftRadius: 4,
                            marginBottom: 2,
                            paddingHorizontal: 2,
                            paddingVertical: 2,
                        },
                    }}
                    textStyle={{
                        right: { color: '#000', fontSize: 15, lineHeight: 20 },
                        left: { color: '#f1f5f9', fontSize: 15, lineHeight: 20 },
                    }}
                    timeTextStyle={{
                        right: { color: 'rgba(0,0,0,0.45)', fontSize: 10 },
                        left: { color: '#64748b', fontSize: 10 },
                    }}
                    renderTicks={(message: any) => {
                        if (message.user?._id !== user?.uid) return null;
                        const mTime = message.createdAt instanceof Date
                            ? message.createdAt.getTime()
                            : new Date(message.createdAt).getTime();
                        const seen = recipientLastRead && recipientLastRead.getTime() >= mTime;
                        return (
                            <View style={tw`mr-1 mb-0.5`}>
                                <CheckCheck size={14} color={seen ? '#000' : 'rgba(0,0,0,0.3)'} />
                            </View>
                        );
                    }}
                />
            </View>
        );
    }, [user?.uid, navigation, recipientLastRead]);

    const renderSend = (props: any) => (
        <Send {...props} containerStyle={{ justifyContent: 'center' }}>
            <View style={{
                backgroundColor: COLORS.primary,
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 6,
            }}>
                <SendIcon color="#000" size={18} fill="#000" />
            </View>
        </Send>
    );

    const renderInputToolbar = (props: any) => (
        <InputToolbar
            {...props}
            containerStyle={{
                backgroundColor: COLORS.backgroundLight,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.05)',
                paddingHorizontal: 8,
                paddingTop: 8,
                paddingBottom: Math.max(8, insets.bottom + 4),
            }}
            primaryStyle={{
                backgroundColor: '#0f172a',
                borderRadius: 24,
                paddingHorizontal: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
            }}
        />
    );

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Custom Header */}
            <View style={[tw`pb-4 px-4 bg-[${COLORS.backgroundLight}] border-b border-white/5 flex-row items-center`, { paddingTop: Math.max(insets.top, 20) + 14 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`mr-3 p-2 -ml-2`}>
                    <ArrowLeft color="white" size={22} />
                </TouchableOpacity>

                <View style={tw`relative`}>
                    <View style={tw`w-11 h-11 rounded-full bg-slate-700 items-center justify-center mr-3 border border-white/10`}>
                        <Text style={tw`text-white font-bold text-lg`}>{resolvedTitle ? resolvedTitle.charAt(0).toUpperCase() : '?'}</Text>
                    </View>
                    {/* Real presence dot */}
                    <View style={[
                        tw`absolute bottom-0 right-2.5 w-3 h-3 rounded-full border-2`,
                        { borderColor: COLORS.backgroundLight },
                        presence.isOnline ? tw`bg-green-500` : tw`bg-slate-500`,
                    ]} />
                </View>

                <View>
                    <Text style={tw`text-white font-bold text-base`}>{resolvedTitle || 'Chat'}</Text>
                    <Text style={[
                        tw`text-xs font-medium`,
                        presence.isOnline ? tw`text-green-400` : tw`text-slate-500`,
                    ]}>
                        {presence.statusText}
                    </Text>
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
                    }}
                    renderBubble={renderBubble}
                    renderSend={renderSend}
                    renderInputToolbar={renderInputToolbar}
                    minInputToolbarHeight={56}
                />
            </KeyboardAvoidingView>

            {/* Journey Date Picker Modal (for editing proposed date) */}
            <DatePickerModal
                visible={showJourneyPicker}
                onClose={() => { setShowJourneyPicker(false); setJourneyEditContext(null); }}
                onSelect={async (date) => {
                    if (!journeyEditContext || !user?.uid) return;
                    try {
                        const { clientId } = journeyEditContext;
                        const profileRef = doc(db, 'clientProfiles', clientId);
                        await updateDoc(profileRef, {
                            journeyStartDate: Timestamp.fromDate(date),
                            pendingJourneyDate: null,
                            journeyDateStatus: 'confirmed',
                        });
                        // Send update message
                        const formattedDate = format(date, 'MMMM d, yyyy');
                        const updateText = `📅 I've updated my journey start date to ${formattedDate}.`;
                        await addDoc(collection(db, 'chats', chatId, 'messages'), {
                            _id: Date.now().toString(),
                            text: updateText,
                            user: { _id: user.uid, name: user.displayName || 'Client' },
                            createdAt: serverTimestamp(),
                            metadata: {
                                type: 'journey_date_proposal',
                                proposedDate: date.toISOString(),
                                proposedBy: user.uid,
                                proposedByRole: 'client',
                                clientId,
                                clientName: user.displayName || 'Client',
                            },
                        });
                        await updateDoc(doc(db, 'chats', chatId), { lastMessage: updateText, updatedAt: serverTimestamp() });
                        Alert.alert('Updated!', `Journey start date changed to ${formattedDate}.`);
                    } catch (error) {
                        console.error('Error updating journey date:', error);
                        Alert.alert('Error', 'Failed to update date.');
                    }
                    setJourneyEditContext(null);
                }}
                initialDate={journeyEditContext?.proposedDate ? new Date(journeyEditContext.proposedDate) : new Date()}
                title="Edit Journey Start Date"
                maxDate={new Date()}
            />
        </View>
    );
}
