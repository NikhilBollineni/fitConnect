import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, RefreshControl } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
    ArrowLeft, Search, Filter, MessageSquare, CheckCircle2,
    XCircle, Clock, ChevronRight, Dumbbell, AlertCircle
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { convertWeight, WeightUnit } from '../utils/unitConversion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// --- Types ---
type FilterOption = 'all' | 'pending' | 'reviewed';

interface ReviewWorkout {
    id: string;
    clientId: string;
    clientName: string;
    clientInitial: string;
    workoutName: string;
    date: string;       // Formatted relative time
    timestamp: any;     // Raw timestamp for sorting
    duration: string;
    volume: string;
    status: 'pending' | 'reviewed';
    exercises: any[];
}

const DEMO_EMAIL = 'nikhilbollineni11@gmail.com';
const MOCK_REVIEWS: ReviewWorkout[] = [
    {
        id: 'mock_review_1',
        clientId: 'mock1',
        clientName: 'Aarav Patel',
        clientInitial: 'A',
        workoutName: 'Hypertrophy Chest & Tri',
        date: '2h ago',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        duration: '65m',
        volume: '12,450 kg',
        status: 'pending',
        exercises: [
            { name: 'Bench Press', sets: [{ weight: 80, reps: 8, completed: true }, { weight: 80, reps: 8, completed: true }, { weight: 80, reps: 7, completed: true }] },
            { name: 'Incline Dumbbell Press', sets: [{ weight: 30, reps: 10, completed: true }, { weight: 30, reps: 10, completed: true }] },
            { name: 'Cable Flyes', sets: [{ weight: 15, reps: 15, completed: true }, { weight: 15, reps: 15, completed: true }] }
        ]
    },
    {
        id: 'mock_review_2',
        clientId: 'mock2',
        clientName: 'Emily Chen',
        clientInitial: 'E',
        workoutName: 'Leg Day Blast',
        date: '5h ago',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
        duration: '55m',
        volume: '8,200 kg',
        status: 'pending',
        exercises: [
            { name: 'Squat', sets: [{ weight: 90, reps: 5, completed: true }, { weight: 95, reps: 5, completed: true }] },
            { name: 'Leg Press', sets: [{ weight: 150, reps: 10, completed: true }, { weight: 150, reps: 10, completed: true }] }
        ]
    },
    {
        id: 'mock_review_3',
        clientId: 'mock3',
        clientName: 'Marcus Johnson',
        clientInitial: 'M',
        workoutName: 'Deadlift PR Day',
        date: '1d ago',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        duration: '45m',
        volume: '6,500 kg',
        status: 'reviewed',
        exercises: []
    }
];

