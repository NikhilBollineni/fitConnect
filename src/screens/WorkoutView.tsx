import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { parseWeight, parseReps, parseDuration, calculateTotalVolume, WorkoutLogExercise } from '../types/firestore';
import {
    ArrowLeft, CheckCircle2, Circle, Clock, Save,
    TrendingUp, TrendingDown, Minus, Sparkles, Zap, Plus, Dumbbell,
    ChevronDown, Trophy
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp, doc, getDoc, query, where, orderBy, limit, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import VictoryModal from './SmartLog/VictoryModal';
import SmartIntercept from '../components/SmartLog/SmartIntercept';
import MissionBar from '../components/SmartLog/MissionBar';
import LiveVolumeChart from '../components/LiveVolumeChart';
import { aiService } from '../services/aiService';
import SmartExercisePicker from '../components/SmartLog/SmartExercisePicker';
import { COLORS } from '../constants/theme';
import { getConvertedWeight, convertWeight, WeightUnit as Unit } from '../utils/unitConversion';

import WorkoutLogAnalytics from '../components/SmartLog/WorkoutLogAnalytics';
import LastSessionInsight from '../components/SmartLog/LastSessionInsight';
import ExerciseProgressionChart from '../components/SmartLog/ExerciseProgressionChart';

// ─── Types ───
interface SetData {
    id: string;
    targetReps: string;
    targetWeight: string;
    completed: boolean;
    actualReps: string;
    actualWeight: string;
}

interface ExerciseData {
    id: string;
    name: string;
    sets: SetData[];
    feedback?: string;
}

interface WorkoutData {
    id: string;
    title: string;
    duration: string;
    exercises: ExerciseData[];
}

interface PreviousExerciseData {
    name: string;
    sets: { weight: number; reps: number; weightUnit: Unit }[];
}

// ─── Mock Data ───

// ─── Ghost Volume Helper ───
function computeGhostCumulativeVolume(prevExercises: PreviousExerciseData[] | null, preferredUnit: Unit): number[] {
    if (!prevExercises || prevExercises.length === 0) return [];
    const volumes: number[] = [];
    let cumulative = 0;
    for (const ex of prevExercises) {
        for (const set of ex.sets) {
            // Convert historical weight to today's preferred unit before summing volume
            const convertedWeight = convertWeight(set.weight, set.weightUnit, preferredUnit);
            cumulative += convertedWeight * (set.reps || 0);
            volumes.push(cumulative);
        }
    }
    return volumes;
}

function countTotalSets(exercises: ExerciseData[]): number {
    return exercises.reduce((total, ex) => total + ex.sets.length, 0);
}

// ─── Utility Functions ───
function calcVolume(exercises: ExerciseData[]): number {
    return exercises.reduce((total, ex) => {
        return total + ex.sets.reduce((exTotal, set) => {
            if (!set.completed) return exTotal;
            // actualWeight is always a raw number in the user's preferred unit
            const weight = parseFloat(set.actualWeight) || 0;
            const reps = parseFloat(set.actualReps) || 0;
            return exTotal + (weight * reps);
        }, 0);
    }, 0);
}

function calcTotalReps(exercises: ExerciseData[]): number {
    return exercises.reduce((total, ex) => {
        return total + ex.sets.reduce((exTotal, set) => {
            if (!set.completed) return exTotal;
            return exTotal + (parseFloat(set.actualReps) || 0);
        }, 0);
    }, 0);
}

function calcAvgWeight(exercises: ExerciseData[]): number {
    let totalWeight = 0;
    let count = 0;
    exercises.forEach(ex => {
        ex.sets.forEach(set => {
            if (set.completed && set.actualWeight) {
                totalWeight += parseFloat(set.actualWeight) || 0;
                count++;
            }
        });
    });
    return count > 0 ? totalWeight / count : 0;
}

function calcPrevVolume(prevExercises: PreviousExerciseData[], preferredUnit: Unit): number {
    return prevExercises.reduce((total, ex) => {
        return total + ex.sets.reduce((exTotal, set) => {
            const weight = convertWeight(set.weight, set.weightUnit, preferredUnit);
            return exTotal + (weight * set.reps);
        }, 0);
    }, 0);
}

function calcPrevTotalReps(prevExercises: PreviousExerciseData[]): number {
    return prevExercises.reduce((total, ex) => {
        return total + ex.sets.reduce((exTotal, set) => exTotal + set.reps, 0);
    }, 0);
}

function calcPrevAvgWeight(prevExercises: PreviousExerciseData[], preferredUnit: Unit): number {
    let totalWeight = 0;
    let count = 0;
    prevExercises.forEach(ex => {
        ex.sets.forEach(set => {
            totalWeight += convertWeight(set.weight, set.weightUnit, preferredUnit);
            count++;
        });
    });
    return count > 0 ? totalWeight / count : 0;
}

function getExercisePrevData(exerciseName: string, prevExercises: PreviousExerciseData[] | null): PreviousExerciseData | null {
    if (!prevExercises) return null;
    return prevExercises.find(pe => pe.name === exerciseName) || null;
}

function formatDelta(current: number, previous: number): { value: string; direction: 'up' | 'down' | 'same'; percent: string } {
    const diff = current - previous;
    const pct = previous > 0 ? Math.abs((diff / previous) * 100) : 0;
    if (Math.abs(diff) < 0.5) return { value: '0', direction: 'same', percent: '0%' };
    return {
        value: diff > 0 ? `+${diff.toFixed(0)}` : diff.toFixed(0),
        direction: diff > 0 ? 'up' : 'down',
        percent: `${pct.toFixed(0)}%`,
    };
}

// ─── Delta Badge Component ───
function DeltaBadge({ label, current, previous, unit }: { label: string; current: number; previous: number; unit: string }) {
    const delta = formatDelta(current, previous);
    const color = delta.direction === 'up' ? '#4ade80' : delta.direction === 'down' ? '#f87171' : '#94a3b8';
    const bgColor = delta.direction === 'up' ? 'bg-green-500/15' : delta.direction === 'down' ? 'bg-red-500/15' : 'bg-white/5';
    const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus;

    return (
        <View style={tw`flex-1 ${bgColor} rounded-xl p-3 items-center`}>
            <Text style={tw`text-slate-400 text-[10px] font-bold uppercase mb-1`}>{label}</Text>
            <Text style={tw`text-white font-bold text-base`}>{current.toFixed(0)}<Text style={tw`text-slate-400 text-xs`}> {unit}</Text></Text>
            <View style={tw`flex-row items-center gap-1 mt-1`}>
                <Icon size={12} color={color} />
                <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{delta.value} ({delta.percent})</Text>
            </View>
        </View>
    );
}


// ─── Main Component ───
export default function WorkoutView({ route }: { route: any }) {
    const navigation = useNavigation();
    const { workoutData, mode = 'log' } = route?.params || {};
    const isReviewMode = mode === 'review';

    const { user } = useAuth();
    const userId = user?.uid ?? 'anonymous';

    const initialValues: WorkoutData = workoutData
        ? { ...workoutData, title: workoutData.title || workoutData.name || 'Workout', duration: workoutData.duration || '45 min', exercises: workoutData.exercises || [] }
        : { id: 'empty', title: 'Workout', duration: '45 min', exercises: [] };
    const [workout, setWorkout] = useState<WorkoutData>(initialValues);
    const [loadingLog, setLoadingLog] = useState(false);

    // Previous Session Data
    // const previousSession = null; // Removed hardcoded null
    // Fetch User's Trainer ID & Previous Session Data
    const [trainerId, setTrainerId] = useState<string | null>(null);
    const [lastSessionData, setLastSessionData] = useState<PreviousExerciseData[] | null>(null);
    const [preferredUnit, setPreferredUnit] = useState<string>('kg'); // Changed default to kg, will be updated from profile

    const isFirstSession = isReviewMode && lastSessionData === null;

    // ─── Fetch full workout log when opened from chat (only ID was passed) ───
    useEffect(() => {
        if (!isReviewMode || !workoutData?.id || (workoutData.exercises && workoutData.exercises.length > 0)) return;

        const fetchWorkoutLog = async () => {
            setLoadingLog(true);
            try {
                const logDoc = await getDoc(doc(db, 'workoutLogs', workoutData.id));
                if (logDoc.exists()) {
                    const data = logDoc.data();
                    const exercises: ExerciseData[] = (data.exercises || []).map((ex: any, eIdx: number) => ({
                        id: ex.id || `ex-${eIdx}`,
                        name: ex.name || 'Exercise',
                        sets: (ex.sets || []).map((s: any, sIdx: number) => ({
                            id: s.id || `set-${eIdx}-${sIdx}`,
                            targetWeight: String(s.weight ?? s.targetWeight ?? ''),
                            targetReps: String(s.reps ?? s.targetReps ?? ''),
                            actualWeight: String(s.actualWeight ?? s.weight ?? ''),
                            actualReps: String(s.actualReps ?? s.reps ?? ''),
                            completed: s.completed ?? true,
                        })),
                    }));

                    setWorkout({
                        id: logDoc.id,
                        title: data.title || data.name || 'Workout',
                        duration: data.duration || '45 min',
                        exercises,
                        createdAt: data.createdAt,
                        clientId: data.clientId,
                    } as any);
                }
            } catch (e) {
                console.error('Error fetching workout log for review:', e);
            } finally {
                setLoadingLog(false);
            }
        };

        fetchWorkoutLog();
    }, [isReviewMode, workoutData?.id]);

    useEffect(() => {
        const fetchUserData = async () => {
            if (!userId || userId === 'anonymous') return;
            try {
                // 1. Fetch User Profile (Trainer ID & Unit Preference)
                const userDoc = await getDoc(doc(db, 'clientProfiles', userId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setTrainerId(data.trainerId || null);
                    setPreferredUnit(data.preferredWeightUnit || 'lbs');
                }

                // 2. Fetch Last Session for this Workout
                const logsQuery = query(
                    collection(db, 'workoutLogs'),
                    where('clientId', '==', userId),
                    orderBy('createdAt', 'desc'),
                    limit(20) // Check last 20 logs for a match
                );

                const querySnapshot = await getDocs(logsQuery);

                // Filter ensuring title match and completion
                const candidates = querySnapshot.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter((d: any) => d.title === workout.title && d.status === 'completed');

                let matchingLog: any = null;

                if (isReviewMode && (workout as any).createdAt) {
                    // In review mode: Find the most recent log strictly OLDER than the current one
                    const woCreated = (workout as any).createdAt;
                    const currentReviewTime = woCreated.seconds || (woCreated.toDate ? woCreated.toDate().getTime() / 1000 : Date.now() / 1000);
                    matchingLog = candidates.find((d: any) => {
                        const logTime = d.createdAt?.seconds || 0;
                        return logTime < currentReviewTime;
                    });
                } else {
                    // In log mode: Use the most recent completed log
                    matchingLog = candidates.length > 0 ? candidates[0] : null;
                }

                if (matchingLog) {
                    const prevExercises: PreviousExerciseData[] = (matchingLog.exercises || [])
                        .filter((ex: any) => ex && ex.name) // Safety check for valid exercise objects
                        .map((ex: any) => ({
                            name: ex.name,
                            sets: (ex.sets || []).map((s: any) => ({
                                weight: s.weight || 0,
                                reps: s.reps || 0,
                                weightUnit: s.weightUnit || 'lbs' // Fallback to lbs for very old logs
                            }))
                        }));
                    setLastSessionData(prevExercises);
                } else {
                    setLastSessionData(null);
                }

            } catch (e) {
                console.error("Error fetching user data:", e);
            }
        };
        fetchUserData();
    }, [userId, workout.title, isReviewMode, (workout as any).createdAt]);

    // Computed KPIs
    const currentVolume = useMemo(() => calcVolume(workout.exercises), [workout]);
    const currentReps = useMemo(() => calcTotalReps(workout.exercises), [workout]);
    const currentAvgWeight = useMemo(() => calcAvgWeight(workout.exercises), [workout]);

    const prevVolume = lastSessionData ? calcPrevVolume(lastSessionData, preferredUnit as Unit) : 0;
    const prevReps = lastSessionData ? calcPrevTotalReps(lastSessionData) : 0;
    // const prevAvgWeight = lastSessionData ? calcPrevAvgWeight(lastSessionData) : 0; // Unused but available

    // ─── Elapsed Time Tracking (C1) ───
    const workoutStartTime = useRef(Date.now());
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isReviewMode) return;
        workoutStartTime.current = Date.now();
        elapsedIntervalRef.current = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - workoutStartTime.current) / 1000));
        }, 1000);
        return () => {
            if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
        };
    }, [isReviewMode]);

    const formatElapsedTime = useCallback((totalSec: number) => {
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, []);

    // ─── Focus Mode State ───
    const [viewMode, setViewMode] = useState<'list' | 'focus'>('list');
    const [expandedExerciseIndex, setExpandedExerciseIndex] = useState<number | null>(0);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    const [currentSetIndex, setCurrentSetIndex] = useState(0);
    const [isResting, setIsResting] = useState(false);
    const [restSeconds, setRestSeconds] = useState(60);
    const [restTimer, setRestTimer] = useState(0);
    const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);

    // New State for Adding Exercises
    const [isModalVisible, setModalVisible] = useState(false);
    const [showVictory, setShowVictory] = useState(false);
    const [showPR, setShowPR] = useState(false);
    const [prWeight, setPrWeight] = useState(0);
    const prOpacity = useRef(new Animated.Value(0)).current;
    const prScale = useRef(new Animated.Value(0.5)).current;

    // Smart Intercept State
    const [interceptVisible, setInterceptVisible] = useState(false);
    const [completedPercent, setCompletedPercent] = useState(0);
    const [remainingExercises, setRemainingExercises] = useState<string[]>([]);

    // ─── AI Coaching Tips ───
    const [aiTip, setAiTip] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    useEffect(() => {
        const fetchTip = async () => {
            if (isReviewMode) return;
            setIsAiLoading(true);
            const exercise = workout.exercises[currentExerciseIndex];

            // Get stats from last session if available
            const cleanName = exercise.name.trim();
            const prevEx = lastSessionData?.find(p => p.name === cleanName);

            if (prevEx && prevEx.sets.length > 0) {
                const lastSet = prevEx.sets[0];
                // Only fetch if we have some history context
                // Convert weight to preferred unit for AI prompt consistency
                const convertedWeight = convertWeight(lastSet.weight, lastSet.weightUnit, preferredUnit as Unit);
                const tip = await aiService.getCoachingTip(exercise.name, convertedWeight, lastSet.reps, preferredUnit as Unit);
                setAiTip(tip);
            } else {
                setAiTip(null);
            }
            setIsAiLoading(false);
        };
        fetchTip();
    }, [currentExerciseIndex, lastSessionData]);

    // ─── Live Performance Chart State ───
    const [volumeHistory, setVolumeHistory] = useState<number[]>([]);
    const [exerciseHistory, setExerciseHistory] = useState<number[]>([]);
    const [activeExerciseWeights, setActiveExerciseWeights] = useState<number[]>([]);
    const [historySetSnapshot, setHistorySetSnapshot] = useState<any[]>([]); // Full set data for pre-fill
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [lastSessionDate, setLastSessionDate] = useState<Date | null>(null);
    const [exerciseProgressionData, setExerciseProgressionData] = useState<{ date: string; weight: number; originalDate: Date }[]>([]);



    // C4: Reset history when workout changes
    useEffect(() => {
        setVolumeHistory([]);
        setExerciseHistory([]);
        setActiveExerciseWeights([]);
    }, [workout.id]);

    // Phase 5: Fetch movement-specific history (Last Session Comparison + All-time Bests)
    const [bestWeight, setBestWeight] = useState(0);
    const [totalSetsHistory, setTotalSetsHistory] = useState(0);
    const [totalRepsHistory, setTotalRepsHistory] = useState(0);

    useEffect(() => {
        const fetchExHistory = async () => {
            if (!userId || userId === 'anonymous' || isReviewMode) return;

            setIsHistoryLoading(true);
            setLastSessionDate(null);
            setExerciseProgressionData([]);
            try {
                const activeEx = workout.exercises[currentExerciseIndex];
                if (!activeEx || !activeEx.name) return; // Guard against undefined exercise
                const cleanName = activeEx.name.trim();

                // 1. Fetch today's current progress for this exercise
                const todayWeights = activeEx.sets
                    .filter(s => s.completed && s.actualWeight)
                    .map(s => parseFloat(s.actualWeight) || 0);
                setActiveExerciseWeights(todayWeights);

                // 2. Query last 5 logs to find the most recent session with this exercise
                const logsQuery = query(
                    collection(db, 'workoutLogs'),
                    where('clientId', '==', userId),
                    where('status', '==', 'completed'),
                    orderBy('createdAt', 'desc'),
                    limit(10)
                );

                const snapshot = await getDocs(logsQuery);
                let lastSessionWeights: number[] = [];
                let lastSessionSetSnapshot: any[] = [];
                let lastSessionDateLocal: Date | null = null;

                for (const docSnap of snapshot.docs) {
                    const data = docSnap.data();
                    const ex = (data.exercises || []).find((e: any) => e?.name?.trim() === cleanName);
                    if (ex && ex.sets && ex.sets.some((s: any) => s.weight)) {
                        lastSessionWeights = ex.sets.map((s: any) =>
                            getConvertedWeight(s.weight || (s.actualWeight || 0), preferredUnit as Unit)
                        );
                        lastSessionSetSnapshot = ex.sets.map((s: any) => ({
                            weight: getConvertedWeight(s.weight || (s.actualWeight || 0), preferredUnit as Unit),
                            reps: s.reps || s.actualReps || 0
                        }));
                        lastSessionDateLocal = (data.completedAt || data.createdAt)?.toDate?.() || new Date();
                        break; // Found the most recent session
                    }
                }

                // 3. Query ALL logs for this exercise to find Best Weight & Totals (Optimization: limit 50 for now)
                // In production, bests should be stored in a separate 'ExerciseStats' collection to avoid heavy reads.
                const historyQuery = query(
                    collection(db, 'workoutLogs'),
                    where('clientId', '==', userId),
                    where('status', '==', 'completed'),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                );

                const historySnapshot = await getDocs(historyQuery);
                let maxWeight = 0;
                let setsCount = 0;
                let repsCount = 0;
                const progressionMap: { date: string; weight: number; originalDate: Date }[] = [];

                historySnapshot.docs.forEach(docSnap => {
                    const d = docSnap.data();
                    const ex = (d.exercises || []).find((e: any) => e?.name?.trim() === cleanName);
                    if (ex && ex.sets) {
                        let sessionMaxWeight = 0;
                        setsCount += ex.sets.length;
                        ex.sets.forEach((s: any) => {
                            const w = getConvertedWeight(s.weight || (s.actualWeight || 0), preferredUnit as Unit);
                            const r = parseInt(s.reps || s.actualReps) || 0;
                            if (w > maxWeight) maxWeight = w;
                            if (w > sessionMaxWeight) sessionMaxWeight = w;
                            repsCount += r;
                        });
                        if (sessionMaxWeight > 0) {
                            const logDate = (d.completedAt || d.createdAt)?.toDate?.() || new Date();
                            progressionMap.push({
                                date: logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                weight: sessionMaxWeight,
                                originalDate: logDate,
                            });
                        }
                    }
                });

                // Sort ascending by date for chart display
                progressionMap.sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime());

                setBestWeight(maxWeight);
                setTotalSetsHistory(setsCount);
                setTotalRepsHistory(repsCount);
                setExerciseHistory(lastSessionWeights);
                setHistorySetSnapshot(lastSessionSetSnapshot);
                setLastSessionDate(lastSessionDateLocal);
                setExerciseProgressionData(progressionMap);
            } catch (error) {
                console.error("Error fetching exercise history:", error);
            } finally {
                setIsHistoryLoading(false);
            }
        };

        fetchExHistory();
    }, [currentExerciseIndex, userId, preferredUnit]);


    const ghostVolumeData = useMemo(() => {
        if (isReviewMode) {
            return computeGhostCumulativeVolume(null, preferredUnit as Unit);
        }
        return computeGhostCumulativeVolume(lastSessionData, preferredUnit as Unit);
    }, [workout.id, isReviewMode, lastSessionData, preferredUnit]);
    const totalSetsCount = useMemo(() => countTotalSets(workout.exercises), [workout.exercises]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (timerInterval) clearInterval(timerInterval);
        };
    }, [timerInterval]);

    // ─── Actions ───
    const handleAddExercise = (name: string) => {
        const updated = structuredClone(workout);
        const newExercise: ExerciseData = {
            id: `e_${Date.now()}`,
            name,
            sets: [
                { id: `s_${Date.now()}_1`, targetReps: '10', targetWeight: '0', completed: false, actualReps: '', actualWeight: '' },
                { id: `s_${Date.now()}_2`, targetReps: '10', targetWeight: '0', completed: false, actualReps: '', actualWeight: '' },
                { id: `s_${Date.now()}_3`, targetReps: '10', targetWeight: '0', completed: false, actualReps: '', actualWeight: '' }
            ],
            feedback: ''
        };
        updated.exercises.push(newExercise);
        setWorkout(updated);
        setModalVisible(false);
    };

    const toggleSet = (exerciseIndex: number, setIndex: number) => {
        if (isReviewMode) return;
        const updated = structuredClone(workout);
        const set = updated.exercises[exerciseIndex].sets[setIndex];
        set.completed = !set.completed;
        // U3: Smart conversion from targetWeight (e.g. '100lbs' -> 45kg)
        set.actualWeight = set.completed ? getConvertedWeight(set.targetWeight, preferredUnit as Unit).toString() : '';
        set.actualReps = set.completed ? (set.targetReps || '0').toString().split('-').pop() || '0' : '';
        setWorkout(updated);

        // Update activeExerciseWeights if this is the current exercise in focus mode
        if (exerciseIndex === currentExerciseIndex) {
            const todayWeights = updated.exercises[exerciseIndex].sets
                .filter(s => s.completed && s.actualWeight)
                .map(s => parseFloat(s.actualWeight) || 0);
            setActiveExerciseWeights(todayWeights);
        }
    };

    const updateSet = (exerciseIndex: number, setIndex: number, field: string, value: string) => {
        if (isReviewMode) return;
        const updated = structuredClone(workout);
        updated.exercises[exerciseIndex].sets[setIndex][field] = value;
        setWorkout(updated);
    };

    const updateFeedback = (exerciseIndex: number, text: string) => {
        const updated = structuredClone(workout);
        updated.exercises[exerciseIndex].feedback = text;
        setWorkout(updated);
    };

    const addSet = (exerciseIndex: number) => {
        const updated = structuredClone(workout);
        const newSet: SetData = {
            id: `s_${Date.now()}`,
            targetReps: '10',
            targetWeight: '0',
            completed: false,
            actualReps: '',
            actualWeight: ''
        };
        updated.exercises[exerciseIndex].sets.push(newSet);
        setWorkout(updated);
    };

    const toggleExerciseAccordion = (index: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setExpandedExerciseIndex(prev => prev === index ? null : index);
    };

    // --- SMART PRE-FILL LOGIC ---
    useEffect(() => {
        if (isReviewMode || isHistoryLoading || historySetSnapshot.length === 0) return;

        const currentExercise = workout.exercises[currentExerciseIndex];
        const currentSet = currentExercise.sets[currentSetIndex];

        // Only pre-fill if the fields are empty and not completed
        if (!currentSet.completed && !currentSet.actualWeight && !currentSet.actualReps) {
            const historicalSet = historySetSnapshot[currentSetIndex] || historySetSnapshot[historySetSnapshot.length - 1];
            if (historicalSet) {
                const updatedExercises = [...workout.exercises];
                updatedExercises[currentExerciseIndex].sets[currentSetIndex] = {
                    ...currentSet,
                    actualWeight: historicalSet.weight.toString(),
                    actualReps: historicalSet.reps.toString(),
                };
                setWorkout({ ...workout, exercises: updatedExercises });
            }
        }
    }, [currentExerciseIndex, currentSetIndex, historySetSnapshot, isHistoryLoading]);

    const handleFinish = () => {
        // Calculate progress
        let totalSets = 0;
        let completedSets = 0;
        const remainingNames: string[] = [];

        workout.exercises.forEach(ex => {
            let exCompleted = 0;
            ex.sets.forEach(s => {
                totalSets++;
                if (s.completed) {
                    completedSets++;
                    exCompleted++;
                }
            });
            if (exCompleted < ex.sets.length) {
                remainingNames.push(ex.name);
            }
        });

        const percent = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

        if (completedSets === 0 && !isReviewMode) {
            Alert.alert("Empty Workout", "You haven't completed any sets yet! Log at least one set to finish.");
            return;
        }

        if (percent < 100 && !isReviewMode) {
            setCompletedPercent(percent);
            setRemainingExercises(remainingNames);
            setInterceptVisible(true);
        } else {
            saveWorkout();
        }
    };

    const saveWorkout = async () => {
        if (isReviewMode) {
            // MOCK HANDLING
            if (workout.id && (workout.id.startsWith('mock') || workout.id.startsWith('log_m'))) {
                setTimeout(() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert("Feedback Sent", "Your feedback has been saved and the client notified.");
                    navigation.goBack();
                }, 1000);
                return;
            }

            try {
                // 1. Update the existing workout log
                const logRef = doc(db, 'workoutLogs', workout.id);

                // Map exercises to preserve feedback/notes
                // We need to match the structure of WorkoutLogExercise in Firestore
                // Since we are in review mode, we assume the structure matches what we fetched
                const updatedExercises = workout.exercises.map(ex => ({
                    // We need to keep original data but update notes/feedback
                    name: ex.name,
                    sets: ex.sets.map(s => ({
                        // Reconstruct set object compatible with Firestore
                        weight: parseFloat(s.actualWeight) || 0,
                        weightUnit: preferredUnit as Unit, // Assume preferred unit of trainer for now or keep original?
                        // Ideally, we shouldn't change weight/reps here, just feedback.
                        // But providing full object is safer for overwrite.
                        reps: parseReps(s.actualReps),
                        completed: s.completed,
                        // If we had IDs in firestore they might be lost here if not careful, 
                        // but standard array replace is usually fine for these small lists.
                    })),
                    notes: ex.feedback || '', // This is the key part: saving the trainer's feedback
                }));

                await updateDoc(logRef, {
                    reviewed: true,
                    reviewedAt: serverTimestamp(),
                    exercises: updatedExercises
                });

                // 2. Notify User via Chat
                // We need the clientId. workoutData from route might not have it directly if we only passed ID/Title/ex.
                // But we fetched 'lastSessionData' using 'userId'.
                // In review mode, 'userId' comes from AuthContext -> which is the TRAINER.
                // Wait, 'userId' in WorkoutView uses useAuth(). In review mode, that's the TRAINER's ID.
                // We need the CLIENT'S ID to send the message to the correct chat.
                // The 'workoutData' passed from TrainerReviewsScreen should ideally include clientId.
                // Let's check TrainerReviewsScreen... yes, we passed 'id', 'title', etc. but maybe not clientId.
                // We need to pass clientId param to WorkoutView for this to work perfectly.
                // CHECK: In TrainerReviewsScreen we navigate with: 
                // workoutData: { id: workout.id, ... exercises: ... }
                // We should add clientId to that payload.

                // Assuming we fix TrainerReviewsScreen to pass clientId in route.params.clientId (or inside workoutData)
                const targetClientId = route.params?.clientId || route.params?.workoutData?.clientId;

                if (targetClientId) {
                    // Find chat between Trainer (user.uid) and Client (targetClientId)
                    // Or just any chat with targetClientId if we assume 1:1
                    const chatQuery = query(
                        collection(db, 'chats'),
                        where('participants', 'array-contains', targetClientId)
                    );
                    const chatSnapshot = await getDocs(chatQuery);
                    let chatId = null;

                    if (!chatSnapshot.empty) {
                        chatId = chatSnapshot.docs[0].id;

                        await addDoc(collection(db, 'chats', chatId, 'messages'), {
                            _id: Math.random().toString(36).substring(7),
                            text: `📝 Feedback posted for: ${workout.title}`,
                            createdAt: serverTimestamp(),
                            senderId: user?.uid, // Trainer
                            senderName: user?.displayName || 'Coach',
                            senderAvatar: user?.photoURL, // Optional
                            metadata: {
                                type: 'workout_feedback',
                                workoutId: workout.id,
                                workoutTitle: workout.title,
                            }
                        });

                        // Update lastMessage for instant UI feedback.
                        // unreadCount is handled by the Cloud Function (onMessageCreated).
                        await updateDoc(doc(db, 'chats', chatId), {
                            lastMessage: `📝 Feedback: ${workout.title}`,
                            updatedAt: serverTimestamp(),
                        });
                    }
                }

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("Feedback Sent", "Your feedback has been saved and the client notified.");
                navigation.goBack();

            } catch (error) {
                console.error("Error saving review:", error);
                Alert.alert("Error", "Failed to save feedback. Please try again.");
            }
        } else {
            try {
                // Build typed exercises with numeric values
                const typedExercises: WorkoutLogExercise[] = workout.exercises
                    .filter(ex => ex.sets && ex.sets.length > 0)
                    .map(ex => ({
                        name: ex.name,
                        sets: (ex.sets || []).filter(s => s.completed).map(s => {
                            // actualWeight is always a plain number in the user's preferred unit
                            const rawWeight = (s.actualWeight || s.targetWeight || '0').toString().replace(/[^0-9.]/g, '');
                            return {
                                weight: parseFloat(rawWeight) || 0,
                                weightUnit: preferredUnit as Unit,
                                reps: parseReps(s.actualReps || s.targetReps),
                                completed: true,
                            };
                        }),
                        notes: ex.feedback || '',
                    }))
                    .filter(ex => ex.sets.length > 0);

                const totalVolume = calculateTotalVolume(typedExercises);

                const logData = {
                    title: workout.title,
                    clientId: userId,
                    trainerId: trainerId,
                    planId: null as string | null,
                    status: 'completed' as const,
                    duration: Math.round(elapsedSeconds / 60) || 1,
                    exercises: typedExercises,
                    totalVolume,
                    createdAt: Timestamp.now(),
                    completedAt: Timestamp.now(),
                };

                const docRef = await addDoc(collection(db, 'workoutLogs'), logData);

                // --- P4: Update Streak (Server-side aggregation) ---
                try {
                    const profileRef = doc(db, 'clientProfiles', userId);
                    const profileDoc = await getDoc(profileRef);

                    if (profileDoc.exists()) {
                        const profileData = profileDoc.data();
                        const lastDate = profileData.lastWorkoutDate?.toDate ? profileData.lastWorkoutDate.toDate() : null;

                        const now = new Date();
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Clear time

                        let newStreak = profileData.streak || 0;

                        if (lastDate) {
                            const last = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                            const diffTime = Math.abs(today.getTime() - last.getTime());
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            if (diffDays === 1) {
                                // Consecutive day
                                newStreak += 1;
                            } else if (diffDays > 1) {
                                // Broken streak
                                newStreak = 1;
                            }
                            // If diffDays === 0 (same day), do nothing to streak
                        } else {
                            // First workout ever
                            newStreak = 1;
                        }

                        await updateDoc(profileRef, {
                            streak: newStreak,
                            lastWorkoutDate: serverTimestamp(),
                            totalWorkouts: (profileData.totalWorkouts || 0) + 1
                        });
                    }
                } catch (streakError) {
                    console.error("Error updating streak:", streakError);
                }
                // ---------------------------------------------------

                // --- NEW: Post to Chat ---
                // Dynamically find the correct Chat ID for this user
                let chatId = `chat_${userId}`; // Dynamic fallback
                try {

                    // userId is already available from useAuth above
                    // Find any chat where this user is a participant

                    // Find any chat where this user is a participant
                    const chatQuery = query(
                        collection(db, 'chats'),
                        where('participants', 'array-contains', userId)
                    );
                    const chatSnapshot = await getDocs(chatQuery);

                    if (!chatSnapshot.empty) {
                        chatId = chatSnapshot.docs[0].id;

                    } else {
                        // Create a new chat if none exists!


                        // FIX: Include trainer immediately if known
                        const participants = trainerId ? [userId, trainerId] : [userId];

                        const newChatRef = await addDoc(collection(db, 'chats'), {  // Auto-create chat
                            participants,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            lastMessage: 'Chat started',
                            unreadCount: { [userId]: 0 }
                        });
                        chatId = newChatRef.id;
                    }

                    const totalLoad = workout.exercises.reduce((acc, ex) => {
                        return acc + ex.sets.filter(s => s.completed).reduce((sAcc, s) => sAcc + (parseFloat(s.actualWeight) || 0) * (parseFloat(s.actualReps) || 0), 0);
                    }, 0);

                    await addDoc(collection(db, 'chats', chatId, 'messages'), {
                        _id: Math.random().toString(36).substring(7),
                        text: `🏋️‍♂️ Completed: ${workout.title}`,
                        createdAt: serverTimestamp(),
                        senderId: userId,
                        senderName: user?.displayName || 'Client',
                        senderAvatar: user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || 'C')}`,
                        metadata: {
                            type: 'workout_summary',
                            workoutId: docRef.id,
                            workoutTitle: workout.title,
                            duration: Math.round(elapsedSeconds / 60) || 1,
                            exercisesCount: workout.exercises.length,
                            totalVolume: Math.round(totalVolume),
                        }
                    });

                    // Update chat last message
                    await updateDoc(doc(db, 'chats', chatId), {
                        lastMessage: `🏋️‍♂️ Completed: ${workout.title}`,
                        updatedAt: serverTimestamp()
                    });

                } catch (chatError) {
                    console.error("Error posting to chat:", chatError);
                    // Don't block the UI if chat post fails
                }
                // -------------------------

                // Show Victory Modal instead of navigating away
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setShowVictory(true);
                // navigation is handled by modal close

            } catch (error) {
                console.error("Error saving workout:", error);
                Alert.alert("Error", "Failed to save workout. Please try again.");
            }
        }
    };

    // ─── PR Celebration ───
    const triggerPRCelebration = () => {
        setShowPR(true);
        prOpacity.setValue(0);
        prScale.setValue(0.5);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 400);

        Animated.parallel([
            Animated.spring(prScale, {
                toValue: 1,
                tension: 60,
                friction: 6,
                useNativeDriver: true,
            }),
            Animated.timing(prOpacity, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();

        // Auto-dismiss after 2.5 seconds
        setTimeout(() => {
            Animated.timing(prOpacity, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }).start(() => setShowPR(false));
        }, 2500);
    };

    // ─── Focus Mode Logic ───
    const handleLogSet = () => {
        // 1. Mark current set as complete
        const updated = structuredClone(workout);
        const currentSet = updated.exercises[currentExerciseIndex].sets[currentSetIndex];

        currentSet.completed = true;
        // Pre-fill actuals from targets if user didn't adjust
        // U3: Smart conversion from targetWeight (e.g. '100lbs' -> 45kg)
        if (!currentSet.actualWeight) {
            currentSet.actualWeight = getConvertedWeight(currentSet.targetWeight, preferredUnit as Unit).toString();
        }
        if (!currentSet.actualReps) {
            const repsStr = (currentSet.targetReps || '0').toString();
            currentSet.actualReps = repsStr.split('-').pop() || repsStr;
        }

        // Carry forward: pre-fill the NEXT set's weight/reps from what the user just did
        const exerciseSets = updated.exercises[currentExerciseIndex].sets;
        if (currentSetIndex < exerciseSets.length - 1) {
            const nextSet = exerciseSets[currentSetIndex + 1];
            if (!nextSet.actualWeight) {
                nextSet.actualWeight = currentSet.actualWeight;
            }
            if (!nextSet.actualReps) {
                nextSet.actualReps = currentSet.actualReps;
            }
        }

        setWorkout(updated);

        // 2. Update live weight chart for current exercise
        const todayWeights = updated.exercises[currentExerciseIndex].sets
            .filter(s => s.completed && s.actualWeight)
            .map(s => parseFloat(s.actualWeight) || 0);
        setActiveExerciseWeights(todayWeights);

        // 3. Update KPIs live + PR detection
        const weightValue = parseFloat(currentSet.actualWeight) || 0;
        const reps = parseFloat(currentSet.actualReps) || 0;
        if (weightValue > bestWeight && bestWeight > 0) {
            // New Personal Record!
            setPrWeight(weightValue);
            triggerPRCelebration();
        }
        if (weightValue > bestWeight) setBestWeight(weightValue);
        setTotalSetsHistory(prev => prev + 1);
        setTotalRepsHistory(prev => prev + reps);

        // 4. Update global volume chart
        const setVolume = weightValue * reps;
        const prevCumulative = volumeHistory.length > 0 ? volumeHistory[volumeHistory.length - 1] : 0;
        setVolumeHistory(prev => [...prev, prevCumulative + setVolume]);

        // 4. Check completion

        const isLastSetOfExercise = currentSetIndex === workout.exercises[currentExerciseIndex].sets.length - 1;
        const isLastExercise = currentExerciseIndex === workout.exercises.length - 1;

        if (isLastSetOfExercise && isLastExercise) {
            Alert.alert("Workout Complete! 🎉", "Great job! Hit Finish to save.", [
                { text: "Finish", onPress: saveWorkout }
            ]);
            return;
        }

        startRestTimer();
    };

    const startRestTimer = () => {
        setIsResting(true);
        setRestTimer(restSeconds);

        if (timerInterval) clearInterval(timerInterval);

        const interval = setInterval(() => {
            setRestTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    advanceToNextSet();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        setTimerInterval(interval);
    };

    const advanceToNextSet = () => {
        setIsResting(false);
        const currentEx = workout.exercises[currentExerciseIndex];

        if (currentSetIndex < currentEx.sets.length - 1) {
            setCurrentSetIndex(currentSetIndex + 1);
        } else if (currentExerciseIndex < workout.exercises.length - 1) {
            setCurrentExerciseIndex(currentExerciseIndex + 1);
            setCurrentSetIndex(0);
        }
    };

    const skipRest = () => {
        if (timerInterval) clearInterval(timerInterval);
        setRestTimer(0);
        advanceToNextSet();
    };

    // C5 + U5: Cancel timer and sync to first uncompleted set
    const findFirstUncompletedSet = useCallback(() => {
        for (let ei = 0; ei < workout.exercises.length; ei++) {
            for (let si = 0; si < workout.exercises[ei].sets.length; si++) {
                if (!workout.exercises[ei].sets[si].completed) {
                    return { exerciseIndex: ei, setIndex: si };
                }
            }
        }
        return { exerciseIndex: 0, setIndex: 0 };
    }, [workout]);

    const switchToListView = useCallback(() => {
        if (timerInterval) clearInterval(timerInterval);
        setIsResting(false);
        setRestTimer(0);
        setViewMode('list');
    }, [timerInterval]);

    const switchToFocusView = useCallback(() => {
        const { exerciseIndex, setIndex } = findFirstUncompletedSet();
        setCurrentExerciseIndex(exerciseIndex);
        setCurrentSetIndex(setIndex);
        setViewMode('focus');
    }, [findFirstUncompletedSet]);

    // Jump to a specific exercise (for Focus Mode exercise picker)
    const jumpToExercise = useCallback((exerciseIndex: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentExerciseIndex(exerciseIndex);
        const exercise = workout.exercises[exerciseIndex];
        const firstUncompletedIdx = exercise.sets.findIndex(s => !s.completed);
        setCurrentSetIndex(firstUncompletedIdx >= 0 ? firstUncompletedIdx : 0);
        setIsResting(false);
        if (timerInterval) clearInterval(timerInterval);
        setRestTimer(0);
    }, [workout.exercises, timerInterval]);

    // U2: Navigate to previous set/exercise
    const goToPreviousSet = useCallback(() => {
        if (currentSetIndex > 0) {
            setCurrentSetIndex(currentSetIndex - 1);
        } else if (currentExerciseIndex > 0) {
            const prevEx = workout.exercises[currentExerciseIndex - 1];
            setCurrentExerciseIndex(currentExerciseIndex - 1);
            setCurrentSetIndex(prevEx.sets.length - 1);
        }
    }, [currentSetIndex, currentExerciseIndex, workout.exercises]);

    // U3: Smart weight step based on unit
    const weightStep = preferredUnit === 'kg' ? 2.5 : 5;

    const adjustWeight = (delta: number) => {
        const updated = structuredClone(workout);
        const currentSet = updated.exercises[currentExerciseIndex].sets[currentSetIndex];

        let currentVal = parseFloat(currentSet.actualWeight);
        if (isNaN(currentVal)) {
            currentVal = parseFloat((currentSet.targetWeight || '0').toString().replace(/[^0-9.]/g, ''));
            if (isNaN(currentVal)) currentVal = 0;
        }

        // Use smart step (delta is multiplied by weightStep)
        const newVal = Math.max(0, currentVal + delta);
        currentSet.actualWeight = newVal.toString();
        setWorkout(updated);
    };

    const adjustReps = (delta: number) => {
        const updated = structuredClone(workout);
        const currentSet = updated.exercises[currentExerciseIndex].sets[currentSetIndex];

        let currentVal = parseFloat(currentSet.actualReps);
        if (isNaN(currentVal)) {
            currentVal = parseFloat(currentSet.targetReps); // Assuming standard "10" or "10-12" (parsefloat takes first number)
            if (isNaN(currentVal)) currentVal = 0;
        }

        const newVal = Math.max(0, currentVal + delta);
        currentSet.actualReps = newVal.toString();
        setWorkout(updated);
    };


    // ─── Loading state when fetching workout log from Firestore ───
    if (loadingLog || (isReviewMode && workout.exercises.length === 0 && workoutData?.id)) {
        return (
            <View style={[tw`flex-1 bg-[${COLORS.background}] items-center justify-center`]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={tw`text-slate-400 mt-4 text-sm`}>Loading workout...</Text>
            </View>
        );
    }

    // ─── Victory Modal (rendered before any view mode to guarantee display) ───
    if (showVictory) {
        return (
            <VictoryModal
                visible={showVictory}
                workoutData={workout}
                onClose={() => {
                    setShowVictory(false);
                    navigation.goBack();
                }}
            />
        );
    }

    if (interceptVisible) {
        return (
            <SmartIntercept
                visible={interceptVisible}
                onClose={() => setInterceptVisible(false)}
                onQuit={() => {
                    setInterceptVisible(false);
                    saveWorkout();
                }}
                completedPercent={completedPercent}
                remainingExercises={remainingExercises}
            />
        );
    }

    // ─── Render Focus View ───
    if (viewMode === 'focus' && !isReviewMode) {
        // Handle Empty Workout (No Exercises)
        if (workout.exercises.length === 0) {
            return (
                <View style={tw`flex-1 bg-[${COLORS.background}] items-center justify-center p-6`}>
                    <View style={tw`bg-white/5 p-8 rounded-full mb-6`}>
                        <Dumbbell size={48} color={COLORS.primary} />
                    </View>
                    <Text style={tw`text-white font-bold text-2xl mb-2 text-center`}>Ready to Lift?</Text>
                    <Text style={tw`text-slate-400 text-center mb-8`}>
                        This workout has no exercises yet. Add your first exercise to get started!
                    </Text>

                    <TouchableOpacity
                        onPress={() => setModalVisible(true)}
                        style={tw`bg-[${COLORS.primary}] px-8 py-4 rounded-xl items-center flex-row gap-2`}
                    >
                        <Plus size={20} color="black" />
                        <Text style={tw`text-black font-bold text-lg`}>Add Exercise</Text>
                    </TouchableOpacity>

                    {/* Navigation Header */}
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={tw`absolute top-12 left-6 p-2 bg-white/5 rounded-full`}
                    >
                        <ArrowLeft size={20} color="white" />
                    </TouchableOpacity>

                    {/* Exercise Picker Modal (Reused) */}
                    <SmartExercisePicker
                        visible={isModalVisible}
                        onClose={() => setModalVisible(false)}
                        onSelect={(exName) => {
                            handleAddExercise(exName);
                            setModalVisible(false);
                        }}
                        recentHistory={[]}
                    />
                </View>
            );
        }

        const activeExercise = workout.exercises[currentExerciseIndex];
        const activeSet = activeExercise.sets[currentSetIndex];
        const nextSetLabel = currentSetIndex < activeExercise.sets.length - 1
            ? `Next: Set ${currentSetIndex + 2}`
            : currentExerciseIndex < workout.exercises.length - 1
                ? `Next: ${workout.exercises[currentExerciseIndex + 1].name}`
                : "Finish Workout";

        if (isResting) {
            return (
                <View style={tw`flex-1 bg-[${COLORS.background}] items-center justify-center`}>
                    <View style={tw`items-center mb-10`}>
                        <Clock size={48} color={COLORS.primary} />
                        <Text style={tw`text-white text-5xl font-bold mt-4`}>{restTimer}s</Text>
                        <Text style={tw`text-slate-400 text-lg uppercase tracking-widest mt-2`}>Resting</Text>
                    </View>

                    {/* U4: Rest Timer Presets */}
                    <View style={tw`flex-row gap-2 mb-8`}>
                        {[30, 60, 90, 120, 180].map((sec) => (
                            <TouchableOpacity
                                key={sec}
                                onPress={() => {
                                    setRestSeconds(sec);
                                    setRestTimer(sec);
                                }}
                                style={tw`px-3 py-2 rounded-xl ${restSeconds === sec ? `bg-[${COLORS.primary}]` : 'bg-white/10'}`}
                            >
                                <Text style={tw`${restSeconds === sec ? 'text-black' : 'text-slate-400'} font-bold text-xs`}>
                                    {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* U6: Fixed Up Next — handles last set of exercise and last exercise */}
                    <View style={tw`bg-white/5 p-6 rounded-2xl w-[80%] items-center`}>
                        <Text style={tw`text-slate-400 text-sm mb-2`}>Up Next</Text>
                        {currentSetIndex < activeExercise.sets.length - 1 ? (
                            <>
                                <Text style={tw`text-white font-bold text-xl text-center`}>{activeExercise.name}</Text>
                                <Text style={tw`text-[${COLORS.primary}] font-bold text-lg mt-1`}>
                                    Set {currentSetIndex + 2} • {activeExercise.sets[currentSetIndex + 1]?.targetWeight || '0'} × {activeExercise.sets[currentSetIndex + 1]?.targetReps || '0'}
                                </Text>
                            </>
                        ) : currentExerciseIndex < workout.exercises.length - 1 ? (
                            <>
                                <Text style={tw`text-white font-bold text-xl text-center`}>{workout.exercises[currentExerciseIndex + 1].name}</Text>
                                <Text style={tw`text-[${COLORS.primary}] font-bold text-lg mt-1`}>New Exercise</Text>
                            </>
                        ) : (
                            <Text style={tw`text-[${COLORS.primary}] font-bold text-xl`}>🎉 Finish Workout</Text>
                        )}
                    </View>

                    <TouchableOpacity
                        onPress={skipRest}
                        style={tw`mt-10 bg-[${COLORS.primary}] px-8 py-4 rounded-full`}
                    >
                        <Text style={tw`text-black font-bold text-lg`}>Skip Rest</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={tw`flex-1 bg-[${COLORS.background}]`}>
                <View style={tw`pt-12 px-6 pb-4 flex-row items-center justify-between`}>
                    <TouchableOpacity onPress={switchToListView} style={tw`p-2 bg-white/5 rounded-full`}>
                        <ArrowLeft size={20} color="white" />
                    </TouchableOpacity>
                    <View style={tw`items-center`}>
                        <Text style={tw`text-slate-400 text-xs uppercase tracking-widest`}>Exercise {currentExerciseIndex + 1}/{workout.exercises.length}</Text>
                        <Text style={tw`text-white font-bold text-lg`}>{activeExercise.name}</Text>
                        {/* U1: Elapsed time display */}
                        <Text style={tw`text-[${COLORS.primary}] text-xs font-bold mt-0.5`}>⏱ {formatElapsedTime(elapsedSeconds)}</Text>
                    </View>
                    {/* U2: Back navigation */}
                    <TouchableOpacity
                        onPress={goToPreviousSet}
                        disabled={currentExerciseIndex === 0 && currentSetIndex === 0}
                        style={tw`p-2 bg-white/5 rounded-full ${currentExerciseIndex === 0 && currentSetIndex === 0 ? 'opacity-30' : ''}`}
                    >
                        <ArrowLeft size={20} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Exercise Picker — tap any exercise to jump to it */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={tw`max-h-12`}
                    contentContainerStyle={tw`px-4 py-2 gap-2`}
                >
                    {workout.exercises.map((ex, idx) => {
                        const done = ex.sets.every(s => s.completed);
                        const isActive = idx === currentExerciseIndex;
                        return (
                            <TouchableOpacity
                                key={ex.id || `pick-${idx}`}
                                onPress={() => jumpToExercise(idx)}
                                style={tw`px-4 py-1.5 rounded-full border ${isActive ? `bg-[${COLORS.primary}] border-[${COLORS.primary}]` : done ? 'bg-white/5 border-white/10' : 'bg-white/5 border-white/10'}`}
                            >
                                <Text style={tw`text-xs font-bold ${isActive ? 'text-black' : done ? 'text-slate-500 line-through' : 'text-white'}`}>
                                    {ex.name}{done && !isActive ? ' ✓' : ''}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <ScrollView
                    style={tw`flex-1`}
                    contentContainerStyle={tw`pb-20`}
                    showsVerticalScrollIndicator={false}
                >
                    <MissionBar
                        exercises={workout.exercises}
                        currentExerciseIndex={currentExerciseIndex}
                        currentSetIndex={currentSetIndex}
                    />

                    {/* ─── Exercise Analytics ─── */}
                    <View style={tw`px-6 mt-4`}>
                        <WorkoutLogAnalytics
                            exerciseName={workout.exercises[currentExerciseIndex]?.name}
                            bestWeight={bestWeight}
                            totalSets={totalSetsHistory}
                            totalReps={totalRepsHistory}
                            weightUnit={preferredUnit}
                        />

                        {/* ─── Last Session Insight ─── */}
                        <LastSessionInsight
                            historySetSnapshot={historySetSnapshot}
                            lastSessionDate={lastSessionDate}
                            weightUnit={preferredUnit}
                            exerciseName={workout.exercises[currentExerciseIndex]?.name}
                            isLoading={isHistoryLoading}
                        />

                        {/* ─── Exercise Progression Chart ─── */}
                        <ExerciseProgressionChart
                            data={exerciseProgressionData}
                            weightUnit={preferredUnit}
                            exerciseName={workout.exercises[currentExerciseIndex]?.name}
                            isLoading={isHistoryLoading}
                            liveSets={workout.exercises[currentExerciseIndex]?.sets}
                        />

                    </View>


                    {/* ─── AI Tip Bubble ─── */}
                    {aiTip && (
                        <View style={tw`mx-6 mt-6 mb-2 bg-purple-500/10 border border-purple-500/20 p-5 rounded-3xl flex-row gap-4 items-center`}>
                            <View style={tw`bg-purple-500/20 p-3 rounded-2xl`}>
                                <Sparkles size={20} color="#d8b4fe" />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-purple-300 text-[10px] font-black uppercase tracking-[2px] mb-1`}>Coach AI 🤖</Text>
                                <Text style={tw`text-white/95 text-[14px] leading-5 font-medium`}>{aiTip}</Text>
                            </View>
                        </View>
                    )}


                    <View style={tw`px-6 mt-6`}>
                        <View style={tw`bg-[#1a1a24] border border-white/10 rounded-[48px] p-8 items-center shadow-2xl relative overflow-hidden`}>


                            {/* --- Sets List --- */}
                            <View style={tw`absolute top-0 left-0 right-0 h-1.5 bg-white/5`}>
                                <View style={tw`h-full bg-[${COLORS.primary}] w-[${((currentSetIndex + 1) / activeExercise.sets.length) * 100}%] shadow-lg shadow-[${COLORS.primary}]`} />
                            </View>


                            <View style={tw`flex-row items-center gap-2 mt-4 mb-3`}>
                                <View style={tw`w-1.5 h-1.5 rounded-full bg-[${COLORS.primary}]`} />
                                <Text style={tw`text-slate-500 text-[11px] font-black uppercase tracking-[2px]`}>Set {currentSetIndex + 1} of {activeExercise.sets.length}</Text>
                            </View>

                            {/* ─── Hero Numbers: Weight × Reps ─── */}
                            <View style={tw`flex-row items-baseline gap-1 mb-8`}>
                                <View style={tw`items-center`}>
                                    <Text style={tw`text-white text-7xl font-black tracking-tighter`}>
                                        {activeSet.actualWeight || (activeSet.targetWeight || '0').toString().replace(/[^0-9.]/g, '') || '0'}
                                    </Text>
                                    <Text style={tw`text-slate-600 text-[10px] font-black uppercase tracking-widest mt--1`}>{preferredUnit === 'kg' ? 'Kilograms' : 'Pounds'}</Text>
                                </View>

                                <Text style={tw`text-white/20 text-5xl font-black mx-4 self-center`}>×</Text>

                                <View style={tw`items-center`}>
                                    <Text style={tw`text-white text-7xl font-black tracking-tighter`}>
                                        {activeSet.actualReps || (activeSet.targetReps || '0').toString().split('-').pop() || '0'}
                                    </Text>
                                    <Text style={tw`text-slate-600 text-[10px] font-black uppercase tracking-widest mt--1`}>Repetitions</Text>
                                </View>
                            </View>

                            {/* ─── Adjustment Controls (U3: smart weight steps) ─── */}
                            <View style={tw`flex-row justify-between w-full mb-8`}>
                                <View style={tw`items-center`}>
                                    <Text style={tw`text-slate-500 text-[10px] font-bold mb-2 uppercase tracking-widest`}>WEIGHT ({preferredUnit.toUpperCase()})</Text>
                                    <View style={tw`flex-row items-center gap-3 bg-black/30 p-1.5 rounded-2xl`}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                adjustWeight(-weightStep);
                                            }}
                                            style={tw`w-14 h-14 bg-white/10 rounded-xl items-center justify-center`}
                                        >
                                            <Minus size={22} color="white" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                adjustWeight(weightStep);
                                            }}
                                            style={tw`w-14 h-14 bg-white/10 rounded-xl items-center justify-center`}
                                        >
                                            <Plus size={22} color="white" />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={tw`items-center`}>
                                    <Text style={tw`text-slate-500 text-[10px] font-bold mb-2 uppercase tracking-widest`}>REPS</Text>
                                    <View style={tw`flex-row items-center gap-3 bg-black/30 p-1.5 rounded-2xl`}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                adjustReps(-1);
                                            }}
                                            style={tw`w-14 h-14 bg-white/10 rounded-xl items-center justify-center`}
                                        >
                                            <Minus size={22} color="white" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                adjustReps(1);
                                            }}
                                            style={tw`w-14 h-14 bg-white/10 rounded-xl items-center justify-center`}
                                        >
                                            <Plus size={22} color="white" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            {/* ─── GIANT LOG SET BUTTON ─── */}
                            <TouchableOpacity
                                onPress={() => {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    handleLogSet();
                                }}
                                style={tw`w-full bg-[${COLORS.primary}] h-22 rounded-[30px] items-center justify-center active:scale-95 shadow-xl shadow-[${COLORS.primary}]/20`}
                                activeOpacity={0.9}
                            >
                                <View style={tw`flex-row items-center gap-3`}>
                                    <CheckCircle2 size={28} color="black" strokeWidth={3} />
                                    <Text style={tw`text-black text-2xl font-black uppercase tracking-tighter`}>Complete Set</Text>
                                </View>
                                <Text style={tw`text-black/40 font-black text-[9px] uppercase tracking-[3px] mt-1.5`}>Save & Rest</Text>
                            </TouchableOpacity>

                            <View style={tw`mt-6 flex-row items-center gap-2`}>
                                <Clock size={12} color="#475569" />
                                <Text style={tw`text-slate-500 font-bold text-[11px] uppercase tracking-wider`}>{nextSetLabel}</Text>
                            </View>
                        </View>
                    </View>

                    {/* ─── Bottom Actions ─── */}
                    <View style={tw`px-6 pb-12 gap-3 mt-8`}>
                        <TouchableOpacity
                            onPress={handleFinish}
                            style={tw`w-full bg-white/5 border border-white/10 h-16 rounded-2xl items-center flex-row justify-center gap-3 overflow-hidden shadow-2xl`}
                        >
                            <Save size={20} color="white" />
                            <Text style={tw`text-white font-black text-[14px] uppercase tracking-widest`}>Finish Workout</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={switchToListView} style={tw`items-center p-3`}>
                            <Text style={tw`text-slate-500 font-black text-[10px] uppercase tracking-[3px]`}>View Full List</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                {/* ─── PR Celebration Overlay ─── */}
                {showPR && (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            tw`absolute inset-0 items-center justify-center`,
                            { opacity: prOpacity },
                        ]}
                    >
                        <View style={tw`absolute inset-0 bg-black/60`} />
                        <Animated.View style={[
                            tw`items-center`,
                            { transform: [{ scale: prScale }] },
                        ]}>
                            <View style={tw`w-24 h-24 bg-yellow-500/20 rounded-full items-center justify-center mb-4 border-2 border-yellow-500/40`}>
                                <Trophy size={48} color="#fbbf24" />
                            </View>
                            <Text style={tw`text-yellow-400 text-4xl font-black tracking-tight mb-1`}>NEW PR!</Text>
                            <Text style={tw`text-white text-2xl font-bold`}>
                                {prWeight} {preferredUnit}
                            </Text>
                            <Text style={tw`text-slate-400 text-sm mt-1`}>Personal Record</Text>
                        </Animated.View>
                    </Animated.View>
                )}
            </View>

        );
    }

    // ─── Render List View (Original) ───
    const insets = useSafeAreaInsets();
    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            <View style={[tw`px-6 pb-4 border-b border-white/5 flex-row items-center justify-between bg-[${COLORS.backgroundDark}]`, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`w-10 h-10 items-center justify-center rounded-full bg-white/5`}>
                    <ArrowLeft size={24} color="white" />
                </TouchableOpacity>
                <View>
                    <Text style={tw`text-white font-bold text-lg text-center`}>{workout.title}</Text>
                    {isReviewMode && <Text style={tw`text-orange-400 text-xs font-bold text-center uppercase`}>Reviewing Session</Text>}
                    {!isReviewMode && <Text style={tw`text-[${COLORS.primary}] text-xs font-bold text-center mt-0.5`}>⏱ {formatElapsedTime(elapsedSeconds)}</Text>}
                </View>
                <View style={tw`w-10`} />
            </View>

            {/* Mode Toggle */}
            {!isReviewMode && (
                <View style={tw`flex-row justify-center py-4 bg-[${COLORS.backgroundDark}]`}>
                    <View style={tw`flex-row bg-white/10 rounded-lg p-1`}>
                        <TouchableOpacity
                            onPress={() => setViewMode('list')}
                            style={tw`px-6 py-2 rounded-md ${viewMode === 'list' ? 'bg-white/20' : ''}`}
                        >
                            <Text style={tw`text-white font-bold text-xs`}>List View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={switchToFocusView}
                            style={tw`px-6 py-2 rounded-md ${viewMode === 'focus' ? `bg-[${COLORS.primary}]` : ''}`}
                        >
                            <Text style={tw`${viewMode === 'focus' ? 'text-black' : 'text-slate-400'} font-bold text-xs`}>Focus Mode 🎧</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={tw`flex-1`}>
                <ScrollView style={tw`flex-1 px-4 py-6`} contentContainerStyle={{ paddingBottom: 150 }}>

                    {/* Review Mode: Session Stats */}
                    {isReviewMode && (
                        <View style={tw`mb-6`}>
                            {isFirstSession ? (
                                <View style={tw`bg-[${COLORS.primary}]/10 p-4 rounded-xl border border-[${COLORS.primary}]/20 mb-4`}>
                                    <View style={tw`flex-row items-center gap-2 mb-2`}>
                                        <Sparkles size={18} color={COLORS.primary} />
                                        <Text style={tw`text-[${COLORS.primary}] font-bold`}>First Session!</Text>
                                    </View>
                                    <Text style={tw`text-slate-300 text-sm`}>
                                        This is the client's first time doing this specific workout. We're recording baseline metrics today.
                                    </Text>
                                </View>
                            ) : (
                                <View style={tw`flex-row gap-2 mb-6 ml-1`}>
                                    <DeltaBadge label="Volume" current={currentVolume} previous={prevVolume} unit={preferredUnit} />
                                    <DeltaBadge label="Total Reps" current={currentReps} previous={prevReps} unit="" />
                                </View>
                            )}
                        </View>
                    )}

                    {workout.exercises.map((exercise, exerciseIndex) => {
                        const delta = isReviewMode && lastSessionData ? getExercisePrevData(exercise.name, lastSessionData) : null;

                        const completedSets = exercise.sets.filter(s => s.completed).length;
                        const totalSets = exercise.sets.length;
                        const isExpanded = isReviewMode || expandedExerciseIndex === exerciseIndex;

                        return (
                            <View key={exercise.id || `ex-${exerciseIndex}`} style={tw`mb-4 bg-[#111118] rounded-3xl border border-white/5 shadow-sm overflow-hidden`}>
                                {/* Accordion Header — tappable in log mode */}
                                <TouchableOpacity
                                    onPress={() => !isReviewMode && toggleExerciseAccordion(exerciseIndex)}
                                    activeOpacity={isReviewMode ? 1 : 0.7}
                                    style={tw`flex-row items-center justify-between p-6 ${isExpanded ? 'pb-4' : ''}`}
                                >
                                    <View style={tw`flex-1`}>
                                        <Text style={tw`text-white font-black text-xl tracking-tight leading-6 mr-4`}>{exercise.name}</Text>
                                        <View style={tw`flex-row items-center mt-1.5 gap-2`}>
                                            <Text style={tw`text-slate-500 text-[10px] font-black uppercase tracking-widest`}>
                                                {completedSets}/{totalSets} SETS
                                            </Text>
                                            {completedSets > 0 && completedSets < totalSets && (
                                                <View style={tw`flex-1 h-1 bg-white/5 rounded-full max-w-20`}>
                                                    <View style={[tw`h-1 bg-[${COLORS.primary}] rounded-full`, { width: `${(completedSets / totalSets) * 100}%` }]} />
                                                </View>
                                            )}
                                            {completedSets === totalSets && totalSets > 0 && (
                                                <Text style={tw`text-[${COLORS.primary}] text-[10px] font-black`}>✓ DONE</Text>
                                            )}
                                        </View>
                                    </View>
                                    {isReviewMode && delta && (
                                        <View style={tw`flex-row gap-2 mr-2`}>
                                            <View style={tw`bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 items-center`}>
                                                <Text style={tw`text-[9px] text-slate-500 font-black uppercase tracking-wider`}>Personal Best</Text>
                                                <Text style={tw`text-sm text-white font-black`}>
                                                    {Math.max(...delta.sets.map(s => s.weight))} <Text style={tw`text-slate-500 text-[10px]`}>{preferredUnit.toUpperCase()}</Text>
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                    {!isReviewMode && (
                                        <View style={tw`p-1.5 rounded-lg bg-white/5`}>
                                            <ChevronDown
                                                size={18}
                                                color="#94a3b8"
                                                style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                                            />
                                        </View>
                                    )}
                                </TouchableOpacity>

                                {/* Expandable Set Details */}
                                {isExpanded && (
                                    <View style={tw`px-6 pb-6`}>
                                        {/* Table Header */}
                                        <View style={tw`flex-row mb-3 px-2`}>
                                            <Text style={tw`text-slate-500 text-xs w-8 text-center font-bold`}>SET</Text>
                                            <Text style={tw`text-slate-500 text-xs flex-1 text-center font-bold`}>{preferredUnit.toUpperCase()}</Text>
                                            <Text style={tw`text-slate-500 text-xs flex-1 text-center font-bold`}>REPS</Text>
                                            <View style={tw`w-10 items-center`}><CheckCircle2 size={14} color="#64748b" /></View>
                                        </View>

                                        {exercise.sets.map((set, setIndex) => (
                                            <View key={set.id || `set-${setIndex}`} style={tw`flex-row items-center mb-3 bg-black/20 p-2 rounded-xl border ${set.completed ? `border-[${COLORS.primary}]/30 bg-[${COLORS.primary}]/5` : 'border-transparent'}`}>
                                                <View style={tw`w-8 items-center`}>
                                                    <View style={tw`w-6 h-6 rounded-full bg-white/5 items-center justify-center`}>
                                                        <Text style={tw`text-slate-400 text-xs font-bold`}>{setIndex + 1}</Text>
                                                    </View>
                                                </View>

                                                <View style={tw`flex-1 items-center px-1`}>
                                                    <TextInput
                                                        style={tw`text-white font-bold text-base w-full text-center py-1 border-b border-transparent ${!set.completed && !isReviewMode ? 'border-white/10' : ''}`}
                                                        value={set.completed ? set.actualWeight : set.targetWeight}
                                                        editable={!set.completed && !isReviewMode}
                                                        keyboardType="numeric"
                                                        onChangeText={(text) => updateSet(exerciseIndex, setIndex, 'actualWeight', text)}
                                                    />
                                                </View>

                                                <View style={tw`flex-1 items-center px-1`}>
                                                    <TextInput
                                                        style={tw`text-white font-bold text-base w-full text-center py-1 border-b border-transparent ${!set.completed && !isReviewMode ? 'border-white/10' : ''}`}
                                                        value={set.completed ? set.actualReps : set.targetReps}
                                                        editable={!set.completed && !isReviewMode}
                                                        keyboardType="numeric"
                                                        onChangeText={(text) => updateSet(exerciseIndex, setIndex, 'actualReps', text)}
                                                    />
                                                </View>

                                                <TouchableOpacity
                                                    onPress={() => toggleSet(exerciseIndex, setIndex)}
                                                    style={tw`w-10 items-center justify-center`}
                                                    disabled={isReviewMode}
                                                >
                                                    {set.completed ? (
                                                        <CheckCircle2 size={24} color={COLORS.primary} fill="rgba(0,0,0,0.2)" />
                                                    ) : (
                                                        <Circle size={24} color="#334155" />
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        ))}

                                        {!isReviewMode && (
                                            <TouchableOpacity
                                                onPress={() => addSet(exerciseIndex)}
                                                style={tw`flex-row items-center justify-center gap-1 mt-2 py-2 rounded-xl bg-white/5 border border-white/5`}
                                            >
                                                <Plus size={14} color={COLORS.muted} />
                                                <Text style={tw`text-slate-400 text-xs font-bold`}>Add Set</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })}


                    {/* Add Exercise Button */}
                    {!isReviewMode && (
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            style={tw`mt-4 py-4 items-center border border-white/10 rounded-xl border-dashed mb-6 bg-white/5`}
                        >
                            <Text style={tw`text-slate-400 font-bold text-sm`}>+ Add Another Exercise</Text>
                        </TouchableOpacity>
                    )}

                    {/* Finish Workout Button (Inside ScrollView for guarantee) */}
                    <View style={tw`mt-2 mb-20`}>
                        <TouchableOpacity
                            onPress={handleFinish}
                            style={tw`bg-[${COLORS.primary}] h-14 rounded-xl items-center flex-row justify-center gap-2 shadow-lg shadow-[${COLORS.primary}]/20`}
                        >
                            <Save size={20} color="black" />
                            <Text style={tw`text-black font-bold text-lg uppercase tracking-wide`}>
                                {isReviewMode ? 'Complete Review' : 'Finish Workout'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Exercise Picker Modal */}
            <SmartExercisePicker
                visible={isModalVisible}
                onClose={() => setModalVisible(false)}
                onSelect={(exName) => {
                    handleAddExercise(exName);
                    setModalVisible(false);
                }}
                recentHistory={workout.exercises.map(e => e.name).slice(-3)}
            />

            <VictoryModal
                visible={showVictory}
                workoutData={workout}
                weightUnit={preferredUnit}
                onClose={() => {
                    setShowVictory(false);
                    navigation.goBack(); // Return to dashboard
                }}
            />

        </View >
    );
}
