import React, { useState, useCallback } from 'react';
import { ActivityIndicator } from 'react-native';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, Image, Platform, Alert, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Dumbbell, Calendar, Flame, Utensils, TrendingUp, Zap, ChevronRight, Sparkles, User, Bell, Plus, Scale, Target, Flag, Check, Pencil, UserCheck, XCircle } from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, doc, getDoc, orderBy, limit, Timestamp, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { calculateStats } from '../utils/analyticsHelpers';
import { UserProfile } from '../types/firestore';
import WorkoutCalendar from '../components/WorkoutCalendar';
import { sendPlanRequestMessage } from '../utils/planRequest';
import { format, differenceInDays } from 'date-fns';
import DatePickerModal from '../components/DatePickerModal';
import { sendJourneyDateMessage } from '../utils/journeyDate';

export default function ClientDashboard() {
    const navigation = useNavigation();
    const [latestPlan, setLatestPlan] = useState<any>(null);
    const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [streak, setStreak] = useState(0);
    const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [planRequestSent, setPlanRequestSent] = useState(false);
    const [sendingRequest, setSendingRequest] = useState(false);
    const [weeklyVolume, setWeeklyVolume] = useState<number>(0);
    const [lastWeekVolume, setLastWeekVolume] = useState<number>(0);
    const [latestWeight, setLatestWeight] = useState<{ weight: number; unit: string } | null>(null);
    const [prevWeight, setPrevWeight] = useState<{ weight: number; unit: string } | null>(null);
    const [showWeightModal, setShowWeightModal] = useState(false);
    const [weightInput, setWeightInput] = useState('');
    const [showJourneyPicker, setShowJourneyPicker] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [respondingToRequest, setRespondingToRequest] = useState<string | null>(null);

    const { user } = useAuth();
    const userId = user?.uid ?? '';

    const fetchData = async () => {
        if (!userId) return;
        setError(null);
        try {
            // 1. Fetch Plan — server-side filtered
            const planSnapshot = await getDocs(query(collection(db, "plans"), where('clientId', '==', userId), limit(10)));
            const plans = planSnapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => ((b as any).createdAt?.seconds || 0) - ((a as any).createdAt?.seconds || 0));

            if (plans.length > 0) setLatestPlan(plans[0]);

            // 1b. Fetch Client Profile (for Diet & Routine)
            const profileDoc = await getDoc(doc(db, "clientProfiles", userId));
            if (profileDoc.exists()) {
                setClientProfile({ id: profileDoc.id, ...profileDoc.data() } as UserProfile);
            }

            // 2. Fetch Logs for Streak & Weekly count
            // 2. Fetch Logs for Streak & Weekly count (Limit 100 for performance)
            // Note: Use orderBy to get latest. Requires Firestore Index: workoutLogs [clientId ASC, completedAt DESC]
            // If index is missing, this might fail or require creation via Console link in logs.
            try {
                const logQ = query(
                    collection(db, "workoutLogs"),
                    where('clientId', '==', userId),
                    orderBy('completedAt', 'desc'),
                    limit(100)
                );
                const logSnapshot = await getDocs(logQ);
                var logs = logSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err) {
                console.warn("Index missing for optimized query, falling back to all docs", err);
                const logSnapshot = await getDocs(query(collection(db, "workoutLogs"), where('clientId', '==', userId), limit(100)));
                var logs = logSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            const stats = calculateStats(logs as any[]);
            // P4: Prefer server-side streak if available
            if ((clientProfile as any)?.streak !== undefined) {
                setStreak((clientProfile as any).streak);
            } else if ((plans[0] as any)?.clientId && profileDoc.exists() && profileDoc.data().streak) {
                setStreak(profileDoc.data().streak);
            } else {
                setStreak(stats.streak);
            }

            // Count workouts this week
            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);

            const weeklyCount = logs.filter((log: any) => {
                const logDate = log.completedAt?.toDate?.() || (log.completedAt?.seconds ? new Date(log.completedAt.seconds * 1000) : null);
                return logDate && logDate >= startOfWeek;
            }).length;
            setWorkoutsThisWeek(weeklyCount);

            // Progressive Overload: Weekly Volume (this week vs last week)
            const startOfLastWeek = new Date(startOfWeek);
            startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

            let thisWeekVol = 0;
            let lastWeekVol = 0;
            logs.forEach((log: any) => {
                const logDate = log.completedAt?.toDate?.() || (log.completedAt?.seconds ? new Date(log.completedAt.seconds * 1000) : null);
                const vol = log.totalVolume || 0;
                if (logDate && logDate >= startOfWeek) {
                    thisWeekVol += vol;
                } else if (logDate && logDate >= startOfLastWeek && logDate < startOfWeek) {
                    lastWeekVol += vol;
                }
            });
            setWeeklyVolume(Math.round(thisWeekVol));
            setLastWeekVolume(Math.round(lastWeekVol));

            // Body Weight History (from subcollection)
            try {
                const weightSnap = await getDocs(
                    query(
                        collection(db, 'clientProfiles', userId, 'weightLogs'),
                        orderBy('date', 'desc'),
                        limit(2)
                    )
                );
                const weightEntries = weightSnap.docs.map(d => d.data());
                if (weightEntries.length > 0) {
                    setLatestWeight({ weight: weightEntries[0].weight, unit: weightEntries[0].unit });
                }
                if (weightEntries.length > 1) {
                    setPrevWeight({ weight: weightEntries[1].weight, unit: weightEntries[1].unit });
                }
            } catch (e) {
                // Subcollection may not exist yet — that's fine
            }

            // 5. Fetch pending coaching requests (for solo users)
            const profile = profileDoc.exists() ? profileDoc.data() : null;
            if (!profile?.trainerId) {
                try {
                    const reqSnapshot = await getDocs(
                        query(collection(db, 'trainerRequests'), where('clientId', '==', userId), where('status', '==', 'pending'))
                    );
                    const reqs = reqSnapshot.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                    setPendingRequests(reqs);
                } catch (e) {
                    console.warn('Could not fetch trainer requests:', e);
                }
            } else {
                setPendingRequests([]);
            }

        } catch (err) {
            console.error("Error fetching dashboard data:", err);
            setError('Could not load your dashboard. Pull down to retry.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));
    const onRefresh = () => { setRefreshing(true); fetchData(); };

    const handleRequestExercisePlan = async () => {
        if (!user || !clientProfile?.trainerId || sendingRequest) return;
        setSendingRequest(true);
        try {
            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
            const hasMealPlan = !!clientProfile?.dietPlan?.[today];
            const requestType = hasMealPlan ? 'exercise' : 'both';
            const typeLabel = requestType === 'both' ? 'workout & meal' : 'workout';
            await sendPlanRequestMessage(user, clientProfile.trainerId, requestType, today);
            setPlanRequestSent(true);
            Alert.alert('Sent! 🎉', `Your coach has been notified and will create your ${typeLabel} plan soon.`);
        } catch {
            Alert.alert('Error', 'Could not send the request. Please try again.');
        } finally {
            setSendingRequest(false);
        }
    };

    // ─── Handle Coaching Request Accept / Decline ───
    const handleCoachingRequest = async (requestId: string, action: 'accepted' | 'declined') => {
        setRespondingToRequest(requestId);
        try {
            await updateDoc(doc(db, 'trainerRequests', requestId), {
                status: action,
                respondedAt: Timestamp.now(),
            });

            // If accepted, link the trainer to this user's profile
            if (action === 'accepted') {
                const req = pendingRequests.find(r => r.id === requestId);
                if (req?.trainerId) {
                    await updateDoc(doc(db, 'clientProfiles', userId), {
                        trainerId: req.trainerId,
                    });
                }
            }

            // Remove from local list
            setPendingRequests(prev => prev.filter(r => r.id !== requestId));

            Alert.alert(
                action === 'accepted' ? 'Trainer Accepted! 🎉' : 'Request Declined',
                action === 'accepted'
                    ? 'Great! Your new trainer will be in touch soon.'
                    : 'The request has been declined.',
            );

            // Refresh dashboard to reflect new trainer state
            if (action === 'accepted') fetchData();
        } catch (e) {
            console.error('Error responding to coaching request:', e);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setRespondingToRequest(null);
        }
    };

    // ─── KPI Helpers ───
    const weightUnit = clientProfile?.preferredWeightUnit || 'kg';

    const formatVolume = (vol: number): string => {
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        return vol.toString();
    };

    const volumeDelta = lastWeekVolume > 0
        ? { pct: ((weeklyVolume - lastWeekVolume) / lastWeekVolume) * 100, positive: weeklyVolume >= lastWeekVolume }
        : null;

    const weightDelta = latestWeight && prevWeight
        ? { diff: +(latestWeight.weight - prevWeight.weight).toFixed(1), positive: latestWeight.weight <= prevWeight.weight }
        : null;

    const displayWeight = latestWeight ? latestWeight.weight : (clientProfile?.weight ? parseFloat(clientProfile.weight) : null);

    const saveWeightEntry = async () => {
        const val = parseFloat(weightInput);
        if (isNaN(val) || val <= 0) {
            Alert.alert('Invalid', 'Please enter a valid weight.');
            return;
        }
        try {
            await addDoc(collection(db, 'clientProfiles', userId, 'weightLogs'), {
                weight: val,
                unit: weightUnit,
                date: serverTimestamp(),
            });
            await updateDoc(doc(db, 'clientProfiles', userId), { weight: val.toString() });
            if (latestWeight) setPrevWeight(latestWeight);
            setLatestWeight({ weight: val, unit: weightUnit });
            setShowWeightModal(false);
            setWeightInput('');
        } catch (e) {
            Alert.alert('Error', 'Could not save weight. Please try again.');
        }
    };

    // Day + Plan Logic
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todayRoutine = clientProfile?.exercisePlan?.[today];
    const todayMeals = clientProfile?.dietPlan?.[today];

    // Solo user check (no trainer assigned)
    const isSolo = !clientProfile?.trainerId;

    // Alias for header compatibility
    const clientData = clientProfile;
    const clientName = clientProfile?.name || user?.displayName || 'User';

    // Determine Active Plan: Specific Plan > Daily Routine > Rest
    let activePlan = latestPlan;
    let isRoutine = false;

    if (!activePlan && todayRoutine && todayRoutine.length > 0) {
        isRoutine = true;
        activePlan = {
            id: 'routine-' + today,
            name: `${today}'s Routine`,
            exercises: todayRoutine.map((ex, eIdx) => ({
                id: `routine-ex-${eIdx}`,
                name: ex.name,
                sets: Array.from({ length: ex.sets }, (_, sIdx) => ({
                    id: `routine-ex-${eIdx}-set-${sIdx}`,
                    weight: ex.weight,
                    reps: ex.reps.toString(),
                    completed: false,
                    targetReps: ex.reps.toString(),
                    targetWeight: ex.weight,
                    actualReps: '',
                    actualWeight: '',
                })),
            })),
        };
    }

    const insets = useSafeAreaInsets();
    const displayName = clientProfile?.name || user?.displayName || 'Champ';
    const firstName = displayName.split(' ')[0];
    const weight = clientProfile?.weight || '—';

    return (
        <View style={[tw`flex-1 bg-[${COLORS.background}]`, { paddingTop: insets.top > 0 ? insets.top + 10 : 48 }]}>
            {/* ─── Header (Pinned) ─── */}
            <View style={tw`px-6 flex-row justify-between items-center mb-4`}>
                <View>
                    <Text style={tw`text-slate-500 text-xs uppercase font-bold tracking-wider mb-0.5`}>
                        {today} · {new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening'}
                    </Text>
                    <Text style={tw`text-white text-2xl font-black`}>Hey, {firstName} 👋</Text>
                </View>
                <View style={tw`flex-row items-center gap-2`}>
                    <TouchableOpacity
                        onPress={() => (navigation as any).navigate('ClientProfile')}
                        style={tw`w-10 h-10 bg-white/10 rounded-full items-center justify-center border border-white/10 overflow-hidden`}
                    >
                        {clientData?.photoURL ? (
                            <Image source={{ uri: clientData.photoURL }} style={tw`w-full h-full rounded-full`} />
                        ) : (
                            <User size={20} color={COLORS.primary} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {error && (
                <View style={tw`mx-6 mb-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex-row items-center justify-between`}>
                    <Text style={tw`text-red-400 text-sm flex-1`}>{error}</Text>
                    <TouchableOpacity onPress={() => { setError(null); fetchData(); }} style={tw`ml-3 bg-red-500/20 px-3 py-2.5 rounded-lg`}>
                        <Text style={tw`text-red-400 text-xs font-bold`}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={tw`pb-32`}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >

                {/* ─── Pending Journey Date Banner ─── */}
                {(clientProfile as any)?.journeyDateStatus === 'pending' && (clientProfile as any)?.pendingJourneyDate && (
                    <View style={tw`px-6 mb-4`}>
                        <View style={tw`bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4`}>
                            <View style={tw`flex-row items-center gap-2 mb-2`}>
                                <Calendar size={16} color="#c084fc" />
                                <Text style={tw`text-purple-300 font-bold text-sm`}>Journey Start Date</Text>
                            </View>
                            <Text style={tw`text-white font-bold text-base mb-1`}>
                                Your trainer proposed {format((clientProfile as any).pendingJourneyDate.toDate?.() || new Date(), 'MMMM d, yyyy')}
                            </Text>
                            <Text style={tw`text-purple-300/60 text-xs mb-3`}>
                                Is this when your fitness journey started?
                            </Text>
                            <View style={tw`flex-row gap-2`}>
                                <TouchableOpacity
                                    onPress={async () => {
                                        if (!userId) return;
                                        try {
                                            const pendingDate = (clientProfile as any).pendingJourneyDate?.toDate?.() || new Date();
                                            await updateDoc(doc(db, 'clientProfiles', userId), {
                                                journeyStartDate: (clientProfile as any).pendingJourneyDate,
                                                pendingJourneyDate: null,
                                                journeyDateStatus: 'confirmed',
                                            });
                                            // Notify trainer
                                            const trainerId = (clientProfile as any)?.trainerId;
                                            if (trainerId && user) {
                                                const confirmText = `✅ I've confirmed ${format(pendingDate, 'MMMM d, yyyy')} as our journey start date!`;
                                                await sendJourneyDateMessage(
                                                    { uid: userId, displayName: user.displayName },
                                                    trainerId, pendingDate, userId,
                                                    clientProfile?.name || 'Client', 'client'
                                                );
                                            }
                                            fetchData();
                                            Alert.alert('Confirmed!', 'Journey start date has been set.');
                                        } catch (e) { Alert.alert('Error', 'Could not confirm date.'); }
                                    }}
                                    style={tw`flex-1 bg-[${COLORS.primary}] py-3 rounded-xl items-center flex-row justify-center gap-1.5`}
                                >
                                    <Check size={16} color="black" />
                                    <Text style={tw`text-black font-bold text-sm`}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setShowJourneyPicker(true)}
                                    style={tw`flex-1 bg-white/5 border border-white/10 py-3 rounded-xl items-center flex-row justify-center gap-1.5`}
                                >
                                    <Pencil size={14} color="#c084fc" />
                                    <Text style={tw`text-purple-300 font-bold text-sm`}>Edit</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* ─── Coaching Requests Banner (Solo Users) ─── */}
                {isSolo && pendingRequests.length > 0 && (
                    <View style={tw`px-6 mb-4`}>
                        {pendingRequests.map((req) => (
                            <View
                                key={req.id}
                                style={tw`bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mb-2`}
                            >
                                <View style={tw`flex-row items-center gap-2 mb-2`}>
                                    <UserCheck size={16} color="#60a5fa" />
                                    <Text style={tw`text-blue-300 font-bold text-sm`}>Coaching Request</Text>
                                </View>
                                <Text style={tw`text-white font-bold text-base mb-1`}>
                                    {req.trainerName || 'A trainer'} wants to coach you
                                </Text>
                                {req.message ? (
                                    <Text style={tw`text-blue-300/60 text-xs mb-3 leading-4`}>
                                        "{req.message}"
                                    </Text>
                                ) : (
                                    <Text style={tw`text-blue-300/60 text-xs mb-3`}>
                                        Accept to start your coaching journey
                                    </Text>
                                )}
                                <View style={tw`flex-row gap-2`}>
                                    <TouchableOpacity
                                        onPress={() => handleCoachingRequest(req.id, 'declined')}
                                        disabled={respondingToRequest === req.id}
                                        style={tw`flex-1 bg-white/5 border border-white/10 py-3 rounded-xl items-center flex-row justify-center gap-1.5`}
                                    >
                                        <XCircle size={14} color="#94a3b8" />
                                        <Text style={tw`text-slate-300 font-bold text-sm`}>Decline</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleCoachingRequest(req.id, 'accepted')}
                                        disabled={respondingToRequest === req.id}
                                        style={tw`flex-1 bg-[${COLORS.primary}] py-3 rounded-xl items-center flex-row justify-center gap-1.5`}
                                    >
                                        <Check size={16} color="black" />
                                        <Text style={tw`text-black font-bold text-sm`}>
                                            {respondingToRequest === req.id ? 'Updating...' : 'Accept'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* ─── Hero Workout Section ─── */}
                <View style={tw`px-6 mb-8`}>
                    {activePlan ? (
                        <TouchableOpacity
                            onPress={() => (navigation as any).navigate('WorkoutView', { workoutData: activePlan })}
                            style={tw`bg-[${COLORS.primary}] p-6 rounded-3xl overflow-hidden relative shadow-2xl`}
                            activeOpacity={0.9}
                        >
                            {/* Decorative Elements */}
                            <View style={tw`absolute -right-6 -bottom-6 opacity-20 rotate-[-15deg]`}>
                                <Dumbbell size={160} color="black" />
                            </View>

                            <View style={tw`flex-row justify-between items-start mb-4`}>
                                <View style={tw`bg-black/10 px-3 py-1 rounded-full border border-black/5`}>
                                    <Text style={tw`text-black text-[10px] font-black uppercase tracking-widest`}>Today's Session</Text>
                                </View>
                                <Sparkles size={20} color="black" style={{ opacity: 0.5 }} />
                            </View>

                            <Text style={tw`text-black text-3xl font-black italic uppercase tracking-tighter mb-1`}>
                                {activePlan.name || 'Personal Training'}
                            </Text>
                            <Text style={tw`text-black/60 font-bold mb-6`}>
                                {activePlan.exercises?.length || 0} Exercises ready for you
                            </Text>

                            <View style={tw`flex-row items-center gap-2 bg-black h-14 rounded-2xl justify-center shadow-lg`}>
                                <Target size={20} color={COLORS.primary} />
                                <Text style={tw`text-[${COLORS.primary}] font-black text-lg uppercase`}>Start Now</Text>
                            </View>
                        </TouchableOpacity>
                    ) : loading ? (
                        /* Loading skeleton — prevents flash of Quick Start cards */
                        <View style={tw`bg-[${COLORS.backgroundLight}] p-8 rounded-3xl border border-white/5 items-center justify-center h-44`}>
                            <ActivityIndicator color={COLORS.primary} size="small" />
                            <Text style={tw`text-slate-500 text-xs mt-3 font-bold`}>Loading your plan...</Text>
                        </View>
                    ) : (
                        /* No plan found — show rest day message */
                        <View style={tw`bg-[${COLORS.backgroundLight}] p-6 rounded-3xl border border-white/5 items-center`}>
                            <View style={tw`w-14 h-14 bg-slate-700 rounded-full items-center justify-center mb-3`}>
                                <Calendar size={24} color="#94a3b8" />
                            </View>
                            <Text style={tw`text-white font-bold text-lg mb-1`}>Rest Day</Text>
                            <Text style={tw`text-slate-500 text-sm text-center`}>
                                No workout scheduled for {today}.
                            </Text>
                            <Text style={tw`text-slate-600 text-xs text-center mt-1`}>
                                Tap the + button to start a freestyle session.
                            </Text>
                        </View>
                    )}
                </View>
                {/* ─── KPI Cards ─── */}
                <View style={tw`px-6 flex-row gap-3 mb-6`}>
                    {/* Body Weight */}
                    <TouchableOpacity
                        onPress={() => { setWeightInput(displayWeight ? displayWeight.toString() : ''); setShowWeightModal(true); }}
                        style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}
                        activeOpacity={0.7}
                    >
                        <View style={tw`flex-row items-center justify-between mb-2`}>
                            <View style={tw`w-8 h-8 bg-blue-500/15 rounded-full items-center justify-center`}>
                                <Scale size={16} color="#3b82f6" />
                            </View>
                            <View style={tw`w-6 h-6 bg-blue-500/10 rounded-full items-center justify-center`}>
                                <Plus size={12} color="#3b82f6" />
                            </View>
                        </View>
                        <Text style={tw`text-white text-xl font-bold`}>
                            {displayWeight ? `${displayWeight}` : '—'}
                            <Text style={tw`text-slate-500 text-xs`}> {weightUnit}</Text>
                        </Text>
                        {weightDelta ? (
                            <Text style={tw`${weightDelta.positive ? 'text-green-400' : 'text-orange-400'} text-[10px] font-bold mt-0.5`}>
                                {weightDelta.diff > 0 ? '+' : ''}{weightDelta.diff} {weightUnit}
                            </Text>
                        ) : (
                            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-0.5`}>Body Weight</Text>
                        )}
                    </TouchableOpacity>

                    {/* Progressive Overload — Weekly Volume */}
                    <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                        <View style={tw`w-8 h-8 bg-[${COLORS.primary}]/15 rounded-full items-center justify-center mb-2`}>
                            <Zap size={16} color={COLORS.primary} />
                        </View>
                        <Text style={tw`text-white text-xl font-bold`}>
                            {weeklyVolume > 0 ? formatVolume(weeklyVolume) : '—'}
                            {weeklyVolume > 0 && <Text style={tw`text-slate-500 text-xs`}> {weightUnit}</Text>}
                        </Text>
                        {volumeDelta ? (
                            <Text style={tw`${volumeDelta.positive ? 'text-green-400' : 'text-red-400'} text-[10px] font-bold mt-0.5`}>
                                {volumeDelta.pct >= 0 ? '+' : ''}{volumeDelta.pct.toFixed(0)}% vs last wk
                            </Text>
                        ) : weeklyVolume > 0 ? (
                            <Text style={tw`text-[${COLORS.primary}] text-[10px] font-bold mt-0.5`}>First week!</Text>
                        ) : (
                            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-0.5`}>Volume</Text>
                        )}
                    </View>

                    {/* Streak */}
                    <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border ${streak > 0 ? 'border-orange-500/20' : 'border-white/5'}`}>
                        <View style={tw`w-8 h-8 ${streak > 0 ? 'bg-orange-500/20' : 'bg-orange-500/10'} rounded-full items-center justify-center mb-2`}>
                            <Flame size={16} color="#f97316" />
                        </View>
                        <Text style={tw`text-white text-xl font-bold`}>
                            {streak}<Text style={tw`text-slate-500 text-sm font-normal`}> days</Text>
                        </Text>
                        <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-0.5`}>Streak</Text>
                    </View>
                </View>

                {/* ─── Journey Card ─── */}
                {(clientProfile as any)?.journeyDateStatus === 'confirmed' && (clientProfile as any)?.journeyStartDate && (
                    <TouchableOpacity
                        onPress={() => setShowJourneyPicker(true)}
                        activeOpacity={0.7}
                        style={tw`px-6 mb-6`}
                    >
                        <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-purple-500/10 flex-row items-center justify-between`}>
                            <View style={tw`flex-row items-center gap-3`}>
                                <View style={tw`w-10 h-10 bg-purple-500/15 rounded-full items-center justify-center`}>
                                    <Flag size={20} color="#c084fc" />
                                </View>
                                <View>
                                    <Text style={tw`text-white font-bold text-base`}>
                                        {differenceInDays(new Date(), (clientProfile as any).journeyStartDate?.toDate?.() || new Date())} days
                                    </Text>
                                    <Text style={tw`text-slate-400 text-xs`}>
                                        Journey started {format((clientProfile as any).journeyStartDate?.toDate?.() || new Date(), 'MMM d, yyyy')}
                                    </Text>
                                </View>
                            </View>
                            <View style={tw`flex-row items-center gap-1`}>
                                <Pencil size={12} color="#64748b" />
                                <Text style={tw`text-slate-500 text-xs`}>Edit</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ─── Workout Calendar ─── */}
                <View style={tw`px-6 mb-6`}>
                    <WorkoutCalendar clientId={userId} compact={true} />
                </View>

                {/* ─── View Full Program CTA ─── */}
                <View style={tw`px-6`}>
                    <TouchableOpacity
                        onPress={() => (navigation as any).navigate('Program')}
                        style={tw`flex-row items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5 mb-6`}
                    >
                        <View style={tw`flex-row items-center gap-3`}>
                            <View style={tw`w-10 h-10 bg-blue-500/10 rounded-full items-center justify-center`}>
                                <Calendar size={20} color="#3b82f6" />
                            </View>
                            <View>
                                <Text style={tw`text-white font-bold text-base`}>Weekly Schedule</Text>
                                <Text style={tw`text-slate-400 text-xs`}>View full workout & meal plan</Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color="#64748b" />
                    </TouchableOpacity>

                    {/* ─── Meal Plan ─── */}
                    <View style={tw`bg-[${COLORS.backgroundLight}] p-5 rounded-2xl border border-white/5 mb-4`}>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <View style={tw`flex-row items-center gap-2.5`}>
                                <View style={[tw`w-9 h-9 rounded-xl items-center justify-center`, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
                                    <Utensils size={17} color="#f97316" />
                                </View>
                                <View>
                                    <Text style={tw`text-white font-bold text-base`}>Meal Plan</Text>
                                    <Text style={tw`text-slate-500 text-[10px] uppercase tracking-wider`}>{today}</Text>
                                </View>
                            </View>
                            {isSolo && todayMeals && (
                                <TouchableOpacity
                                    onPress={() => (navigation as any).navigate('EditPlan', {
                                        clientId: userId,
                                        clientName: clientName,
                                        isSolo: true,
                                    })}
                                    style={tw`w-8 h-8 bg-white/5 rounded-full items-center justify-center`}
                                >
                                    <Pencil size={14} color="#64748b" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {
                            todayMeals ? (
                                <View style={tw`gap-2`}>
                                    {[
                                        { emoji: '🌅', label: 'Breakfast', value: todayMeals.breakfast },
                                        { emoji: '☀️', label: 'Lunch', value: todayMeals.lunch },
                                        { emoji: '🌙', label: 'Dinner', value: todayMeals.dinner },
                                        { emoji: '🥜', label: 'Snacks', value: todayMeals.snacks },
                                    ]
                                        .filter(m => m.value)
                                        .map(m => (
                                            <View key={m.label} style={[tw`flex-row items-center gap-3 p-3 rounded-xl`, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                                <Text style={tw`text-base`}>{m.emoji}</Text>
                                                <View style={tw`flex-1`}>
                                                    <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-0.5`}>
                                                        {m.label}
                                                    </Text>
                                                    <Text style={tw`text-white text-sm leading-5`}>{m.value}</Text>
                                                </View>
                                            </View>
                                        ))}
                                </View>
                            ) : (
                                <View style={tw`items-center py-3`}>
                                    <Text style={tw`text-slate-500 text-sm`}>No meal plan for today</Text>
                                    {isSolo ? (
                                        <TouchableOpacity
                                            onPress={() => (navigation as any).navigate('EditPlan', {
                                                clientId: userId,
                                                clientName: clientName,
                                                isSolo: true,
                                            })}
                                            style={tw`flex-row items-center gap-2 px-4 py-2.5 rounded-full border border-orange-500/40 bg-orange-500/10 mt-3`}
                                        >
                                            <Plus size={14} color="#f97316" />
                                            <Text style={tw`text-sm font-bold text-orange-400`}>Create Meal Plan</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <Text style={tw`text-slate-600 text-xs mt-1`}>Your trainer can assign meals</Text>
                                    )}
                                </View>
                            )
                        }
                    </View >

                    {/* ─── Exercise Routine ─── */}
                    < View style={tw`bg-[${COLORS.backgroundLight}] p-5 rounded-2xl border border-white/5 mb-4`}>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <View style={tw`flex-row items-center gap-2.5`}>
                                <View style={[tw`w-9 h-9 rounded-xl items-center justify-center`, { backgroundColor: `${COLORS.primary}1F` }]}>
                                    <Dumbbell size={17} color={COLORS.primary} />
                                </View>
                                <View>
                                    <Text style={tw`text-white font-bold text-base`}>Exercise Routine</Text>
                                    <Text style={tw`text-slate-500 text-[10px] uppercase tracking-wider`}>{today}</Text>
                                </View>
                            </View>
                            <View style={tw`flex-row items-center gap-2`}>
                                {todayRoutine && todayRoutine.length > 0 && (
                                    <View style={[tw`px-2.5 py-1 rounded-lg`, { backgroundColor: `${COLORS.primary}1A` }]}>
                                        <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{todayRoutine.length} exercises</Text>
                                    </View>
                                )}
                                {isSolo && todayRoutine && todayRoutine.length > 0 && (
                                    <TouchableOpacity
                                        onPress={() => (navigation as any).navigate('EditPlan', {
                                            clientId: userId,
                                            clientName: clientName,
                                            isSolo: true,
                                        })}
                                        style={tw`w-8 h-8 bg-white/5 rounded-full items-center justify-center`}
                                    >
                                        <Pencil size={14} color="#64748b" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {
                            todayRoutine && todayRoutine.length > 0 ? (
                                <View style={tw`gap-2`}>
                                    {todayRoutine.map((ex, idx) => (
                                        <View key={idx} style={[tw`flex-row items-center gap-3 p-3 rounded-xl`, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                            <View style={[tw`w-7 h-7 rounded-lg items-center justify-center`, { backgroundColor: `${COLORS.primary}1F` }]}>
                                                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 10 }}>{idx + 1}</Text>
                                            </View>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`text-white font-bold text-sm`}>{ex.name}</Text>
                                                <Text style={tw`text-slate-500 text-xs`}>
                                                    {ex.sets} sets × {ex.reps} reps
                                                    {ex.weight ? ` · ${ex.weight}${!isNaN(parseFloat(ex.weight)) && !ex.weight.match(/[a-z]/i) ? (clientProfile?.preferredWeightUnit || 'kg') : ''}` : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={tw`items-center py-3`}>
                                    <Text style={tw`text-slate-500 text-sm mb-1`}>No exercises scheduled</Text>
                                    {isSolo ? (
                                        <TouchableOpacity
                                            onPress={() => (navigation as any).navigate('EditPlan', {
                                                clientId: userId,
                                                clientName: clientName,
                                                isSolo: true,
                                            })}
                                            style={tw`flex-row items-center gap-2 px-4 py-2.5 rounded-full border border-[${COLORS.primary}]/40 bg-[${COLORS.primary}]/10 mt-2`}
                                        >
                                            <Plus size={14} color={COLORS.primary} />
                                            <Text style={tw`text-sm font-bold text-[${COLORS.primary}]`}>Create Workout Plan</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <>
                                            <Text style={tw`text-slate-600 text-xs mb-3`}>Your trainer can assign a routine</Text>
                                            {!!clientProfile?.trainerId && (
                                                <TouchableOpacity
                                                    onPress={handleRequestExercisePlan}
                                                    disabled={planRequestSent || sendingRequest}
                                                    style={tw`flex-row items-center gap-2 px-4 py-2.5 rounded-full border ${
                                                        planRequestSent
                                                            ? 'border-green-500/30 bg-green-500/10'
                                                            : 'border-[' + COLORS.primary + ']/40 bg-[' + COLORS.primary + ']/10'
                                                    }`}
                                                >
                                                    <Bell size={14} color={planRequestSent ? '#22c55e' : COLORS.primary} />
                                                    <Text style={tw`text-sm font-bold ${planRequestSent ? 'text-green-400' : 'text-[' + COLORS.primary + ']'}`}>
                                                        {sendingRequest ? 'Sending…' : planRequestSent ? 'Request Sent ✓' : 'Ask Coach for Plan'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    )}
                                </View>
                            )
                        }
                    </View >

                    {/* ─── AI Workout Generator (Only if NO trainer) ─── */}
                    {!loading && !clientProfile?.trainerId && (
                        <TouchableOpacity
                            onPress={() => (navigation as any).navigate('AIGenerator')}
                            style={tw`bg-purple-600/10 border border-purple-500/20 p-5 rounded-2xl mb-4 flex-row items-center gap-4`}
                        >
                            <View style={tw`w-12 h-12 bg-purple-500/20 rounded-xl items-center justify-center`}>
                                <Sparkles size={24} color="#d8b4fe" />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-white font-bold text-base`}>AI Generator</Text>
                                <Text style={tw`text-purple-300 text-xs`}>Zero-thinking workout builder</Text>
                            </View>
                            <ChevronRight size={20} color="#d8b4fe" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Subtle note if there's a plan vs routine conflict */}
                {
                    todayRoutine && !isRoutine && !loading && (
                        <Text style={tw`text-slate-600 text-[10px] text-center mb-4`}>
                            Using your assigned plan. You also have a routine for {today}.
                        </Text>
                    )
                }

            </ScrollView >

            {/* ─── Weight Log Modal ─── */}
            <Modal
                visible={showWeightModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowWeightModal(false)}
            >
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tw`flex-1 justify-end`}>
                    <TouchableOpacity
                        style={tw`flex-1`}
                        activeOpacity={1}
                        onPress={() => setShowWeightModal(false)}
                    />
                    <View style={tw`bg-[${COLORS.backgroundLight}] rounded-t-3xl px-6 pb-10 pt-6 border-t border-white/10`}>
                        <View style={tw`w-10 h-1 bg-white/20 rounded-full self-center mb-5`} />
                        <Text style={tw`text-white text-xl font-bold mb-1`}>Log Weight</Text>
                        <Text style={tw`text-slate-500 text-sm mb-5`}>Track your body weight over time</Text>

                        <View style={tw`flex-row items-center gap-3 mb-6`}>
                            <TextInput
                                value={weightInput}
                                onChangeText={setWeightInput}
                                placeholder="0.0"
                                placeholderTextColor="#475569"
                                keyboardType="decimal-pad"
                                autoFocus
                                style={tw`flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-2xl font-bold text-center`}
                            />
                            <View style={tw`bg-white/5 border border-white/10 rounded-2xl px-5 py-4`}>
                                <Text style={tw`text-slate-400 text-lg font-bold`}>{weightUnit}</Text>
                            </View>
                        </View>

                        <View style={tw`flex-row gap-3`}>
                            <TouchableOpacity
                                onPress={() => { setShowWeightModal(false); setWeightInput(''); }}
                                style={tw`flex-1 bg-white/5 border border-white/10 h-14 rounded-2xl items-center justify-center`}
                            >
                                <Text style={tw`text-slate-400 font-bold text-base`}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveWeightEntry}
                                style={tw`flex-1 bg-[${COLORS.primary}] h-14 rounded-2xl items-center justify-center`}
                            >
                                <Text style={tw`text-black font-bold text-base`}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ─── Journey Date Picker Modal ─── */}
            <DatePickerModal
                visible={showJourneyPicker}
                onClose={() => setShowJourneyPicker(false)}
                onSelect={async (date) => {
                    if (!userId) return;
                    try {
                        await updateDoc(doc(db, 'clientProfiles', userId), {
                            journeyStartDate: Timestamp.fromDate(date),
                            pendingJourneyDate: null,
                            journeyDateStatus: 'confirmed',
                        });
                        // Notify trainer
                        const trainerId = (clientProfile as any)?.trainerId;
                        if (trainerId && user) {
                            await sendJourneyDateMessage(
                                { uid: userId, displayName: user.displayName },
                                trainerId, date, userId,
                                clientProfile?.name || user.displayName || 'Client', 'client'
                            );
                        }
                        fetchData();
                        Alert.alert('Updated!', `Journey start date set to ${format(date, 'MMMM d, yyyy')}.`);
                    } catch (e) {
                        Alert.alert('Error', 'Could not update date.');
                    }
                }}
                initialDate={
                    (clientProfile as any)?.journeyStartDate?.toDate?.() ||
                    (clientProfile as any)?.pendingJourneyDate?.toDate?.() ||
                    new Date()
                }
                title="Edit Journey Start Date"
                maxDate={new Date()}
            />
        </View >
    );
}
