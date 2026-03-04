import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { ChevronLeft, ChevronRight, Flame, Dumbbell, Zap } from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

export interface CalendarStats {
    totalWorkouts: number;
    totalSets: number;
    activeDays: number;
    daysInMonth: number;
}

interface WorkoutCalendarProps {
    clientId: string;
    /** @deprecated Use statsPosition instead */
    compact?: boolean;
    /** Controls where monthly stats render: 'above' the grid, 'below', or 'none' to hide. Defaults to 'below'. */
    statsPosition?: 'above' | 'below' | 'none';
    /** Callback fired when monthly stats are computed */
    onStatsLoaded?: (stats: CalendarStats) => void;
}

// ─── Intensity tiers based on total sets ───
// 0 sets       → no workout (gray)
// 1–8 sets     → light session (low intensity)
// 9–16 sets    → solid workout (medium intensity)
// 17+ sets     → beast mode (high intensity)
type IntensityLevel = 0 | 1 | 2 | 3;

const getIntensity = (totalSets: number): IntensityLevel => {
    if (totalSets === 0) return 0;
    if (totalSets <= 8) return 1;
    if (totalSets <= 16) return 2;
    return 3;
};

// Color configs for each intensity level
const INTENSITY_STYLES = {
    0: { bg: 'transparent', border: 'transparent', text: '' },
    1: { bg: `${COLORS.primary}1A`, border: `${COLORS.primary}33`, text: COLORS.primary }, // ~10% / ~20%
    2: { bg: `${COLORS.primary}4D`, border: `${COLORS.primary}66`, text: COLORS.primary }, // ~30% / ~40%
    3: { bg: `${COLORS.primary}99`, border: `${COLORS.primary}B3`, text: '#000000' },       // ~60% / ~70%
};