export default function TrainerReviewsScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const [workouts, setWorkouts] = useState<ReviewWorkout[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterOption>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [trainerUnit, setTrainerUnit] = useState<WeightUnit>('kg');

    const fetchReviews = async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            // 0. Fetch Trainer's Preferred Unit
            const trainerDoc = await getDoc(doc(db, 'clientProfiles', user.uid));
            let preferredUnit: WeightUnit = 'kg';
            if (trainerDoc.exists()) {
                const data = trainerDoc.data();
                if (data.preferredWeightUnit) preferredUnit = data.preferredWeightUnit;
                setTrainerUnit(preferredUnit);
            }
            // 1. Fetch Logs assigned to this trainer (Limit 50 for performance)
            const logsQuery = query(
                collection(db, 'workoutLogs'),
                where('trainerId', '==', user.uid),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            const logsSnap = await getDocs(logsQuery);

            // 2. Collect unique Client IDs to fetch names
            const clientIds = new Set<string>();
            logsSnap.docs.forEach(d => {
                const data = d.data();
                if (data.clientId) clientIds.add(data.clientId);
            });

            // 3. Fetch Client Profiles Parallelly
            const clientMap: Record<string, string> = {};
            const clientIdsArray = Array.from(clientIds);
            const profilePromises = clientIdsArray.map(async (cid) => {
                try {
                    const cDoc = await getDoc(doc(db, 'clientProfiles', cid));
                    if (cDoc.exists()) {
                        clientMap[cid] = cDoc.data().name || 'Unknown Client';
                    }
                } catch (e) {
                    console.warn(`Failed to fetch client ${cid}`, e);
                }
            });
            await Promise.all(profilePromises);

            // 4. Map to ReviewWorkout type
            const parsedWorkouts: ReviewWorkout[] = logsSnap.docs.map(doc => {
                const data = doc.data();
                const cName = clientMap[data.clientId] || 'Client';
                const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();

                return {
                    id: doc.id,
                    clientId: data.clientId,
                    clientName: cName,
                    clientInitial: cName.charAt(0).toUpperCase(),
                    workoutName: data.title || 'Workout',
                    date: formatDistanceToNow(createdDate, { addSuffix: true }),
                    timestamp: createdDate,
                    duration: data.duration ? `${data.duration}m` : '-',
                    volume: (() => {
                        const vol = (data.exercises || []).reduce((acc: number, ex: any) => {
                            return acc + (ex.sets || []).reduce((sAcc: number, s: any) => {
                                if (!s.completed) return sAcc;
                                const w = convertWeight(s.weight || 0, s.weightUnit || 'kg', preferredUnit); // Default source to kg if missing
                                return sAcc + (w * (s.reps || 0));
                            }, 0);
                        }, 0);
                        return vol > 0 ? `${Math.round(vol).toLocaleString()} ${preferredUnit}` : '-';
                    })(),
                    status: data.reviewed ? 'reviewed' : 'pending',
                    exercises: data.exercises || []
                };
            });

            setWorkouts(parsedWorkouts);

            // INJECT MOCK REVIEWS FOR DEMO USER
            if (user.email === DEMO_EMAIL) {
                // Adjust volumes based on trainerUnit if needed, but for mocks hardcoded strings are fine for now
                // or we could recalculate them. Simple append is sufficient for demo.
                setWorkouts(prev => [...prev, ...MOCK_REVIEWS]);
            }

        } catch (error) {
            console.error("Error fetching reviews:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchReviews();
        }, [user?.uid])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchReviews();
    };

    const filteredWorkouts = workouts.filter(w => {
        const matchesFilter = activeFilter === 'all' || w.status === activeFilter;
        const matchesSearch = searchQuery === '' ||
            w.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            w.workoutName.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return (
                    <View style={tw`bg-orange-500/20 px-2.5 py-1 rounded-full`}>
                        <Text style={tw`text-orange-400 text-[10px] font-bold`}>PENDING</Text>
                    </View>
                );
            case 'reviewed':
                return (
                    <View style={tw`bg-green-500/20 px-2.5 py-1 rounded-full`}>
                        <Text style={tw`text-green-400 text-[10px] font-bold`}>REVIEWED</Text>
                    </View>
                );
            default: return null;
        }
    };

    const handleReview = (workout: ReviewWorkout) => {
        // Navigate even if reviewed, allowing re-review or viewing details
        if (workout.exercises.length > 0) {
            navigation.navigate('WorkoutView', {
                workoutData: {
                    id: workout.id,
                    clientId: workout.clientId, // Pass Client ID for chat lookup
                    title: workout.workoutName,
                    duration: workout.duration.replace('m', ' min'),
                    exercises: workout.exercises,
                    createdAt: workout.timestamp, // Pass for chronological lookup
                },
                mode: 'review',
            });
        }
    };

    const counts = {
        all: workouts.length,
        pending: workouts.filter(w => w.status === 'pending').length,
        reviewed: workouts.filter(w => w.status === 'reviewed').length,
    };

    return (
        <View style={[tw`flex-1 bg-[${COLORS.background}]`, { paddingTop: insets.top > 0 ? insets.top + 12 : 48 }]}>
            {/* Header */}
            <View style={tw`px-6 flex-row items-center justify-between mb-6`}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center`}
                >
                    <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <View style={tw`items-center`}>
                    <Text style={tw`text-white font-bold text-lg`}>Workout Reviews</Text>
                    <Text style={tw`text-slate-400 text-xs`}>
                        {counts.pending} pending feedback
                    </Text>
                </View>
                <View style={tw`w-10`} />
            </View>

            {/* Search Bar */}
            <View style={tw`px-6 mb-4`}>
                <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3`}>
                    <Search size={18} color="#64748b" />
                    <TextInput
                        style={tw`flex-1 text-white ml-3 text-sm`}
                        placeholder="Search by client or workout..."
                        placeholderTextColor="#64748b"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {/* Filter Chips */}
            <View style={tw`px-6 mb-6`}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={tw`flex-row gap-2`}>
                        {(['all', 'pending', 'reviewed'] as FilterOption[]).map((key) => (
                            <TouchableOpacity
                                key={key}
                                onPress={() => setActiveFilter(key)}
                                style={tw`flex-row items-center gap-1.5 px-4 py-2 rounded-full border ${activeFilter === key
                                    ? `bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                    : 'bg-white/5 border-white/10'
                                    }`}
                            >
                                <Text style={tw`${activeFilter === key ? 'text-black' : 'text-slate-300'} text-xs font-bold capitalize`}>
                                    {key}
                                </Text>
                                <View style={tw`${activeFilter === key ? 'bg-black/20' : 'bg-white/10'} px-1.5 py-0.5 rounded-full`}>
                                    <Text style={tw`${activeFilter === key ? 'text-black' : 'text-slate-400'} text-[10px] font-bold`}>
                                        {counts[key]}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </View>

            {/* Results */}
            <ScrollView
                style={tw`flex-1 px-6`}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {filteredWorkouts.length === 0 ? (
                    <View style={tw`items-center justify-center py-20`}>
                        <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                            <CheckCircle2 size={32} color="#4ade80" />
                        </View>
                        <Text style={tw`text-white font-bold text-lg mb-1`}>All caught up! 🎉</Text>
                        <Text style={tw`text-slate-400 text-sm text-center`}>No workouts match this filter.</Text>
                    </View>
                ) : (
                    filteredWorkouts.map((workout) => (
                        <TouchableOpacity
                            key={workout.id}
                            activeOpacity={0.7}
                            onPress={() => handleReview(workout)}
                            style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border ${workout.status === 'pending' ? 'border-orange-500/30' : 'border-white/5'
                                } mb-3`}
                        >
                            {/* Top Row: Client + Status */}
                            <View style={tw`flex-row items-center justify-between mb-3`}>
                                <View style={tw`flex-row items-center gap-3`}>
                                    <View style={tw`w-10 h-10 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center`}>
                                        <Text style={tw`text-[${COLORS.primary}] font-bold`}>{workout.clientInitial}</Text>
                                    </View>
                                    <View>
                                        <Text style={tw`text-white font-bold text-base`}>{workout.clientName}</Text>
                                        <Text style={tw`text-slate-400 text-xs`}>{workout.date}</Text>
                                    </View>
                                </View>
                                {getStatusBadge(workout.status)}
                            </View>

                            {/* Workout Details */}
                            <View style={tw`bg-white/5 rounded-xl p-3 mb-3`}>
                                <View style={tw`flex-row items-center justify-between`}>
                                    <View style={tw`flex-row items-center gap-2`}>
                                        <Dumbbell size={14} color={COLORS.primary} />
                                        <Text style={tw`text-white font-bold text-sm`}>{workout.workoutName}</Text>
                                    </View>
                                    <ChevronRight size={16} color="#64748b" />
                                </View>
                                <View style={tw`flex-row gap-4 mt-2`}>
                                    <View style={tw`flex-row items-center gap-1`}>
                                        <Clock size={12} color="#94a3b8" />
                                        <Text style={tw`text-slate-400 text-xs`}>{workout.duration}</Text>
                                    </View>
                                    {workout.volume !== '-' && (
                                        <Text style={tw`text-slate-400 text-xs`}>Vol: {workout.volume}</Text>
                                    )}
                                </View>
                            </View>

                            {/* Action Row */}
                            {workout.status === 'pending' ? (
                                <View
                                    style={tw`bg-orange-500 py-2.5 rounded-xl items-center flex-row justify-center gap-2`}
                                >
                                    <MessageSquare size={14} color="white" />
                                    <Text style={tw`text-white font-bold text-xs`}>Review & Send Feedback</Text>
                                </View>
                            ) : (
                                <View style={tw`flex-row items-center justify-center gap-1.5 py-2`}>
                                    <CheckCircle2 size={14} color="#4ade80" />
                                    <Text style={tw`text-green-400 text-xs font-medium`}>Feedback sent</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </View>
    );
}
