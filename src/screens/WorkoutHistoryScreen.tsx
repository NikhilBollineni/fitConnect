import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import {
    TrendingUp, Dumbbell, Flame, Zap, BarChart3, Trophy,
    ChevronDown, ChevronUp, Calendar, MessageSquare
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit, startAfter, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { getConvertedWeight, WeightUnit } from '../utils/unitConversion';

// ─── Types ───
interface SetEntry {
    weight: number;
    reps: number;
    date: string;       // For timeline context
    sessionName: string; // Which session it came from
}

interface ExerciseVariation {
    name: string;
    totalSets: number;
    lastWeight: number;
    lastReps: number;
    bestWeight: number;
    bestVolume: number;  // single-set best (weight × reps)
    lastDate: string;
    sessions: number;    // How many unique sessions included this exercise
    recentSets: SetEntry[]; // Most recent session's sets (for expanded view)
    allSets: SetEntry[];
    isPrSession?: boolean; // True if the MOST RECENT session was a PR
    notes?: string;      // Trainer feedback from latest session

    // Internal tracking
    lastLogId?: string; // ID of the most recent log encountered for grouping sets
    trackedLogId?: string; // ID of the last processed log for counting sessions
}

// ─── Utility ───
const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Sub-Components ───

/** Mini stat badge used inside cards */
const MiniStat = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <View style={tw`items-center`}>
        <Text style={[tw`text-sm font-black`, { color, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 }]}>{value}</Text>
        <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider mt-0.5`}>{label}</Text>
    </View>
);

/** Individual set row in the expanded view */
const SetRow = ({ index, weight, reps, unit }: { index: number; weight: number; reps: number; unit: string }) => (
    <View style={tw`flex-row items-center py-2.5 px-3 mb-1 bg-black/20 rounded-lg border border-white/5`}>
        <View style={[tw`w-6 h-6 rounded-md items-center justify-center mr-3`, { backgroundColor: `${COLORS.primary}15` }]}>
            <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '800' }}>{index + 1}</Text>
        </View>
        <View style={tw`flex-1 flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center gap-1 min-w-[60px]`}>
                <Text style={tw`text-white font-bold text-sm`}>{weight}</Text>
                <Text style={tw`text-slate-500 text-xs`}>{unit}</Text>
            </View>
            <Text style={tw`text-slate-600 text-xs`}>×</Text>
            <View style={tw`flex-row items-center gap-1 min-w-[50px] justify-end`}>
                <Text style={tw`text-white font-bold text-sm`}>{reps}</Text>
                <Text style={tw`text-slate-500 text-xs`}>reps</Text>
            </View>
        </View>
    </View>
);

/** Trainer Feedback Row */
const FeedbackRow = ({ notes }: { notes: string }) => (
    <View style={tw`mt-3 bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg`}>
        <View style={tw`flex-row items-center gap-2 mb-1`}>
            <MessageSquare size={12} color="#fb923c" />
            <Text style={tw`text-orange-400 text-[10px] font-bold uppercase`}>Trainer Feedback</Text>
        </View>
        <Text style={tw`text-orange-200 text-xs leading-5`}>{notes}</Text>
    </View>
);

/** Exercise Variation Card */
const VariationCard = ({ variation, unit }: { variation: ExerciseVariation; unit: string }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <View style={tw`bg-black/20 rounded-3xl border border-white/10 mb-3 overflow-hidden`}>
            {/* Main Card */}
            <TouchableOpacity
                onPress={() => setExpanded(!expanded)}
                activeOpacity={0.7}
                style={tw`p-5`}
            >
                {/* Top: Name + Last Date */}
                <View style={tw`flex-row items-start justify-between mb-4`}>
                    <View style={tw`flex-1 mr-3`}>
                        <Text style={tw`text-white font-black text-lg tracking-tight`} numberOfLines={1}>
                            {variation.name}
                        </Text>
                        <View style={tw`flex-row items-center gap-2 mt-1`}>
                            <Text style={tw`text-slate-500 text-[11px] font-bold`}>
                                {variation.sessions} SESSIONS
                            </Text>
                            <View style={tw`w-1 h-1 rounded-full bg-slate-700`} />
                            <Text style={tw`text-slate-500 text-[11px]`}>
                                Last: {variation.lastDate}
                            </Text>
                        </View>
                    </View>
                    <View style={tw`flex-row items-center gap-2`}>
                        {variation.notes && (
                            <View style={tw`bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full flex-row items-center gap-1`}>
                                <MessageSquare size={10} color="#fb923c" />
                                <Text style={tw`text-orange-400 text-[9px] font-bold tracking-wider`}>FEEDBACK</Text>
                            </View>
                        )}
                        {variation.isPrSession && (
                            <View style={tw`bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full`}>
                                <Text style={tw`text-amber-400 text-[9px] font-bold tracking-wider`}>🏆 PR</Text>
                            </View>
                        )}
                        <View style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}>
                            {expanded ? (
                                <ChevronUp size={16} color="#94a3b8" />
                            ) : (
                                <ChevronDown size={16} color="#94a3b8" />
                            )}
                        </View>
                    </View>
                </View>

                {/* Stats Row */}
                <View style={tw`flex-row items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5`}>
                    <MiniStat label="TOTAL SETS" value={variation.totalSets} color={COLORS.primary} />
                    <View style={tw`w-px h-8 bg-white/10`} />
                    <MiniStat label="LAST WEIGHT" value={`${variation.lastWeight} ${unit}`} color="#60a5fa" />
                    <View style={tw`w-px h-8 bg-white/10`} />
                    <MiniStat label="REPS/SET" value={variation.lastReps} color="#4ade80" />
                </View>
            </TouchableOpacity>

            {/* Expanded: Recent Session Breakdown */}
            {expanded && (
                <View style={tw`px-5 pb-5`}>
                    <View style={tw`border-t border-white/5 pt-4`}>
                        <View style={tw`flex-row items-center justify-between mb-3`}>
                            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-widest`}>
                                Latest Performance
                            </Text>
                            <Text style={tw`text-slate-600 text-[10px]`}>
                                {variation.recentSets.length} sets
                            </Text>
                        </View>
                        {variation.recentSets.map((set, idx) => (
                            <SetRow key={idx} index={idx} weight={set.weight} reps={set.reps} unit={unit} />
                        ))}

                        {/* Trainer Feedback */}
                        {variation.notes && <FeedbackRow notes={variation.notes} />}
                    </View>
                </View>
            )}
        </View>
    );
};

