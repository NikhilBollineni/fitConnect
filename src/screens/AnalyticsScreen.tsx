import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, Dimensions, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import {
    ArrowLeft, TrendingUp, Trophy, Flame, Target,
    Dumbbell, BarChart3, Calendar, ChevronDown, ChevronUp, Layers, Scale
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'; // Added doc, getDoc
import { useAuth } from '../context/AuthContext';
import { calculateStats, getExercisesByMuscle, getExerciseHistory } from '../utils/analyticsHelpers';
import { Svg, Circle, Line, Text as SvgText, Path } from 'react-native-svg';
import { WeightUnit } from '../utils/unitConversion'; // Import WeightUnit

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AnalyticsScreen({ isNested = false }: { isNested?: boolean }) {
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [stats, setStats] = useState<any>(null);
    const [exercisesByMuscle, setExercisesByMuscle] = useState<Record<string, string[]>>({});
    const [logs, setLogs] = useState<any[]>([]);

    // Unit Preference
    const [preferredUnit, setPreferredUnit] = useState<WeightUnit>('kg');

    // UI State
    const [selectedMuscle, setSelectedMuscle] = useState<string>('Chest'); // Default
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [chartData, setChartData] = useState<{ date: string; weight: number }[]>([]);

    const { user } = useAuth();
    const userId = user?.uid ?? '';

    // ---- Fetch ----
    const fetchLogs = async () => {
        if (!userId) return;
        try {
            // 1. Fetch User Preference
            let unit: WeightUnit = 'kg';
            try {
                const profileRef = doc(db, 'clientProfiles', userId);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    unit = profileSnap.data().preferredWeightUnit || 'kg';
                }
            } catch (err) {
                console.warn('Failed to fetch weight preference', err);
            }
            setPreferredUnit(unit);

            // 2. Fetch Logs
            // Server-side filtered query
            const q = query(collection(db, 'workoutLogs'), where('clientId', '==', userId));
            const snapshot = await getDocs(q);
            const data = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort for calculations
            data.sort((a, b) => ((b as any).createdAt?.seconds || 0) - ((a as any).createdAt?.seconds || 0));

            const calculatedStats = calculateStats(data as any[], unit);
            const groupedExercises = getExercisesByMuscle(data as any[]);

            setLogs(data);
            setStats(calculatedStats);
            setExercisesByMuscle(groupedExercises);

            // Set default muscle if Chest not available
            if (!groupedExercises['Chest'] && Object.keys(groupedExercises).length > 0) {
                setSelectedMuscle(Object.keys(groupedExercises)[0]);
            }

        } catch (e) {
            console.error('Analytics fetch error:', e);
            setError('Failed to load analytics.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchLogs(); }, []));
    const onRefresh = () => { setRefreshing(true); fetchLogs(); };

    const handleSelectExercise = (exercise: string) => {
        if (selectedExercise === exercise) {
            setSelectedExercise(null); // Deselect
            setChartData([]);
        } else {
            setSelectedExercise(exercise);
            const history = getExerciseHistory(logs, exercise, preferredUnit);
            setChartData(history);
        }
    };

    // --- Custom Chart Component ---
    const CustomLineChart = ({ data }: { data: { date: string; weight: number }[] }) => {
        if (!data || data.length < 2) return (
            <View style={tw`h-40 items-center justify-center bg-white/5 rounded-xl`}>
                <Text style={tw`text-slate-500`}>Log at least 2 sessions to see progress.</Text>
            </View>
        );

        // Limit to last 15 sessions to prevent overcrowding
        const visibleData = data.slice(-15);

        const height = 200;
        const width = SCREEN_WIDTH - 60; // Slightly wider
        const padding = 30; // More padding for labels

        const maxWeight = Math.max(...visibleData.map(d => d.weight));
        const minWeight = Math.min(...visibleData.map(d => d.weight));
        // Add buffer to range so line doesn't hit edge exactly
        const range = (maxWeight - minWeight) || 1;
        const buffer = range * 0.1;
        const yMax = maxWeight + buffer;
        const yMin = Math.max(0, minWeight - buffer);
        const yRange = yMax - yMin;

        const stepX = (width - 2 * padding) / (visibleData.length - 1);

        const points = visibleData.map((d, i) => {
            const x = padding + i * stepX;
            const y = height - padding - ((d.weight - yMin) / yRange) * (height - 2 * padding);
            return { x, y, val: d.weight, date: d.date };
        });

        const pathData = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;

        return (
            <View style={tw`mt-4 items-center`}>
                <Svg height={height} width={width}>
                    {/* Background Lines */}
                    {[0, 0.5, 1].map(r => {
                        const y = height - padding - r * (height - 2 * padding);
                        return <Line key={r} x1={padding} y1={y} x2={width - padding} y2={y} stroke="white" strokeOpacity={0.05} strokeWidth={1} />
                    })}

                    {/* Path */}
                    <Path d={pathData} fill="none" stroke={COLORS.primary} strokeWidth="3" />

                    {/* Dots & Labels */}
                    {points.map((p, i) => {
                        // Smart Label Logic
                        const isFirst = i === 0;
                        const isLast = i === points.length - 1;
                        // Show approx 4 dates total
                        const showDate = isFirst || isLast || i % Math.ceil(points.length / 4) === 0;

                        return (
                            <React.Fragment key={i}>
                                <Circle cx={p.x} cy={p.y} r="4" fill={COLORS.primary} stroke={COLORS.background} strokeWidth={2} />

                                {/* Value Label (Always show for last, and for marked points) */}
                                {(showDate || isLast) && (
                                    <SvgText
                                        x={p.x}
                                        y={p.y - 12}
                                        fill="white"
                                        fontSize="12"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                    >
                                        {p.val}
                                    </SvgText>
                                )}

                                {/* Date Label */}
                                {showDate && (
                                    <SvgText
                                        x={p.x}
                                        y={height - 10}
                                        fill="#94a3b8"
                                        fontSize="10"
                                        textAnchor="middle"
                                    >
                                        {p.date}
                                    </SvgText>
                                )}
                            </React.Fragment>
                        );
                    })}
                </Svg>
            </View>
        );
    };


    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            {!isNested && (
                <View style={tw`pt-12 px-6 pb-4 border-b border-white/5 flex-row items-center justify-center`}>
                    <Text style={tw`text-white font-bold text-lg`}>Analytics</Text>
                </View>
            )}

            <ScrollView
                style={tw`flex-1`}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {loading ? (
                    <View style={tw`items-center py-20`}>
                        <ActivityIndicator color={COLORS.primary} size="large" />
                        <Text style={tw`text-slate-400 mt-4`}>Loading analytics...</Text>
                    </View>
                ) : error ? (
                    <View style={tw`items-center py-20 px-6`}>
                        <BarChart3 size={48} color="#ef4444" />
                        <Text style={tw`text-red-400 text-base mt-4 text-center mb-4`}>{error}</Text>
                        <TouchableOpacity onPress={() => { setError(null); fetchLogs(); }} style={tw`bg-red-500/10 px-6 py-3 rounded-xl border border-red-500/20`}>
                            <Text style={tw`text-red-400 font-bold text-sm`}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : logs.length === 0 ? (
                    <View style={tw`items-center py-20 px-6`}>
                        <BarChart3 size={48} color={COLORS.muted} />
                        <Text style={tw`text-slate-400 text-base mt-4 text-center`}>
                            No workout data yet.{'\n'}Log a workout to see your analytics!
                        </Text>
                        <TouchableOpacity
                            onPress={() => (navigation as any).navigate('Home')}
                            style={tw`bg-[${COLORS.primary}] px-6 py-3 rounded-xl mt-4`}
                        >
                            <Text style={tw`text-black font-bold text-sm`}>Log a Workout</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {/* === Horizontal KPI Row === */}
                        <View style={tw`flex-row justify-between px-5 pt-6 mb-6`}>
                            {/* Streak */}
                            <View style={tw`flex-1 items-center bg-[${COLORS.backgroundLight}] py-4 rounded-xl border border-white/5 mx-1`}>
                                <Flame size={20} color="#f97316" fill="#f97316" style={tw`mb-2`} />
                                <Text style={tw`text-white text-xl font-bold`}>{stats?.streak}</Text>
                                <Text style={tw`text-slate-500 text-[10px] uppercase font-bold tracking-wider`}>Streak</Text>
                            </View>

                            {/* Total Workouts */}
                            <View style={tw`flex-1 items-center bg-[${COLORS.backgroundLight}] py-4 rounded-xl border border-white/5 mx-1`}>
                                <Dumbbell size={20} color={COLORS.primary} style={tw`mb-2`} />
                                <Text style={tw`text-white text-xl font-bold`}>{stats?.totalWorkouts}</Text>
                                <Text style={tw`text-slate-500 text-[10px] uppercase font-bold tracking-wider`}>Workouts</Text>
                            </View>

                            {/* Avg Weight/Set */}
                            <View style={tw`flex-1 items-center bg-[${COLORS.backgroundLight}] py-4 rounded-xl border border-white/5 mx-1`}>
                                <Scale size={20} color="#38bdf8" style={tw`mb-2`} />
                                <Text style={tw`text-white text-xl font-bold`}>{stats?.avgWeightPerSet}{preferredUnit}</Text>
                                <Text style={tw`text-slate-500 text-[10px] uppercase font-bold tracking-wider`}>Avg Wgt/Set</Text>
                            </View>
                        </View>


                        {/* === Exercise Progress === */}
                        <View style={tw`mx-5`}>
                            <Text style={tw`text-white font-bold text-lg mb-4`}>Exercise Progress</Text>

                            {/* Muscle Selector */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-6`}>
                                {Object.keys(exercisesByMuscle).map((muscle) => (
                                    <TouchableOpacity
                                        key={muscle}
                                        onPress={() => { setSelectedMuscle(muscle); setSelectedExercise(null); }}
                                        style={tw`px-5 py-2.5 rounded-full mr-2 border ${selectedMuscle === muscle
                                            ? `bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                            : `bg-white/5 border-white/10`
                                            }`}
                                    >
                                        <Text style={tw`font-bold text-sm ${selectedMuscle === muscle ? 'text-black' : 'text-slate-400'}`}>
                                            {muscle}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Exercise List */}
                            <View style={tw`bg-[${COLORS.backgroundLight}] rounded-3xl overflow-hidden border border-white/5`}>
                                {exercisesByMuscle[selectedMuscle]?.map((exercise, index) => (
                                    <View key={exercise}>
                                        <TouchableOpacity
                                            onPress={() => handleSelectExercise(exercise)}
                                            style={tw`p-5 flex-row justify-between items-center ${selectedExercise === exercise ? 'bg-white/5' : ''
                                                }`}
                                        >
                                            <Text style={tw`text-white font-semibold text-base`}>{exercise}</Text>
                                            <View style={tw`bg-white/5 p-1 rounded-full`}>
                                                {selectedExercise === exercise ? <ChevronUp size={16} color="white" /> : <ChevronDown size={16} color="white" />}
                                            </View>
                                        </TouchableOpacity>

                                        {/* Chart Area */}
                                        {selectedExercise === exercise && (
                                            <View style={tw`pb-6 px-2 bg-white/5`}>
                                                <Text style={tw`text-center text-slate-400 text-xs mb-2`}>Max Weight Progression (Last 15 Sessions)</Text>
                                                <CustomLineChart data={chartData} />
                                            </View>
                                        )}

                                        {/* Divider */}
                                        {index < exercisesByMuscle[selectedMuscle].length - 1 && <View style={tw`h-[1px] bg-white/5 mx-5`} />}
                                    </View>
                                ))}

                                {(!exercisesByMuscle[selectedMuscle] || exercisesByMuscle[selectedMuscle].length === 0) && (
                                    <View style={tw`p-6 items-center`}>
                                        <Text style={tw`text-slate-500 italic`}>No exercises found for this muscle group.</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={tw`h-20`} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}