const INTENSITY_LABELS = ['', 'Light', 'Solid', 'Beast'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WorkoutCalendar({ clientId, compact, statsPosition, onStatsLoaded }: WorkoutCalendarProps) {
    // Backward compat: derive from compact if statsPosition not set
    const effectiveStatsPosition = statsPosition ?? (compact ? 'none' : 'below');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [workoutDays, setWorkoutDays] = useState<Map<string, number>>(new Map()); // date → total sets
    const [loading, setLoading] = useState(true);
    const [totalWorkouts, setTotalWorkouts] = useState(0);
    const [totalSetsMonth, setTotalSetsMonth] = useState(0);
    const [activeDays, setActiveDays] = useState(0);

    const processLogs = (docs: any[], year: number, month: number) => {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);
        const dayMap = new Map<string, number>(); // date → total sets
        let sessionCount = 0;
        let setsCount = 0;

        docs.forEach(d => {
            const data = d.data ? d.data() : d;
            const completedAt = data.completedAt?.toDate?.()
                || (data.completedAt?.seconds ? new Date(data.completedAt.seconds * 1000) : null);

            if (completedAt && completedAt >= startDate && completedAt <= endDate) {
                const dateKey = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}-${String(completedAt.getDate()).padStart(2, '0')}`;

                // Count total completed sets from this workout
                const exerciseSets = (data.exercises || []).reduce(
                    (total: number, ex: any) => total + (Array.isArray(ex.sets) ? ex.sets.length : 0),
                    0
                );

                dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + exerciseSets);
                sessionCount++;
                setsCount += exerciseSets;
            }
        });

        return { dayMap, sessionCount, setsCount };
    };

    const fetchWorkoutDays = useCallback(async () => {
        if (!clientId) return;
        setLoading(true);
        try {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();

            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0, 23, 59, 59);

            let dayMap: Map<string, number>;
            let sessionCount: number;
            let setsCount: number;

            try {
                // Optimized query — requires composite index: workoutLogs [clientId ASC, completedAt ASC]
                const startTimestamp = Timestamp.fromDate(startDate);
                const endTimestamp = Timestamp.fromDate(endDate);

                const q = query(
                    collection(db, 'workoutLogs'),
                    where('clientId', '==', clientId),
                    where('completedAt', '>=', startTimestamp),
                    where('completedAt', '<=', endTimestamp)
                );

                const snapshot = await getDocs(q);
                const result = processLogs(snapshot.docs, year, month);
                dayMap = result.dayMap;
                sessionCount = result.sessionCount;
                setsCount = result.setsCount;
            } catch (indexError) {
                // Fallback: fetch all logs for this client and filter client-side
                console.warn('Calendar index missing, falling back to client-side filter');
                const fallbackQ = query(
                    collection(db, 'workoutLogs'),
                    where('clientId', '==', clientId)
                );
                const snapshot = await getDocs(fallbackQ);
                const result = processLogs(snapshot.docs, year, month);
                dayMap = result.dayMap;
                sessionCount = result.sessionCount;
                setsCount = result.setsCount;
            }

            setWorkoutDays(dayMap);
            setTotalWorkouts(sessionCount);
            setTotalSetsMonth(setsCount);
            setActiveDays(dayMap.size);

            const dim = new Date(year, month + 1, 0).getDate();
            onStatsLoaded?.({ totalWorkouts: sessionCount, totalSets: setsCount, activeDays: dayMap.size, daysInMonth: dim });
        } catch (error) {
            console.error('Error fetching workout calendar:', error);
        } finally {
            setLoading(false);
        }
    }, [clientId, currentMonth]);

    useEffect(() => {
        fetchWorkoutDays();
    }, [fetchWorkoutDays]);

    const goToPrevMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        const now = new Date();
        const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        // Don't go past current month
        if (next <= new Date(now.getFullYear(), now.getMonth() + 1, 0)) {
            setCurrentMonth(next);
        }
    };

    const isCurrentMonth = () => {
        const now = new Date();
        return currentMonth.getFullYear() === now.getFullYear() && currentMonth.getMonth() === now.getMonth();
    };

    // Build calendar grid
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Create grid cells
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Fill remainder to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    const statsRow = (position: 'above' | 'below') => (
        <View style={tw`flex-row ${position === 'below' ? 'border-t' : 'border-b'} border-white/10 mx-3`}>
            <View style={tw`flex-1 items-center py-4`}>
                <View style={tw`flex-row items-center gap-1.5 mb-1`}>
                    <Dumbbell size={14} color={COLORS.primary} />
                    <Text style={tw`text-white text-lg font-bold`}>{totalWorkouts}</Text>
                </View>
                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider`}>Sessions</Text>
            </View>
            <View style={tw`w-[1px] bg-white/5`} />
            <View style={tw`flex-1 items-center py-4`}>
                <View style={tw`flex-row items-center gap-1.5 mb-1`}>
                    <Zap size={14} color="#f97316" />
                    <Text style={tw`text-white text-lg font-bold`}>{totalSetsMonth}</Text>
                </View>
                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider`}>Total Sets</Text>
            </View>
            <View style={tw`w-[1px] bg-white/5`} />
            <View style={tw`flex-1 items-center py-4`}>
                <View style={tw`flex-row items-center gap-1.5 mb-1`}>
                    <Flame size={14} color="#ef4444" />
                    <Text style={tw`text-white text-lg font-bold`}>{activeDays}</Text>
                </View>
                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider`}>Active Days</Text>
            </View>
            <View style={tw`w-[1px] bg-white/5`} />
            <View style={tw`flex-1 items-center py-4`}>
                <View style={tw`flex-row items-center gap-1.5 mb-1`}>
                    <Text style={tw`text-white text-lg font-bold`}>
                        {daysInMonth > 0 ? Math.round((activeDays / daysInMonth) * 100) : 0}%
                    </Text>
                </View>
                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider`}>Consistency</Text>
            </View>
        </View>
    );

    return (
        <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl border border-white/5 overflow-hidden`}>
            {/* Month Header */}
            <View style={tw`flex-row items-center justify-between px-5 pt-5 pb-3`}>
                <TouchableOpacity
                    onPress={goToPrevMonth}
                    style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}
                    accessibilityLabel="Previous month"
                >
                    <ChevronLeft size={16} color="#94a3b8" />
                </TouchableOpacity>

                <Text style={tw`text-white font-bold text-base`}>{monthName}</Text>

                <TouchableOpacity
                    onPress={goToNextMonth}
                    disabled={isCurrentMonth()}
                    style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center ${isCurrentMonth() ? 'opacity-30' : ''}`}
                    accessibilityLabel="Next month"
                >
                    <ChevronRight size={16} color="#94a3b8" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={tw`py-12 items-center`}>
                    <ActivityIndicator color={COLORS.primary} size="small" />
                </View>
            ) : (
                <>
                    {effectiveStatsPosition === 'above' && statsRow('above')}

                    {/* Weekday Headers */}
                    <View style={tw`flex-row px-3 ${effectiveStatsPosition === 'above' ? 'mt-2' : ''} mb-1`}>
                        {WEEKDAYS.map(day => (
                            <View key={day} style={tw`flex-1 items-center py-1`}>
                                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase`}>{day}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Calendar Grid */}
                    <View style={tw`px-3 pb-2`}>
                        {Array.from({ length: cells.length / 7 }, (_, weekIdx) => (
                            <View key={weekIdx} style={tw`flex-row`}>
                                {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, dayIdx) => {
                                    if (day === null) {
                                        return <View key={`empty-${dayIdx}`} style={tw`flex-1 aspect-square`} />;
                                    }

                                    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const totalSets = workoutDays.get(dateKey) || 0;
                                    const intensity = getIntensity(totalSets);
                                    const style = INTENSITY_STYLES[intensity];
                                    const isToday = dateKey === todayStr;
                                    const isFuture = new Date(year, month, day) > today;

                                    return (
                                        <View
                                            key={`day-${day}`}
                                            style={tw`flex-1 aspect-square items-center justify-center p-0.5`}
                                        >
                                            <View
                                                style={[
                                                    tw`w-full h-full rounded-xl items-center justify-center`,
                                                    intensity > 0 && {
                                                        backgroundColor: style.bg,
                                                        borderWidth: 1,
                                                        borderColor: style.border,
                                                    },
                                                    isToday && intensity === 0 && tw`border border-white/20`,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        tw`text-xs font-bold`,
                                                        intensity > 0
                                                            ? { color: style.text }
                                                            : isFuture
                                                                ? tw`text-slate-700`
                                                                : isToday
                                                                    ? tw`text-white`
                                                                    : tw`text-slate-400`,
                                                    ]}
                                                >
                                                    {day}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        ))}
                    </View>

                    {/* Intensity Legend */}
                    <View style={tw`flex-row items-center justify-center gap-3 pb-3 px-3`}>
                        <Text style={tw`text-slate-600 text-[9px] font-bold`}>Less</Text>
                        {([0, 1, 2, 3] as IntensityLevel[]).map(level => (
                            <View
                                key={level}
                                style={[
                                    tw`w-4 h-4 rounded`,
                                    level === 0
                                        ? tw`bg-white/5 border border-white/10`
                                        : {
                                              backgroundColor: INTENSITY_STYLES[level].bg,
                                              borderWidth: 1,
                                              borderColor: INTENSITY_STYLES[level].border,
                                          },
                                ]}
                            />
                        ))}
                        <Text style={tw`text-slate-600 text-[9px] font-bold`}>More</Text>
                    </View>

                    {/* Summary Stats */}
                    {effectiveStatsPosition === 'below' && statsRow('below')}
                </>
            )}
        </View>
    );
}
