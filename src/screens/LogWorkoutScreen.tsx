import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import tw from 'twrnc';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Clock, History, CheckCircle2, Circle, MoreVertical, Plus, Minus, RotateCcw, Dumbbell, Layers, TrendingUp, Trash2, PlayCircle, Settings2, Zap } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { parseWeight } from '../types/firestore';
import { COLORS } from '../constants/theme';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, Timestamp, limit, doc, getDoc } from 'firebase/firestore';

const COMMON_EXERCISES = [
    'Barbell Squat',
    'Bench Press',
    'Deadlift',
    'Overhead Press',
    'Pull Up',
    'Dumbbell Row',
    'Lunges',
    'Leg Press',
    'Lat Pulldown',
    'Push Up'
];

interface DetailedExercise {
    id: string;
    name: string;
    sets: string;
    weight: string;
    reps: string;
}

interface HistoryStats {
    weight: string;
    reps: string;
    sets: number;
    date: string; // formatted date
}

export default function LogWorkoutScreen() {
    const navigation = useNavigation<any>();
    const [workoutTitle, setWorkoutTitle] = useState('');
    const [selectedExercises, setSelectedExercises] = useState<DetailedExercise[]>([]);
    const [isModalVisible, setModalVisible] = useState(false);
    const { user } = useAuth();
    const userId = user?.uid ?? '';
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [preferredUnit, setPreferredUnit] = useState<string>('lbs');

    // Fetch user's preferred unit
    React.useEffect(() => {
        const fetchUnit = async () => {
            if (!userId) return;
            try {
                const userDoc = await getDoc(doc(db, 'clientProfiles', userId));
                if (userDoc.exists()) {
                    setPreferredUnit(userDoc.data().preferredWeightUnit || 'lbs');
                }
            } catch (e) {
                console.error('Error fetching unit preference:', e);
            }
        };
        fetchUnit();
    }, [userId]);

    // Fetch history on mount
    React.useEffect(() => {
        const fetchHistory = async () => {
            if (!userId) return;
            try {
                const q = query(
                    collection(db, 'workoutLogs'),
                    where('clientId', '==', userId),
                    limit(50)
                );
                const snapshot = await getDocs(q);


                const logs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    date: doc.data().createdAt?.toDate()
                })).sort((a: any, b: any) => b.date - a.date); // Sort descending

                setHistoryLogs(logs);
            } catch (err) {
                console.error("Error fetching history:", err);
            }
        };
        fetchHistory();
    }, []);

    // Last Week History Logic
    const getLastWeekLog = () => {
        const today = new Date();
        // Target: 7 days ago
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - 7);

        // Window: +/- 2 days for fuzzy match (5 to 9 days ago)
        // This ensures if they missed exactly 7 days, they still see relevant history
        const minDate = new Date(targetDate); minDate.setDate(minDate.getDate() - 2);
        const maxDate = new Date(targetDate); maxDate.setDate(maxDate.getDate() + 2);

        return historyLogs.find(log => {
            const d = log.date;
            if (!d) return false;
            // Compare timestamps or just dates
            return d >= minDate && d <= maxDate;
        });
    };

    const repeatWorkout = (log: any) => {
        setWorkoutTitle(log.name || 'Repeated Session');
        const exercises = log.exercises.map((ex: any, i: number) => ({
            id: Date.now().toString() + i,
            name: ex.name,
            sets: (ex.sets?.length || 3).toString(),
            weight: (ex.sets?.[0]?.weight || '').toString().replace(/[^0-9.]/g, ''),
            reps: (ex.sets?.[0]?.reps || '10').toString()
        }));
        setSelectedExercises(exercises);
    };

    const getLastPerformance = (exerciseName: string): HistoryStats | null => {
        for (const log of historyLogs) {
            const exInfo = log.exercises?.find((e: any) => e.name === exerciseName);
            if (exInfo && exInfo.sets && exInfo.sets.length > 0) {
                // Get best or first set? Let's get the max weight or first working set.
                // Simpler: Average or Max?
                // For "Copy", usually the first set target is best.
                const firstSet = exInfo.sets[0];
                return {
                    weight: firstSet.weight || '-',
                    reps: firstSet.reps || '-',
                    sets: exInfo.sets.length,
                    date: log.date ? log.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown'
                };
            }
        }
        return null;
    };

    const applyHistory = (id: string, stats: HistoryStats) => {
        updateExercise(id, 'weight', stats.weight.replace(/[^0-9.]/g, ''));
        updateExercise(id, 'reps', stats.reps);
        updateExercise(id, 'sets', stats.sets.toString());
    };

    const handleAddExercise = (name: string) => {
        const newExercise: DetailedExercise = {
            id: Date.now().toString() + Math.random().toString(),
            name,
            sets: '3',
            weight: '',
            reps: '10'
        };
        setSelectedExercises([...selectedExercises, newExercise]);
        setModalVisible(false);
    };

    const updateExercise = (id: string, field: keyof DetailedExercise, value: string) => {
        setSelectedExercises(prev => prev.map(ex =>
            ex.id === id ? { ...ex, [field]: value } : ex
        ));
    };

    const removeExercise = (id: string) => {
        setSelectedExercises(prev => prev.filter(ex => ex.id !== id));
    };

    const startWorkout = () => {
        if (selectedExercises.length === 0) {
            Alert.alert("Add Exercises", "Please add at least one exercise to start.");
            return;
        }

        const newWorkout = {
            id: `w_${Date.now()}`,
            title: workoutTitle.trim() || 'Untitled Session',
            duration: '0 min',
            exercises: selectedExercises.map((ex, exIndex) => {
                const numSets = parseInt(ex.sets) || 3;
                const setArray = Array.from({ length: numSets }, (_, setIndex) => ({
                    id: `s_${exIndex}_${setIndex}`,
                    targetReps: ex.reps || '-',
                    targetWeight: ex.weight || '0',
                    completed: false,
                    actualReps: '',
                    actualWeight: ''
                }));

                return {
                    id: `e_${exIndex}_${Date.now()}`,
                    name: ex.name,
                    sets: setArray,
                    feedback: ''
                };
            })
        };

        navigation.navigate('WorkoutView', { workoutData: newWorkout, mode: 'log' });

        // Reset state
        setWorkoutTitle('');
        setSelectedExercises([]);
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            <View style={tw`pt-12 px-6 pb-4 border-b border-white/5 bg-[${COLORS.backgroundDark}]`}>
                <Text style={tw`text-white font-bold text-xl`}>New Session</Text>
                <Text style={tw`text-slate-400 text-sm`}>Build your workout routine</Text>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={tw`flex-1`}>
                <ScrollView style={tw`flex-1 px-4 py-6`}>

                    {/* Title Input */}
                    <View style={tw`mb-6`}>
                        <Text style={tw`text-slate-500 text-xs font-bold uppercase mb-2`}>Session Name</Text>
                        <TextInput
                            style={tw`bg-white/5 text-white text-lg p-4 rounded-xl font-bold border border-white/10`}
                            placeholder="e.g. Upper Body Power"
                            placeholderTextColor="#64748b"
                            value={workoutTitle}
                            onChangeText={setWorkoutTitle}
                        />
                    </View>

                    {/* Quick Start Option */}
                    <TouchableOpacity
                        onPress={() => {
                            const title = workoutTitle.trim() || `Workout ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                            navigation.navigate('WorkoutView', {
                                workoutData: {
                                    id: Date.now().toString(),
                                    title,
                                    duration: '0 min',
                                    exercises: []
                                }
                            });
                        }}
                        style={tw`flex-row items-center justify-center gap-2 bg-[${COLORS.primary}]/10 p-4 rounded-xl border border-[${COLORS.primary}]/30 mb-8`}
                    >
                        <Zap size={20} color={COLORS.primary} fill={COLORS.primary} fillOpacity={0.2} />
                        <Text style={tw`text-[${COLORS.primary}] font-bold text-lg`}>Start Empty Workout</Text>
                    </TouchableOpacity>

                    <View style={tw`flex-row items-center gap-4 mb-6`}>
                        <View style={tw`h-[1px] bg-white/10 flex-1`} />
                        <Text style={tw`text-slate-500 text-xs font-bold uppercase`}>OR BUILD SESSION</Text>
                        <View style={tw`h-[1px] bg-white/10 flex-1`} />
                    </View>




                    {/* Insight: Last Week Same Day */}
                    {(() => {
                        const lastWeekLog = getLastWeekLog();
                        if (lastWeekLog) {
                            // Calculate KPIs
                            const variations = lastWeekLog.exercises?.length || 0;
                            const totalSets = lastWeekLog.exercises?.reduce((acc: number, ex: any) => acc + (ex.sets?.length || 0), 0) || 0;
                            const avgSets = variations > 0 ? (totalSets / variations).toFixed(1) : '0';

                            let totalWeight = 0;
                            let weightCount = 0;
                            lastWeekLog.exercises?.forEach((ex: any) => {
                                ex.sets?.forEach((s: any) => {
                                    const w = parseFloat(s.weight);
                                    if (!isNaN(w) && w > 0) {
                                        totalWeight += w;
                                        weightCount++;
                                    }
                                });
                            });
                            const avgWeight = weightCount > 0 ? Math.round(totalWeight / weightCount) : 0;
                            const dayName = lastWeekLog.date?.toLocaleDateString('en-US', { weekday: 'long' });

                            return (
                                <View style={tw`mb-8 bg-[${COLORS.backgroundLight}] border border-white/5 p-5 rounded-3xl relative overflow-hidden`}>
                                    {/* Header Row */}
                                    <View style={tw`flex-row justify-between items-start mb-6`}>
                                        <View>
                                            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1`}>
                                                Last {dayName}
                                            </Text>
                                            <Text style={tw`text-white font-bold text-xl tracking-tight`}>
                                                {lastWeekLog.name}
                                            </Text>
                                        </View>

                                        <TouchableOpacity
                                            onPress={() => repeatWorkout(lastWeekLog)}
                                            style={tw`bg-[${COLORS.primary}]/10 p-2.5 rounded-full border border-[${COLORS.primary}]/20`}
                                        >
                                            <RotateCcw size={20} color={COLORS.primary} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Modern KPI Grid */}
                                    <View style={tw`flex-row gap-3`}>
                                        {/* Variation KPI */}
                                        <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl items-center border border-white/5`}>
                                            <View style={tw`bg-[${COLORS.primary}]/10 p-2 rounded-full mb-2`}>
                                                <Dumbbell size={16} color={COLORS.primary} />
                                            </View>
                                            <Text style={tw`text-white text-xl font-bold`}>{variations}</Text>
                                            <Text style={tw`text-slate-500 text-[10px] uppercase font-bold tracking-wider`}>Exercises</Text>
                                        </View>

                                        {/* Sets KPI */}
                                        <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl items-center border border-white/5`}>
                                            <View style={tw`bg-purple-500/10 p-2 rounded-full mb-2`}>
                                                <Layers size={16} color="#a855f7" />
                                            </View>
                                            <Text style={tw`text-white text-xl font-bold`}>{avgSets}</Text>
                                            <Text style={tw`text-slate-500 text-[10px] uppercase font-bold tracking-wider`}>Avg Sets</Text>
                                        </View>

                                        {/* Weight KPI */}
                                        <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl items-center border border-white/5`}>
                                            <View style={tw`bg-orange-500/10 p-2 rounded-full mb-2`}>
                                                <TrendingUp size={16} color="#f97316" />
                                            </View>
                                            <Text style={tw`text-white text-xl font-bold`}>{avgWeight}kg</Text>
                                            <Text style={tw`text-slate-500 text-[10px] uppercase font-bold tracking-wider`}>Avg Load</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        } else {
                            return null;
                        }
                    })()}

                    {/* Exercises List */}
                    <View style={tw`mb-20`}>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <Text style={tw`text-slate-500 text-xs font-bold uppercase`}>Exercises ({selectedExercises.length})</Text>
                            <TouchableOpacity onPress={() => setModalVisible(true)}>
                                <Text style={tw`text-[${COLORS.primary}] font-bold text-sm`}>+ Add Exercise</Text>
                            </TouchableOpacity>
                        </View>

                        {selectedExercises.length === 0 ? (
                            <TouchableOpacity
                                onPress={() => setModalVisible(true)}
                                style={tw`border-2 border-dashed border-white/10 rounded-2xl p-8 items-center justify-center`}
                            >
                                <Dumbbell size={32} color={COLORS.muted} style={tw`mb-2`} />
                                <Text style={tw`text-slate-400 font-bold`}>No exercises added yet</Text>
                                <Text style={tw`text-[${COLORS.primary}] font-bold mt-2`}>Tap to add</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={tw`gap-4`}>
                                {selectedExercises.map((ex, index) => (
                                    <View key={ex.id} style={tw`bg-white/5 p-4 rounded-xl border border-white/5`}>
                                        <View style={tw`flex-row items-center justify-between mb-4`}>
                                            <View style={tw`flex-row items-center gap-3`}>
                                                <View style={tw`w-6 h-6 rounded-full bg-white/10 items-center justify-center`}>
                                                    <Text style={tw`text-slate-400 font-bold text-xs`}>{index + 1}</Text>
                                                </View>
                                                <Text style={tw`text-white font-bold text-base`}>{ex.name}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => removeExercise(ex.id)} style={tw`p-2`}>
                                                <Trash2 size={18} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>

                                        {/* History Badge */}
                                        {(() => {
                                            const stats = getLastPerformance(ex.name);
                                            if (stats) {
                                                return (
                                                    <View style={tw`flex-row items-center justify-between bg-white/5 p-2 rounded-lg mb-4 border border-white/5`}>
                                                        <View style={tw`flex-row items-center gap-2`}>
                                                            <Clock size={12} color={COLORS.primary} />
                                                            <Text style={tw`text-slate-400 text-xs`}>
                                                                Last ({stats.date}): <Text style={tw`text-white font-bold`}>{stats.weight} x {stats.reps}</Text> ({stats.sets} sets)
                                                            </Text>
                                                        </View>
                                                        <TouchableOpacity
                                                            onPress={() => applyHistory(ex.id, stats)}
                                                            style={tw`flex-row items-center gap-1 bg-[${COLORS.primary}]/20 px-2 py-1 rounded`}
                                                        >
                                                            <RotateCcw size={10} color={COLORS.primary} />
                                                            <Text style={tw`text-[${COLORS.primary}] text-[10px] font-bold uppercase`}>Use</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Inputs Row */}
                                        <View style={tw`flex-row gap-3`}>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase mb-1`}>SETS</Text>
                                                <TextInput
                                                    style={tw`bg-black/20 text-white text-center py-2 rounded-lg font-bold border border-white/10`}
                                                    value={ex.sets}
                                                    onChangeText={(text) => updateExercise(ex.id, 'sets', text)}
                                                    keyboardType="numeric"
                                                    placeholder="3"
                                                    placeholderTextColor="#475569"
                                                />
                                            </View>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase mb-1`}>WEIGHT ({preferredUnit.toUpperCase()})</Text>
                                                <TextInput
                                                    style={tw`bg-black/20 text-white text-center py-2 rounded-lg font-bold border border-white/10`}
                                                    value={ex.weight}
                                                    onChangeText={(text) => updateExercise(ex.id, 'weight', text)}
                                                    keyboardType="numeric"
                                                    placeholder="-"
                                                    placeholderTextColor="#475569"
                                                />
                                            </View>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase mb-1`}>REPS</Text>
                                                <TextInput
                                                    style={tw`bg-black/20 text-white text-center py-2 rounded-lg font-bold border border-white/10`}
                                                    value={ex.reps}
                                                    onChangeText={(text) => updateExercise(ex.id, 'reps', text)}
                                                    keyboardType="numeric"
                                                    placeholder="10"
                                                    placeholderTextColor="#475569"
                                                />
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            style={tw`mt-4 py-3 items-center border border-white/10 rounded-xl border-dashed`}
                        >
                            <Text style={tw`text-slate-400 font-bold text-sm`}>+ Add Another Exercise</Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Footer Action (Adjusted for Tab Bar) */}
            <View style={tw`p-6 pb-24 border-t border-white/5 bg-[${COLORS.backgroundDark}]`}>
                <TouchableOpacity
                    onPress={startWorkout}
                    style={tw`w-full bg-[${COLORS.primary}] h-14 rounded-xl items-center justify-center shadow-lg flex-row gap-2 ${selectedExercises.length === 0 ? 'opacity-50' : ''}`}
                    disabled={selectedExercises.length === 0}
                >
                    <PlayCircle size={24} color="black" />
                    <Text style={tw`text-black text-lg font-black tracking-wide uppercase`}>Start Planned Session</Text>
                </TouchableOpacity>
            </View>

            {/* Exercise Picker Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={tw`flex-1 justify-end bg-black/80`}>
                    <View style={tw`bg-[${COLORS.background}] h-[70%] rounded-t-3xl border-t border-white/10`}>
                        <View style={tw`p-4 border-b border-white/10 flex-row justify-between items-center`}>
                            <Text style={tw`text-white font-bold text-lg`}>Select Exercise</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={tw`text-slate-400`}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={tw`flex-1 p-4`}>
                            {COMMON_EXERCISES.map((ex, i) => (
                                <TouchableOpacity
                                    key={i}
                                    onPress={() => handleAddExercise(ex)}
                                    style={tw`p-4 bg-white/5 mb-3 rounded-xl border border-white/5 flex-row justify-between items-center`}
                                >
                                    <Text style={tw`text-white font-bold`}>{ex}</Text>
                                    <Plus size={20} color={COLORS.primary} />
                                </TouchableOpacity>
                            ))}
                            <View style={tw`h-10`} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View >
    );
}