// ─── Main Screen ───
export default function WorkoutHistoryScreen({ isNested = false }: { isNested?: boolean }) {
    const navigation = useNavigation();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastVisible, setLastVisible] = useState<any>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'recent' | 'weight' | 'volume'>('recent');
    const [preferredUnit, setPreferredUnit] = useState<WeightUnit>('kg');

    const { user } = useAuth();
    const userId = user?.uid ?? '';

    // P3: Pagination Implementation
    const fetchLogs = async (loadMore = false) => {
        if (!userId) return;
        if (loadMore && (!hasMore || loadingMore)) return;
        setError(null);

        try {
            if (loadMore) setLoadingMore(true);
            else {
                setLoading(true);
                // Fetch user preference on initial load/refresh
                try {
                    const profileRef = doc(db, 'clientProfiles', userId);
                    const profileSnap = await getDoc(profileRef);
                    if (profileSnap.exists()) {
                        setPreferredUnit(profileSnap.data().preferredWeightUnit || 'kg');
                    }
                } catch (e) {
                    console.warn("Failed to fetch unit preference", e);
                }
            }

            let q = query(
                collection(db, 'workoutLogs'),
                where('clientId', '==', userId),
                orderBy('createdAt', 'desc'),
                limit(20) // Batch size
            );

            if (loadMore && lastVisible) {
                q = query(q, startAfter(lastVisible));
            }

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                setHasMore(false);
                setLoading(false);
                setLoadingMore(false);
                setRefreshing(false);
                return;
            }

            const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);

            if (loadMore) {
                setLogs(prev => [...prev, ...newLogs]);
            } else {
                setLogs(newLogs);
                setHasMore(newLogs.length === 20); // Check if we got a full batch
            }

        } catch (error) {
            console.error('Error fetching logs:', error);
            setError('Failed to load workout history.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchLogs(); // Initial load
        }, [userId])
    );

    const onRefresh = () => {
        setRefreshing(true);
        setHasMore(true);
        setLastVisible(null);
        fetchLogs(false);
    };

    // ─── Transform: Session logs → Exercise Variations ───
    const variations = useMemo(() => {
        const variationMap = new Map<string, ExerciseVariation>();

        logs.forEach((log: any) => {
            const dateStr = formatTimestamp(log.createdAt);
            const sessionName = log.name || log.title || 'Session';

            (log.exercises || []).forEach((ex: any) => {
                const name = (ex.name || '').trim();
                if (!name) return;

                const sets: SetEntry[] = (ex.sets || []).map((s: any) => {
                    // Use helper to convert weight consistently
                    const rawWeight = s.weight !== undefined ? s.weight : s.actualWeight;
                    return {
                        weight: getConvertedWeight(rawWeight, preferredUnit),
                        reps: parseInt(s.reps || s.actualReps) || 0,
                        date: dateStr,
                        sessionName,
                    };
                });

                if (!variationMap.has(name)) {
                    variationMap.set(name, {
                        name,
                        totalSets: 0,
                        lastWeight: 0,
                        lastReps: 0,
                        bestWeight: 0,
                        bestVolume: 0,
                        lastDate: dateStr,
                        sessions: 0,
                        recentSets: [],
                        allSets: [],
                        notes: undefined,
                        lastLogId: log.id,
                        trackedLogId: undefined
                    });
                }

                const v = variationMap.get(name)!;
                v.totalSets += sets.length;

                // Track unique sessions (only increment if this log is different from the last one counted)
                if (v.trackedLogId !== log.id) {
                    v.sessions += 1;
                    v.trackedLogId = log.id;
                }

                v.allSets.push(...sets);

                // Calculate personal bests (tracking valid maxes)
                const currentMaxWeight = sets.reduce((max, s) => Math.max(max, s.weight), 0);

                // If this session's max exceeds the KNOWN best so far, it's a PR.
                const isPR = currentMaxWeight > v.bestWeight && v.bestWeight > 0;

                if (isPR) {
                    v.isPrSession = true;
                }

                sets.forEach(s => {
                    if (s.weight > v.bestWeight) v.bestWeight = s.weight;
                    const setVol = s.weight * s.reps;
                    if (setVol > v.bestVolume) v.bestVolume = setVol;
                });

                // "Last" = most recent session sets logic.
                // Since logs are sorted DESC, the first time we see the exercise (via lastLogId check)
                // is the most recent session. If we see the same exercise again in the SAME log, we append sets.
                if (v.lastLogId === log.id) {
                    v.lastDate = dateStr;
                    // Append sets instead of overwriting, to handle split entries in same log
                    v.recentSets.push(...sets);

                    // Update working stats based on potentially new heavy set
                    const heaviestSet = v.recentSets.reduce((best, s) =>
                        s.weight > best.weight ? s : best, v.recentSets[0] || { weight: 0, reps: 0 }
                    );
                    v.lastWeight = heaviestSet.weight;
                    v.lastReps = heaviestSet.reps;

                    if (ex.notes && ex.notes.trim().length > 0) {
                        v.notes = ex.notes;
                    }
                }
            });
        });

        let result = Array.from(variationMap.values());

        // Sort
        if (sortBy === 'weight') {
            result.sort((a, b) => b.bestWeight - a.bestWeight);
        } else if (sortBy === 'volume') {
            result.sort((a, b) => b.totalSets - a.totalSets);
        }
        // 'recent' keeps the natural order (first-seen from desc-sorted logs)

        return result;
    }, [logs, sortBy, preferredUnit]);

    // ─── Aggregate Stats ───
    const totalExercises = variations.length;
    const totalSets = variations.reduce((sum, v) => sum + v.totalSets, 0);
    const uniqueSessions = logs.length;

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* ─── Header ─── */}
            {!isNested ? (
                <View style={tw`pt-14 px-6 pb-4`}>
                    <Text style={tw`text-white font-black text-2xl`}>Exercise History</Text>
                    <Text style={tw`text-slate-500 text-xs mt-1`}>
                        {totalExercises > 0
                            ? `${totalExercises} variations · ${totalSets} total sets`
                            : 'Your lift data will appear here'}
                    </Text>
                </View>
            ) : (
                <View style={tw`pt-4 px-6 pb-2`}>
                    <Text style={tw`text-slate-500 text-xs text-center`}>
                        {totalExercises > 0
                            ? `${totalExercises} variations · ${totalSets} total sets`
                            : 'Your lift data will appear here'}
                    </Text>
                </View>
            )}

            {error && !loading && (
                <View style={tw`mx-5 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex-row items-center justify-between`}>
                    <Text style={tw`text-red-400 text-sm flex-1`}>{error}</Text>
                    <TouchableOpacity onPress={() => { setError(null); fetchLogs(); }} style={tw`ml-3 bg-red-500/20 px-3 py-2 rounded-lg`}>
                        <Text style={tw`text-red-400 text-xs font-bold`}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                style={tw`flex-1 px-5`}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── Summary Stat Bar ─── */}
                {variations.length > 0 && (
                    <View style={tw`flex-row gap-3 mb-6`}>
                        <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl border border-white/5 items-center`}>
                            <View style={[tw`w-8 h-8 rounded-full items-center justify-center mb-1.5`, { backgroundColor: `${COLORS.primary}15` }]}>
                                <Dumbbell size={14} color={COLORS.primary} />
                            </View>
                            <Text style={tw`text-white text-lg font-black tracking-tight`}>{totalExercises}</Text>
                            <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>Variations</Text>
                        </View>
                        <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl border border-white/5 items-center`}>
                            <View style={[tw`w-8 h-8 rounded-full items-center justify-center mb-1.5`, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                                <BarChart3 size={14} color="#3b82f6" />
                            </View>
                            <Text style={tw`text-white text-lg font-black tracking-tight`}>{totalSets}</Text>
                            <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>Total Sets</Text>
                        </View>
                        <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl border border-white/5 items-center`}>
                            <View style={[tw`w-8 h-8 rounded-full items-center justify-center mb-1.5`, { backgroundColor: 'rgba(249,115,22,0.1)' }]}>
                                <Calendar size={14} color="#f97316" />
                            </View>
                            <Text style={tw`text-white text-lg font-black tracking-tight`}>{uniqueSessions}</Text>
                            <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>Sessions</Text>
                        </View>
                    </View>
                )}

                {/* ─── Sort Pills ─── */}
                {variations.length > 0 && (
                    <View style={tw`flex-row gap-2 mb-4`}>
                        {[
                            { key: 'recent' as const, label: 'Recent' },
                            { key: 'weight' as const, label: 'Heaviest' },
                            { key: 'volume' as const, label: 'Most Sets' },
                        ].map(opt => (
                            <TouchableOpacity
                                key={opt.key}
                                onPress={() => setSortBy(opt.key)}
                                style={[
                                    tw`px-4 py-2.5 rounded-full border`,
                                    sortBy === opt.key
                                        ? tw`bg-[${COLORS.primary}]/15 border-[${COLORS.primary}]/30`
                                        : tw`bg-white/5 border-white/5`,
                                ]}
                            >
                                <Text style={[
                                    tw`text-xs font-bold`,
                                    sortBy === opt.key
                                        ? { color: COLORS.primary }
                                        : tw`text-slate-400`,
                                ]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* ─── Loading ─── */}
                {loading && (
                    <View style={tw`items-center py-16`}>
                        <View style={tw`w-12 h-12 bg-[${COLORS.backgroundLight}] rounded-full items-center justify-center mb-4`}>
                            <Dumbbell size={24} color={COLORS.primary} />
                        </View>
                        <Text style={tw`text-slate-400 text-sm`}>Loading your history...</Text>
                    </View>
                )}

                {/* ─── Empty State ─── */}
                {!loading && variations.length === 0 && (
                    <View style={tw`items-center py-16 bg-[${COLORS.backgroundLight}] rounded-3xl border border-white/5`}>
                        <View style={tw`w-16 h-16 bg-[${COLORS.primary}]/10 rounded-full items-center justify-center mb-4`}>
                            <Trophy size={32} color={COLORS.primary} />
                        </View>
                        <Text style={tw`text-white font-bold text-lg mb-1`}>No Exercises Yet</Text>
                        <Text style={tw`text-slate-500 text-sm text-center px-8 mb-6`}>
                            Complete your first workout and every exercise variation will show up here with full stats.
                        </Text>
                        <TouchableOpacity
                            onPress={() => (navigation as any).navigate('Home')}
                            style={tw`bg-[${COLORS.primary}] px-6 py-3 rounded-2xl flex-row items-center gap-2`}
                        >
                            <Dumbbell size={16} color="black" />
                            <Text style={tw`text-black font-bold text-sm`}>Start a Workout</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ─── Variation Cards ─── */}
                {variations.map((v, idx) => (
                    <VariationCard key={`${v.name}-${idx}`} variation={v} unit={preferredUnit} />
                ))}

                {/* ─── Load More Button ─── */}
                {hasMore && !loading && variations.length > 0 && (
                    <TouchableOpacity
                        onPress={() => fetchLogs(true)}
                        disabled={loadingMore}
                        style={tw`bg-white/5 p-4 rounded-xl border border-white/10 items-center justify-center mt-2 mb-8`}
                    >
                        {loadingMore ? (
                            <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                            <Text style={tw`text-white font-bold text-sm`}>Load More History</Text>
                        )}
                    </TouchableOpacity>
                )}
            </ScrollView>
        </View>
    );
}
