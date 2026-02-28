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
    Dumbbell, Clock, AlertCircle, ThumbsUp, Flame, Target, Layers, Clipboard, Lock, EyeOff,
    Utensils, Plus, Trash2, Save, Pencil
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { calculateStats, getMuscleSplit, AnalyticsStats } from '../utils/analyticsHelpers';
import WorkoutCalendar from '../components/WorkoutCalendar';
import DatePickerModal from '../components/DatePickerModal';
import { sendJourneyDateMessage } from '../utils/journeyDate';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
    const { client, initialTab, selectedDay } = (route.params as any) || {}; // Expecting complete client object or at least { id, name }
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

    // Plan Tab State
    const [planSelectedDay, setPlanSelectedDay] = useState(new Date().toLocaleDateString('en-US', { weekday: 'long' }));
    const [planActiveTab, setPlanActiveTab] = useState<'workout' | 'nutrition'>('workout');
    const [planEditMode, setPlanEditMode] = useState(false);
    const [clientPlan, setClientPlan] = useState<{ exercisePlan: any; dietPlan: any; preferredWeightUnit: string } | null>(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [planSaving, setPlanSaving] = useState(false);
    const [editExercises, setEditExercises] = useState<any[]>([]);
    const [editMeals, setEditMeals] = useState<any>({ breakfast: '', lunch: '', dinner: '', snacks: '' });

    // Journey Date State
    const [clientJourneyDate, setClientJourneyDate] = useState<Date | null>(null);
    const [clientPendingJourney, setClientPendingJourney] = useState<Date | null>(null);
    const [clientJourneyStatus, setClientJourneyStatus] = useState<string>('none');
    const [clientStatus, setClientStatus] = useState<string>('');
    const [showJourneyPicker, setShowJourneyPicker] = useState(false);

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
                orderBy('createdAt', 'desc'),
                limit(100)
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

    // Fetch Client Plan (exercisePlan + dietPlan) + Journey Date
    const fetchClientPlan = async () => {
        if (!client?.id) return;
        setPlanLoading(true);
        try {
            const docRef = doc(db, 'clientProfiles', client.id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setClientPlan({
                    exercisePlan: data.exercisePlan || {},
                    dietPlan: data.dietPlan || {},
                    preferredWeightUnit: data.preferredWeightUnit || 'kg',
                });
                // Journey date fields
                setClientJourneyDate(data.journeyStartDate?.toDate?.() || null);
                setClientPendingJourney(data.pendingJourneyDate?.toDate?.() || null);
                setClientJourneyStatus(data.journeyDateStatus || 'none');
                setClientStatus(data.status || '');
            }
        } catch (error) {
            console.error("Error fetching client plan:", error);
        } finally {
            setPlanLoading(false);
        }
    };

    // Fetch journey date on Overview tab, and plan on Plan tab
    useEffect(() => {
        if (activeTab === 'Plan' || activeTab === 'Overview') fetchClientPlan();
    }, [activeTab]);




    // --- Journey Date Handler ---
    const handleSetJourneyDate = async (date: Date) => {
        if (!client?.id || !user?.uid) return;
        try {
            const profileRef = doc(db, 'clientProfiles', client.id);
            await updateDoc(profileRef, {
                pendingJourneyDate: Timestamp.fromDate(date),
                journeyDateStatus: 'pending',
                journeyDateProposedBy: user.uid,
            });
            setClientPendingJourney(date);
            setClientJourneyStatus('pending');

            // Send chat notification only if client has claimed the profile
            if (clientStatus === 'active') {
                await sendJourneyDateMessage(
                    { uid: user.uid, displayName: user.displayName },
                    client.id,
                    date,
                    client.id,
                    client.name || 'Client',
                    'trainer'
                );
            }

            Alert.alert(
                'Journey Date Set',
                clientStatus === 'active'
                    ? `${client.name} has been notified to confirm ${format(date, 'MMMM d, yyyy')} as their journey start date.`
                    : `Journey date set to ${format(date, 'MMMM d, yyyy')}. ${client.name} will be asked to confirm when they claim their profile.`
            );
        } catch (error) {
            console.error('Error setting journey date:', error);
            Alert.alert('Error', 'Failed to set journey date.');
        }
    };

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

                {/* Journey Start Date Card */}
                <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-5 border border-white/5 mb-6`}>
                    <View style={tw`flex-row items-center justify-between mb-3`}>
                        <View style={tw`flex-row items-center gap-2`}>
                            <View style={tw`w-8 h-8 bg-purple-500/15 rounded-full items-center justify-center`}>
                                <Calendar size={16} color="#c084fc" />
                            </View>
                            <Text style={tw`text-white font-bold text-base`}>Journey</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowJourneyPicker(true)}
                            style={tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10`}
                        >
                            <Pencil size={12} color={COLORS.primary} />
                            <Text style={tw`text-[${COLORS.primary}] text-xs font-bold`}>
                                {clientJourneyStatus === 'none' && !clientPendingJourney ? 'Set Date' : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {clientJourneyStatus === 'confirmed' && clientJourneyDate ? (
                        <View>
                            <Text style={tw`text-white text-2xl font-bold`}>
                                {differenceInDays(new Date(), clientJourneyDate)} <Text style={tw`text-slate-500 text-sm font-normal`}>days</Text>
                            </Text>
                            <Text style={tw`text-slate-400 text-xs mt-1`}>
                                Started {format(clientJourneyDate, 'MMMM d, yyyy')}
                            </Text>
                        </View>
                    ) : clientJourneyStatus === 'pending' && clientPendingJourney ? (
                        <View style={tw`bg-amber-500/10 rounded-xl px-3 py-2.5 border border-amber-500/20`}>
                            <Text style={tw`text-amber-400 text-xs font-bold`}>
                                Pending confirmation: {format(clientPendingJourney, 'MMMM d, yyyy')}
                            </Text>
                            <Text style={tw`text-amber-400/60 text-[10px] mt-0.5`}>
                                Waiting for {client.name} to accept
                            </Text>
                        </View>
                    ) : (
                        <Text style={tw`text-slate-500 text-sm`}>No journey date set yet</Text>
                    )}
                </View>

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

    // 4. Plan Tab — Day selector + Workout/Nutrition toggle + View/Edit
    const PlanTab = () => {
        const dailyExercises = clientPlan?.exercisePlan?.[planSelectedDay] || [];
        const dailyMeals = clientPlan?.dietPlan?.[planSelectedDay];
        const weightUnit = clientPlan?.preferredWeightUnit || 'kg';

        const enterEditMode = () => {
            if (planActiveTab === 'workout') {
                setEditExercises(
                    dailyExercises.length > 0
                        ? dailyExercises.map((ex: any) => ({
                            name: ex.name || '', sets: String(ex.sets || ''),
                            reps: String(ex.reps || ''), weight: String(ex.weight || ''),
                            notes: String(ex.notes || ''),
                        }))
                        : [{ name: '', sets: '', reps: '', weight: '', notes: '' }]
                );
            } else {
                setEditMeals(dailyMeals ? { ...dailyMeals } : { breakfast: '', lunch: '', dinner: '', snacks: '' });
            }
            setPlanEditMode(true);
        };

        const cancelEdit = () => setPlanEditMode(false);

        const handlePlanSave = async () => {
            if (!client?.id) return;
            setPlanSaving(true);
            try {
                const updates: any = { updatedAt: serverTimestamp() };

                if (planActiveTab === 'workout') {
                    const validExercises = editExercises
                        .filter((ex: any) => ex.name.trim())
                        .map((ex: any) => ({
                            name: ex.name.trim(),
                            sets: parseInt(ex.sets) || 0,
                            reps: parseInt(ex.reps) || 0,
                            weight: ex.weight.toString().trim(),
                            notes: (ex.notes || '').toString().trim(),
                        }));
                    const updatedPlan = { ...(clientPlan?.exercisePlan || {}) };
                    if (validExercises.length > 0) {
                        updatedPlan[planSelectedDay] = validExercises;
                    } else {
                        delete updatedPlan[planSelectedDay];
                    }
                    updates.exercisePlan = updatedPlan;
                } else {
                    const updatedDiet = { ...(clientPlan?.dietPlan || {}) };
                    const hasMealContent = editMeals.breakfast?.trim() || editMeals.lunch?.trim() || editMeals.dinner?.trim() || editMeals.snacks?.trim();
                    if (hasMealContent) {
                        updatedDiet[planSelectedDay] = editMeals;
                    } else {
                        delete updatedDiet[planSelectedDay];
                    }
                    updates.dietPlan = updatedDiet;
                }

                await updateDoc(doc(db, 'clientProfiles', client.id), updates);

                // Send notification in chat
                if (user) {
                    const messageText = planActiveTab === 'workout'
                        ? `I've updated your ${planSelectedDay} workout plan! 💪`
                        : `I've updated your ${planSelectedDay} meal plan! 🍽️`;

                    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
                    const chatsSnap = await getDocs(chatsQuery);
                    const chatDoc = chatsSnap.docs.find(d => (d.data().participants || []).includes(client.id));

                    let targetChatId = chatDoc?.id;
                    if (!targetChatId) {
                        const newChat = await addDoc(collection(db, 'chats'), {
                            participants: [user.uid, client.id],
                            participantNames: { [user.uid]: user.displayName || 'Coach', [client.id]: client.name },
                            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                            lastMessage: messageText, unreadCount: { [user.uid]: 0, [client.id]: 0 }
                        });
                        targetChatId = newChat.id;
                    }

                    if (targetChatId) {
                        await addDoc(collection(db, 'chats', targetChatId, 'messages'), {
                            text: messageText,
                            user: { _id: user.uid, name: user.displayName || 'Coach' },
                            createdAt: serverTimestamp(),
                            metadata: { type: 'plan_update', planType: planActiveTab === 'workout' ? 'exercise' : 'meal', clientId: client.id, clientName: client.name }
                        });
                        await updateDoc(doc(db, 'chats', targetChatId), { lastMessage: messageText, updatedAt: serverTimestamp() });
                    }
                }

                await fetchClientPlan();
                setPlanEditMode(false);
                Alert.alert('Saved!', `${client.name}'s ${planSelectedDay} ${planActiveTab === 'workout' ? 'workout' : 'meal'} plan has been updated.`);
            } catch (error) {
                console.error('Error saving plan:', error);
                Alert.alert('Error', 'Failed to save plan.');
            } finally {
                setPlanSaving(false);
            }
        };

        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tw`flex-1`} keyboardVerticalOffset={120}>
                <ScrollView style={tw`flex-1`} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                    {/* Plan Requested Banner */}
                    {selectedDay && (
                        <View style={tw`bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-2xl mb-4 flex-row items-center gap-3`}>
                            <Text style={tw`text-xl`}>📋</Text>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-amber-400 font-bold text-sm`}>Plan Requested</Text>
                                <Text style={tw`text-amber-400/70 text-xs mt-0.5`}>{client.name} needs a plan for {selectedDay}</Text>
                            </View>
                        </View>
                    )}

                    {/* Day Selector */}
                    <View style={tw`mb-4`}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
                            {DAYS.map((day) => {
                                const isSelected = planSelectedDay === day;
                                return (
                                    <TouchableOpacity
                                        key={day}
                                        onPress={() => { setPlanSelectedDay(day); setPlanEditMode(false); }}
                                        style={[
                                            tw`w-11 h-14 rounded-2xl items-center justify-center border`,
                                            isSelected
                                                ? tw`bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                                : tw`bg-white/5 border-white/5`
                                        ]}
                                    >
                                        <Text style={[tw`text-[10px] font-bold mb-0.5`, isSelected ? tw`text-black` : tw`text-slate-500`]}>
                                            {day.slice(0, 3)}
                                        </Text>
                                        <Text style={[tw`text-base font-bold`, isSelected ? tw`text-black` : tw`text-white`]}>
                                            {day.charAt(0)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Workout / Nutrition Toggle */}
                    <View style={tw`flex-row mb-4 bg-white/5 p-1 rounded-2xl`}>
                        <TouchableOpacity
                            onPress={() => { setPlanActiveTab('workout'); setPlanEditMode(false); }}
                            style={[
                                tw`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl`,
                                planActiveTab === 'workout' ? tw`bg-slate-700` : tw`bg-transparent`
                            ]}
                        >
                            <Dumbbell size={15} color={planActiveTab === 'workout' ? 'white' : '#64748b'} />
                            <Text style={[tw`font-bold text-sm`, planActiveTab === 'workout' ? tw`text-white` : tw`text-slate-500`]}>Workout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { setPlanActiveTab('nutrition'); setPlanEditMode(false); }}
                            style={[
                                tw`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl`,
                                planActiveTab === 'nutrition' ? tw`bg-slate-700` : tw`bg-transparent`
                            ]}
                        >
                            <Utensils size={15} color={planActiveTab === 'nutrition' ? 'white' : '#64748b'} />
                            <Text style={[tw`font-bold text-sm`, planActiveTab === 'nutrition' ? tw`text-white` : tw`text-slate-500`]}>Nutrition</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Content Area */}
                    {planLoading ? (
                        <ActivityIndicator color={COLORS.primary} style={tw`mt-10`} />
                    ) : planActiveTab === 'workout' ? (
                        /* ─── WORKOUT CONTENT ─── */
                        <View>
                            <View style={tw`flex-row justify-between items-center mb-4`}>
                                <Text style={tw`text-white font-bold text-lg`}>{planSelectedDay}'s Routine</Text>
                                <TouchableOpacity
                                    onPress={planEditMode ? cancelEdit : enterEditMode}
                                    style={tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${planEditMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 border border-white/10'}`}
                                >
                                    {planEditMode ? <XCircle size={14} color="#ef4444" /> : <Pencil size={14} color={COLORS.primary} />}
                                    <Text style={tw`text-xs font-bold ${planEditMode ? 'text-red-400' : `text-[${COLORS.primary}]`}`}>
                                        {planEditMode ? 'Cancel' : 'Edit'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {planEditMode ? (
                                /* ── Edit Mode ── */
                                <View>
                                    {editExercises.map((exercise: any, idx: number) => (
                                        <View key={idx} style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3`}>
                                            <View style={tw`flex-row items-center mb-2`}>
                                                <View style={tw`w-6 h-6 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center mr-2`}>
                                                    <Text style={tw`text-[${COLORS.primary}] font-bold text-[10px]`}>{idx + 1}</Text>
                                                </View>
                                                <TextInput
                                                    style={tw`flex-1 bg-white/5 text-white px-3 py-2 rounded-lg font-bold text-sm mr-2`}
                                                    placeholder="Exercise Name"
                                                    placeholderTextColor="#555"
                                                    value={exercise.name}
                                                    onChangeText={(v) => {
                                                        const updated = [...editExercises];
                                                        updated[idx] = { ...updated[idx], name: v };
                                                        setEditExercises(updated);
                                                    }}
                                                />
                                                {editExercises.length > 1 && (
                                                    <TouchableOpacity
                                                        onPress={() => setEditExercises(editExercises.filter((_: any, i: number) => i !== idx))}
                                                        style={tw`w-8 h-8 rounded-lg bg-red-500/10 items-center justify-center`}
                                                    >
                                                        <Trash2 size={14} color="#ef4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            <View style={tw`flex-row gap-2 mb-1.5`}>
                                                <View style={tw`flex-1`}>
                                                    <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>SETS</Text>
                                                    <TextInput
                                                        style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                                                        placeholder="3"
                                                        placeholderTextColor="#444"
                                                        keyboardType="numeric"
                                                        value={exercise.sets}
                                                        onChangeText={(v) => {
                                                            const updated = [...editExercises];
                                                            updated[idx] = { ...updated[idx], sets: v };
                                                            setEditExercises(updated);
                                                        }}
                                                    />
                                                </View>
                                                <View style={tw`flex-1`}>
                                                    <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>REPS</Text>
                                                    <TextInput
                                                        style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                                                        placeholder="12"
                                                        placeholderTextColor="#444"
                                                        keyboardType="numeric"
                                                        value={exercise.reps}
                                                        onChangeText={(v) => {
                                                            const updated = [...editExercises];
                                                            updated[idx] = { ...updated[idx], reps: v };
                                                            setEditExercises(updated);
                                                        }}
                                                    />
                                                </View>
                                                <View style={tw`flex-1`}>
                                                    <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>WT ({weightUnit.toUpperCase()})</Text>
                                                    <TextInput
                                                        style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                                                        placeholder={`20${weightUnit}`}
                                                        placeholderTextColor="#444"
                                                        value={exercise.weight}
                                                        onChangeText={(v) => {
                                                            const updated = [...editExercises];
                                                            updated[idx] = { ...updated[idx], weight: v };
                                                            setEditExercises(updated);
                                                        }}
                                                    />
                                                </View>
                                            </View>

                                            <TextInput
                                                style={tw`bg-white/5 text-white px-3 py-2 rounded-lg text-xs`}
                                                placeholder="Notes (e.g. tempo, rest)"
                                                placeholderTextColor="#444"
                                                value={exercise.notes}
                                                onChangeText={(v) => {
                                                    const updated = [...editExercises];
                                                    updated[idx] = { ...updated[idx], notes: v };
                                                    setEditExercises(updated);
                                                }}
                                            />
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        onPress={() => setEditExercises([...editExercises, { name: '', sets: '', reps: '', weight: '', notes: '' }])}
                                        style={tw`flex-row items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-white/10 mb-4`}
                                    >
                                        <Plus size={14} color={COLORS.muted} />
                                        <Text style={tw`text-slate-400 text-xs font-bold`}>Add Exercise</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={handlePlanSave}
                                        disabled={planSaving}
                                        style={tw`bg-[${COLORS.primary}] py-4 rounded-xl items-center flex-row justify-center gap-2`}
                                    >
                                        {planSaving ? <ActivityIndicator size="small" color="black" /> : <Save size={18} color="black" />}
                                        <Text style={tw`text-black font-bold text-base`}>{planSaving ? 'Saving...' : 'Save Workout Plan'}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : dailyExercises.length > 0 ? (
                                /* ── View Mode — Has Exercises ── */
                                <View style={tw`gap-3`}>
                                    {dailyExercises.map((ex: any, idx: number) => (
                                        <View key={idx} style={[tw`flex-row items-center gap-4 p-4 rounded-2xl`, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                            <View style={[tw`w-10 h-10 rounded-xl items-center justify-center`, { backgroundColor: `${COLORS.primary}1F` }]}>
                                                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 14 }}>{idx + 1}</Text>
                                            </View>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`text-white font-bold text-base mb-1`}>{ex.name}</Text>
                                                <View style={tw`flex-row gap-3`}>
                                                    <View style={tw`bg-white/5 px-2 py-1 rounded-lg`}>
                                                        <Text style={tw`text-slate-400 text-xs`}>{ex.sets} Sets</Text>
                                                    </View>
                                                    <View style={tw`bg-white/5 px-2 py-1 rounded-lg`}>
                                                        <Text style={tw`text-slate-400 text-xs`}>{ex.reps} Reps</Text>
                                                    </View>
                                                    {ex.weight && (
                                                        <View style={tw`bg-white/5 px-2 py-1 rounded-lg`}>
                                                            <Text style={tw`text-slate-400 text-xs`}>
                                                                {ex.weight}{!isNaN(parseFloat(ex.weight)) && !String(ex.weight).match(/[a-z]/i) ? weightUnit : ''}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                                {ex.notes ? <Text style={tw`text-slate-500 text-xs mt-1.5 italic`}>{ex.notes}</Text> : null}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                /* ── Empty State — Rest Day ── */
                                <View style={tw`items-center justify-center py-10 bg-white/5 rounded-3xl border border-white/5 border-dashed`}>
                                    <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                                        <Dumbbell size={32} color="#64748b" />
                                    </View>
                                    <Text style={tw`text-white font-bold text-lg mb-2`}>Rest Day</Text>
                                    <Text style={tw`text-slate-500 text-center px-10 mb-4`}>No workout assigned for {planSelectedDay}.</Text>
                                    <TouchableOpacity
                                        onPress={enterEditMode}
                                        style={tw`flex-row items-center gap-2 px-5 py-2.5 rounded-full bg-[${COLORS.primary}]/10 border border-[${COLORS.primary}]/30`}
                                    >
                                        <Plus size={14} color={COLORS.primary} />
                                        <Text style={tw`text-[${COLORS.primary}] font-bold text-sm`}>Assign Workout</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ) : (
                        /* ─── NUTRITION CONTENT ─── */
                        <View>
                            <View style={tw`flex-row justify-between items-center mb-4`}>
                                <Text style={tw`text-white font-bold text-lg`}>{planSelectedDay}'s Meals</Text>
                                <TouchableOpacity
                                    onPress={planEditMode ? cancelEdit : enterEditMode}
                                    style={tw`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${planEditMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 border border-white/10'}`}
                                >
                                    {planEditMode ? <XCircle size={14} color="#ef4444" /> : <Pencil size={14} color="#fb923c" />}
                                    <Text style={tw`text-xs font-bold ${planEditMode ? 'text-red-400' : 'text-orange-400'}`}>
                                        {planEditMode ? 'Cancel' : 'Edit'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {planEditMode ? (
                                /* ── Edit Mode ── */
                                <View>
                                    {['breakfast', 'lunch', 'dinner', 'snacks'].map((meal) => (
                                        <View key={meal} style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3`}>
                                            <Text style={tw`text-orange-400 text-xs font-bold uppercase tracking-wider mb-2`}>{meal}</Text>
                                            <TextInput
                                                style={tw`bg-white/5 text-white px-3 py-2.5 rounded-lg text-sm`}
                                                placeholder={`e.g. ${meal === 'breakfast' ? 'Oats + Banana' : meal === 'lunch' ? 'Chicken + Rice' : meal === 'dinner' ? 'Fish + Veg' : 'Nuts'}`}
                                                placeholderTextColor="#444"
                                                value={editMeals[meal] || ''}
                                                onChangeText={(v) => setEditMeals((prev: any) => ({ ...prev, [meal]: v }))}
                                                multiline
                                            />
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        onPress={handlePlanSave}
                                        disabled={planSaving}
                                        style={tw`bg-[${COLORS.primary}] py-4 rounded-xl items-center flex-row justify-center gap-2`}
                                    >
                                        {planSaving ? <ActivityIndicator size="small" color="black" /> : <Save size={18} color="black" />}
                                        <Text style={tw`text-black font-bold text-base`}>{planSaving ? 'Saving...' : 'Save Meal Plan'}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : dailyMeals ? (
                                /* ── View Mode — Has Meals ── */
                                <View style={tw`gap-4`}>
                                    {[
                                        { emoji: '🌅', label: 'Breakfast', value: dailyMeals.breakfast },
                                        { emoji: '☀️', label: 'Lunch', value: dailyMeals.lunch },
                                        { emoji: '🌙', label: 'Dinner', value: dailyMeals.dinner },
                                        { emoji: '🥜', label: 'Snacks', value: dailyMeals.snacks },
                                    ].filter(m => m.value).map(m => (
                                        <View key={m.label} style={[tw`p-5 rounded-2xl`, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                            <View style={tw`flex-row items-center gap-3 mb-3`}>
                                                <View style={tw`w-10 h-10 bg-orange-500/10 rounded-xl items-center justify-center`}>
                                                    <Text style={tw`text-xl`}>{m.emoji}</Text>
                                                </View>
                                                <Text style={tw`text-orange-400 font-bold uppercase tracking-wider text-sm`}>{m.label}</Text>
                                            </View>
                                            <Text style={tw`text-white text-base leading-6 pl-2 border-l-2 border-white/10 ml-2`}>{m.value}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                /* ── Empty State — No Meal Plan ── */
                                <View style={tw`items-center justify-center py-10 bg-white/5 rounded-3xl border border-white/5 border-dashed`}>
                                    <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                                        <Utensils size={32} color="#64748b" />
                                    </View>
                                    <Text style={tw`text-white font-bold text-lg mb-2`}>No Meal Plan</Text>
                                    <Text style={tw`text-slate-500 text-center px-10 mb-4`}>No meals assigned for {planSelectedDay}.</Text>
                                    <TouchableOpacity
                                        onPress={enterEditMode}
                                        style={tw`flex-row items-center gap-2 px-5 py-2.5 rounded-full bg-orange-500/10 border border-orange-500/30`}
                                    >
                                        <Plus size={14} color="#fb923c" />
                                        <Text style={tw`text-orange-400 font-bold text-sm`}>Assign Meal Plan</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        );
    };

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

            {/* Journey Date Picker Modal */}
            <DatePickerModal
                visible={showJourneyPicker}
                onClose={() => setShowJourneyPicker(false)}
                onSelect={handleSetJourneyDate}
                initialDate={clientPendingJourney || clientJourneyDate || new Date()}
                title="Set Journey Start Date"
                maxDate={new Date()}
            />
        </View>
    );
}
