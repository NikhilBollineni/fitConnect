import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import {
    ArrowLeft, Calendar, TrendingUp, MessageSquare,
    CheckCircle2, XCircle, ChevronRight, MoreHorizontal, Send,
    Dumbbell, Clock, AlertCircle, ThumbsUp, Flame, Target, Layers, Clipboard, Lock, EyeOff
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { calculateStats, getMuscleSplit, AnalyticsStats } from '../utils/analyticsHelpers';
import WorkoutCalendar from '../components/WorkoutCalendar';

// --- Mock Data ---
const mt = (h: number) => ({ toDate: () => new Date(Date.now() - h * 3600000), seconds: Math.floor(Date.now() / 1000 - h * 3600) });
const MOCK_CLIENT_LOGS = [
    { id: 'log_m1_1', clientId: 'mock1', title: 'Hypertrophy Chest & Tri', createdAt: mt(2), duration: '65', totalVolume: 12450, status: 'completed', reviewed: false, exercises: [{ name: 'Bench Press', sets: [{ completed: true, weight: 80, reps: 8, weightUnit: 'kg' }, { completed: true, weight: 80, reps: 8, weightUnit: 'kg' }, { completed: true, weight: 80, reps: 7, weightUnit: 'kg' }] }, { name: 'Incline Dumbbell Press', sets: [{ completed: true, weight: 30, reps: 10, weightUnit: 'kg' }, { completed: true, weight: 30, reps: 10, weightUnit: 'kg' }] }, { name: 'Cable Flyes', sets: [{ completed: true, weight: 15, reps: 15, weightUnit: 'kg' }, { completed: true, weight: 15, reps: 15, weightUnit: 'kg' }] }] },
    { id: 'log_m1_2', clientId: 'mock1', title: 'Back & Biceps', createdAt: mt(50), duration: '60', totalVolume: 11000, status: 'completed', reviewed: true, exercises: [{ name: 'Pullups', sets: [{ completed: true, weight: 0, reps: 12, weightUnit: 'bw' }] }, { name: 'Rows', sets: [{ completed: true, weight: 60, reps: 10, weightUnit: 'kg' }] }] },
    { id: 'log_m2_1', clientId: 'mock2', title: 'Leg Day Blast', createdAt: mt(5), duration: '55', totalVolume: 8200, status: 'completed', reviewed: false, exercises: [{ name: 'Squat', sets: [{ completed: true, weight: 90, reps: 5, weightUnit: 'kg' }, { completed: true, weight: 95, reps: 5, weightUnit: 'kg' }] }, { name: 'Leg Press', sets: [{ completed: true, weight: 150, reps: 10, weightUnit: 'kg' }] }] },
    { id: 'log_m2_2', clientId: 'mock2', title: 'Upper Body Power', createdAt: mt(75), duration: '50', totalVolume: 7500, status: 'completed', reviewed: true, exercises: [{ name: 'OHP', sets: [{ completed: true, weight: 40, reps: 8, weightUnit: 'kg' }] }] },
    { id: 'log_m3_1', clientId: 'mock3', title: 'Deadlift PR Day', createdAt: mt(24), duration: '45', totalVolume: 6500, status: 'completed', reviewed: true, exercises: [{ name: 'Deadlift', sets: [{ completed: true, weight: 140, reps: 1, weightUnit: 'kg' }] }] },
    { id: 'log_m4_1', clientId: 'mock4', title: 'Full Body Recovery', createdAt: mt(70), duration: '30', totalVolume: 4000, status: 'completed', reviewed: false, exercises: [{ name: 'Stretching', sets: [] }] },
];

// --- Types ---
type Tab = 'Overview' | 'Sessions' | 'Private Notes' | 'Plan';
type ClientDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ClientDetail'>;

export default function ClientDetailScreen() {
    const navigation = useNavigation<ClientDetailScreenNavigationProp>();
    const route = useRoute();
    const { client, initialTab, selectedDay } = route.params as any; // Expecting complete client object or at least { id, name }
    const { user } = useAuth(); // Trainer's ID

    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (initialTab === 'plan') return 'Plan';
        if (initialTab === 'notes') return 'Private Notes';
        return 'Overview';
    });
    const [noteText, setNoteText] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Real Data State
    const [workoutLogs, setWorkoutLogs] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsStats | null>(null);
    const [muscleSplit, setMuscleSplit] = useState<{ name: string; count: number; percentage: number }[]>([]);

    // Fetch Client Data (Workouts)
    const fetchClientData = async () => {
        if (!client?.id) return;

        // INJECT MOCK LOGIC
        if (client.id.startsWith('mock')) {
            const mockLogs = MOCK_CLIENT_LOGS.filter(l => l.clientId === client.id);
            setWorkoutLogs(mockLogs);
            setAnalytics(calculateStats(mockLogs as any[]));
            setMuscleSplit(getMuscleSplit(mockLogs as any[]));
            setIsLoading(false);
            return;
        }

        try {
            const q = query(
                collection(db, 'workoutLogs'),
                where('clientId', '==', client.id),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Type: WorkoutLog[] ideally
            setWorkoutLogs(logs);

            // Calculate Analytics
            const stats = calculateStats(logs as any[]);
            setAnalytics(stats);

            const split = getMuscleSplit(logs as any[]);
            setMuscleSplit(split);

        } catch (error) {
            console.error("Error fetching client data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchClientData();
        }, [client?.id])
    );




    // --- Sub-Components ---

    // 1. Overview Tab
    const OverviewTab = () => {
        const lastWorkout = workoutLogs.length > 0 ? workoutLogs[0] : null;
        const needsReview = lastWorkout && !lastWorkout.reviewed && lastWorkout.status === 'completed';

        return (
            <ScrollView style={tw`flex-1`} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Needs Review Card */}
                {needsReview && (
                    <View style={tw`bg-orange-500/10 rounded-2xl p-5 border border-orange-500/30 mb-6 relative overflow-hidden`}>
                        <View style={tw`absolute top-0 right-0 bg-orange-500 px-3 py-1 rounded-bl-xl`}>
                            <Text style={tw`text-white text-[10px] font-bold`}>NEEDS REVIEW</Text>
                        </View>

                        <Text style={tw`text-orange-200 text-xs font-bold uppercase mb-1`}>
                            {lastWorkout.createdAt?.toDate ? formatDistanceToNow(lastWorkout.createdAt.toDate(), { addSuffix: true }) : 'Recently'}
                        </Text>
                        <Text style={tw`text-white text-xl font-bold mb-2`}>{lastWorkout.title}</Text>

                        <View style={tw`flex-row gap-4 mb-4`}>
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <Clock size={14} color="#fdba74" />
                                <Text style={tw`text-orange-100 text-xs`}>{lastWorkout.duration || 0}m</Text>
                            </View>
                            <View style={tw`flex-row items-center gap-1.5`}>
                                <Dumbbell size={14} color="#fdba74" />
                                <Text style={tw`text-orange-100 text-xs`}>{Math.round(lastWorkout.totalVolume || 0).toLocaleString()} kg</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => navigation.navigate('WorkoutView', {
                                workoutData: {
                                    id: lastWorkout.id,
                                    clientId: client.id,
                                    title: lastWorkout.title,
                                    exercises: lastWorkout.exercises,
                                    duration: lastWorkout.duration
                                },
                                mode: 'review'
                            })}
                            style={tw`bg-orange-500 py-3 rounded-xl items-center flex-row justify-center gap-2`}
                        >
                            <MessageSquare size={16} color="white" />
                            <Text style={tw`text-white font-bold text-sm`}>Review & Send Feedback</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Analytics KPI Cards */}
                {analytics && (
                    <View style={tw`flex-row gap-3 mb-6`}>
                        {/* Workouts */}
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                            <View style={tw`w-8 h-8 bg-blue-500/15 rounded-full items-center justify-center mb-2`}>
                                <Target size={16} color="#3b82f6" />
                            </View>
                            <Text style={tw`text-white text-xl font-bold`}>{analytics.totalWorkouts}</Text>
                            <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>Workouts</Text>
                        </View>

                        {/* Volume */}
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                            <View style={tw`w-8 h-8 bg-[${COLORS.primary}]/15 rounded-full items-center justify-center mb-2`}>
                                <Dumbbell size={16} color={COLORS.primary} />
                            </View>
                            <Text style={tw`text-white text-xl font-bold`}>{(analytics.totalVolume / 1000).toFixed(1)}k</Text>
                            <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>Vol (kg)</Text>
                        </View>

                        {/* Streak */}
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                            <View style={tw`w-8 h-8 bg-orange-500/15 rounded-full items-center justify-center mb-2`}>
                                <Flame size={16} color="#f97316" />
                            </View>
                            <Text style={tw`text-white text-xl font-bold`}>{analytics.streak} 🔥</Text>
                            <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>Streak</Text>
                        </View>
                    </View>
                )}

                {/* Workout Calendar */}
                <View style={tw`mb-6`}>
                    <WorkoutCalendar clientId={client.id} />
                </View>

                {/* Muscle Split Visualization */}
                {muscleSplit.length > 0 && (
                    <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-5 border border-white/5 mb-6`}>
                        <View style={tw`flex-row items-center gap-2 mb-4`}>
                            <Layers size={18} color={COLORS.primary} />
                            <Text style={tw`text-white font-bold text-base`}>Training Focus</Text>
                        </View>

                        <View style={tw`gap-3`}>
                            {muscleSplit.slice(0, 4).map((item, idx) => (
                                <View key={item.name}>
                                    <View style={tw`flex-row justify-between mb-1`}>
                                        <Text style={tw`text-slate-300 text-xs font-semibold`}>{item.name}</Text>
                                        <Text style={tw`text-slate-500 text-xs`}>{item.percentage}%</Text>
                                    </View>
                                    <View style={tw`h-2 bg-white/10 rounded-full overflow-hidden`}>
                                        <View style={[tw`h-full rounded-full`, { width: `${item.percentage}%`, backgroundColor: idx === 0 ? COLORS.primary : '#94a3b8' }]} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Recent Activity Header */}
                <Text style={tw`text-white font-bold text-lg mb-3`}>Recent Activity</Text>

                {workoutLogs.slice(0, 5).map((session) => (
                    <View key={session.id} style={tw`bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5 mb-3 flex-row items-center`}>
                        <View style={tw`mr-4`}>
                            <View style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center`}>
                                {session.status === 'completed' ? <CheckCircle2 size={18} color={COLORS.primary} /> : <Clock size={18} color="#94a3b8" />}
                            </View>
                        </View>
                        <View style={tw`flex-1`}>
                            <Text style={tw`text-white font-bold text-base`}>{session.title}</Text>
                            <Text style={tw`text-slate-400 text-xs`}>
                                {session.createdAt?.toDate ? formatDistanceToNow(session.createdAt.toDate(), { addSuffix: true }) : ''} • {session.totalVolume ? `${Math.round(session.totalVolume)} kg` : ''}
                            </Text>
                        </View>
                    </View>
                ))}

            </ScrollView>
        );
    };

    // 2. Sessions Tab (history)
    const SessionsTab = () => (
        <ScrollView style={tw`flex-1`} contentContainerStyle={{ paddingBottom: 100 }}>
            {workoutLogs.map((session) => (
                <View key={session.id} style={tw`bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5 mb-3 flex-row items-center`}>
                    <View style={tw`mr-4`}>
                        {session.status === 'completed' ? <CheckCircle2 size={24} color={COLORS.primary} /> :
                            <Clock size={24} color="#94a3b8" />}
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={tw`text-white font-bold text-base`}>{session.title}</Text>
                        <Text style={tw`text-slate-400 text-xs`}>
                            {session.createdAt?.toDate ? formatDistanceToNow(session.createdAt.toDate(), { addSuffix: true }) : ''} • {session.duration}m
                        </Text>
                    </View>
                    {session.status === 'completed' && (
                        <View style={tw`items-end`}>
                            {session.reviewed ? (
                                <View style={tw`flex-row items-center gap-1 bg-green-500/10 px-2 py-1 rounded`}>
                                    <ThumbsUp size={10} color="#4ade80" />
                                    <Text style={tw`text-green-400 text-[10px]`}>Reviewed</Text>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => navigation.navigate('WorkoutView', {
                                        workoutData: {
                                            id: session.id,
                                            clientId: client.id,
                                            title: session.title,
                                            exercises: session.exercises,
                                            duration: session.duration
                                        },
                                        mode: 'review'
                                    })}
                                    style={tw`bg-orange-500 px-3 py-1.5 rounded-lg`}
                                >
                                    <Text style={tw`text-white text-[10px] font-bold`}>Review</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            ))}
            {workoutLogs.length === 0 && (
                <Text style={tw`text-slate-500 text-center mt-10`}>No workouts logged yet.</Text>
            )}
        </ScrollView>
    );

    // 3. Private Notes Tab
    const NotesTab = () => {
        const [privateNotes, setPrivateNotes] = useState<any[]>([]);

        // Fetch Private Notes
        useFocusEffect(
            useCallback(() => {
                if (!user?.uid || !client?.id) return;

                const q = query(
                    collection(db, 'users', user.uid, 'clients', client.id, 'privateNotes'),
                    orderBy('createdAt', 'desc')
                );

                const unsubscribe = onSnapshot(q, (snapshot) => {
                    const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setPrivateNotes(notes);
                });

                return () => unsubscribe();
            }, [user?.uid, client?.id])
        );

        const savePrivateNote = async () => {
            if (!noteText.trim() || !user || !client?.id) return;
            try {
                await addDoc(collection(db, 'users', user.uid, 'clients', client.id, 'privateNotes'), {
                    content: noteText.trim(),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                setNoteText('');
            } catch (error) {
                console.error('Error saving private note:', error);
                Alert.alert('Error', 'Failed to save note.');
            }
        };

        return (
            <View style={tw`flex-1`}>
                {/* Privacy Banner */}
                <View style={tw`bg-yellow-500/10 p-3 rounded-xl mb-4 flex-row items-center gap-2 border border-yellow-500/20`}>
                    <EyeOff size={14} color="#eab308" />
                    <Text style={tw`text-yellow-500 text-xs flex-1`}>
                        These notes are private to you and hidden from the client.
                    </Text>
                </View>

                <ScrollView style={tw`flex-1`} contentContainerStyle={{ paddingBottom: 20 }}>
                    {privateNotes.map((note) => (
                        <View key={note.id} style={tw`bg-white/5 rounded-xl p-4 mb-3 border border-white/5`}>
                            <View style={tw`flex-row justify-between items-center mb-2`}>
                                <View style={tw`flex-row items-center gap-2`}>
                                    <View style={tw`w-1.5 h-1.5 rounded-full bg-[${COLORS.primary}]`} />
                                    <Text style={tw`text-slate-400 text-xs font-bold uppercase`}>
                                        {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                    </Text>
                                </View>
                                <Text style={tw`text-slate-500 text-[10px]`}>
                                    {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                            </View>
                            <Text style={tw`text-slate-200 text-sm leading-5`}>{note.content}</Text>
                        </View>
                    ))}

                    {privateNotes.length === 0 && (
                        <View style={tw`items-center justify-center mt-10 opacity-50`}>
                            <Clipboard size={40} color="#64748b" />
                            <Text style={tw`text-slate-500 text-center mt-4`}>No private notes yet.</Text>
                            <Text style={tw`text-slate-600 text-center text-xs mt-1`}>Keep track of progress, injuries, or goals here.</Text>
                        </View>
                    )}
                </ScrollView>

                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100}>
                    <View style={tw`pt-2`}>
                        <View style={tw`bg-white/5 rounded-xl p-2 border border-white/10`}>
                            <TextInput
                                style={tw`text-white p-3 min-h-[80px] text-base`}
                                placeholder="Write a private note..."
                                placeholderTextColor="#64748b"
                                value={noteText}
                                onChangeText={setNoteText}
                                multiline
                                textAlignVertical="top"
                            />
                            <View style={tw`flex-row justify-end mt-2`}>
                                <TouchableOpacity
                                    onPress={savePrivateNote}
                                    style={tw`bg-[${COLORS.primary}] px-4 py-2 rounded-lg flex-row items-center gap-2`}
                                >
                                    <Text style={tw`text-black font-bold text-xs`}>Save Note</Text>
                                    <CheckCircle2 size={14} color="black" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        );
    };

    // 4. Plan Tab (Editable)
    const PlanTab = () => (
        <ScrollView style={tw`flex-1`} contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={tw`items-center mt-10 px-6`}>
                {selectedDay && (
                    <View style={tw`bg-amber-500/10 border border-amber-500/20 px-5 py-3 rounded-2xl mb-6 flex-row items-center gap-3 w-full`}>
                        <Text style={tw`text-xl`}>📋</Text>
                        <View style={tw`flex-1`}>
                            <Text style={tw`text-amber-400 font-bold text-sm`}>Plan Requested</Text>
                            <Text style={tw`text-amber-400/70 text-xs mt-0.5`}>{client.name} needs a plan for {selectedDay}</Text>
                        </View>
                    </View>
                )}
                <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                    <Clipboard size={32} color={COLORS.primary} />
                </View>
                <Text style={tw`text-white font-bold text-xl mb-2`}>Manage Client Plan</Text>
                <Text style={tw`text-slate-400 text-center mb-8`}>
                    Update {client.name}'s diet and exercise program. Changes will notify them instantly.
                </Text>

                <TouchableOpacity
                    onPress={() => (navigation as any).navigate('EditPlan', { clientId: client.id, clientName: client.name, selectedDay })}
                    style={tw`w-full bg-[${COLORS.primary}] py-4 rounded-xl items-center flex-row justify-center gap-2`}
                >
                    <Layers size={20} color="black" />
                    <Text style={tw`text-black font-bold text-lg`}>{selectedDay ? `Edit Plan for ${selectedDay}` : 'Edit Current Plan'}</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );

    if (isLoading) {
        return (
            <View style={tw`flex-1 bg-[${COLORS.background}] items-center justify-center`}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}] pt-12 px-6`}>
            {/* Header */}
            <View style={tw`flex-row items-center justify-between mb-6`}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center`}>
                    <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <View style={tw`items-center`}>
                    <Text style={tw`text-white font-bold text-lg`}>{client?.name || 'Client'}</Text>
                    <Text style={tw`text-slate-400 text-xs`}>{client?.plan || 'No Plan'}</Text>
                </View>
                <TouchableOpacity style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center`}>
                    <MoreHorizontal size={20} color="white" />
                </TouchableOpacity>
            </View>

            {/* Tabs Selector */}
            <View style={tw`flex-row bg-white/5 p-1 rounded-xl mb-6`}>
                {(['Overview', 'Sessions', 'Private Notes', 'Plan'] as Tab[]).map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        onPress={() => setActiveTab(tab)}
                        style={tw`flex-1 py-2 items-center rounded-lg ${activeTab === tab ? `bg-[${COLORS.backgroundLight}] shadow-sm` : ''}`}
                    >
                        <Text style={tw`font-bold text-xs ${activeTab === tab ? 'text-white' : 'text-slate-500'}`}>
                            {tab === 'Private Notes' ? 'Private Notes' : tab}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Content Area */}
            <View style={tw`flex-1`}>
                {activeTab === 'Overview' && <OverviewTab />}
                {activeTab === 'Sessions' && <SessionsTab />}
                {activeTab === 'Private Notes' && <NotesTab />}
                {activeTab === 'Plan' && <PlanTab />}
            </View>
        </View>
    );
}
