import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { TrendingUp } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { Svg, Circle, Line, Text as SvgText, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TimeRange = '1W' | '2W' | '1M' | '2M' | '3M' | 'All';

interface LiveSet {
    id: string;
    completed: boolean;
    actualWeight: string;
    actualReps: string;
    targetWeight: string;
    targetReps: string;
}

interface ExerciseProgressionChartProps {
    data: { date: string; weight: number; originalDate: Date }[];
    weightUnit: string;
    exerciseName: string;
    isLoading?: boolean;
    liveSets?: LiveSet[];
}

const RANGE_OPTIONS: TimeRange[] = ['1W', '2W', '1M', '2M', '3M', 'All'];
const RANGE_DAYS: Record<string, number> = {
    '1W': 7, '2W': 14, '1M': 30, '2M': 60, '3M': 90,
};

export default function ExerciseProgressionChart({
    data,
    weightUnit,
    exerciseName,
    isLoading = false,
    liveSets,
}: ExerciseProgressionChartProps) {
    const [selectedRange, setSelectedRange] = useState<TimeRange>('All');

    // Only recompute when completed sets change (i.e., user taps "Complete Set")
    // Build a stable key from completed set weights so editing inputs doesn't trigger updates
    const completedSetsKey = useMemo(() => {
        if (!liveSets) return '';
        return liveSets
            .filter(s => s.completed)
            .map(s => `${s.actualWeight}`)
            .join(',');
    }, [liveSets]);

    const todayMaxWeight = useMemo(() => {
        if (!liveSets) return 0;
        let max = 0;
        liveSets.forEach(s => {
            if (s.completed && s.actualWeight) {
                const w = parseFloat(s.actualWeight) || 0;
                if (w > max) max = w;
            }
        });
        return max;
    }, [completedSetsKey]);

    // Merge historical data with live "Today" point
    const dataWithLive = useMemo(() => {
        if (todayMaxWeight <= 0) return data;
        const today = new Date();
        return [
            ...data,
            {
                date: 'Now',
                weight: todayMaxWeight,
                originalDate: today,
                isLive: true,
            },
        ];
    }, [data, todayMaxWeight]);

    const filteredData = useMemo(() => {
        if (selectedRange === 'All') return dataWithLive;
        const days = RANGE_DAYS[selectedRange];
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return dataWithLive.filter(d => d.originalDate >= cutoff);
    }, [dataWithLive, selectedRange]);

    // Limit to last 15 to avoid overcrowding
    const visibleData = filteredData.slice(-15);

    if (isLoading) {
        return (
            <View style={tw`bg-black/20 rounded-2xl border border-white/5 p-5 mb-4 items-center justify-center h-48`}>
                <ActivityIndicator color={COLORS.muted} size="small" />
            </View>
        );
    }

    return (
        <View style={tw`bg-black/20 rounded-2xl border border-white/5 p-4 mb-4`}>
            {/* Header */}
            <View style={tw`flex-row items-center gap-2 mb-3`}>
                <View style={tw`w-7 h-7 bg-[${COLORS.primary}]/15 rounded-lg items-center justify-center`}>
                    <TrendingUp size={14} color={COLORS.primary} />
                </View>
                <Text style={tw`text-white font-bold text-sm`}>Progression</Text>
                {todayMaxWeight > 0 && (
                    <View style={tw`bg-[${COLORS.primary}]/15 px-2 py-0.5 rounded-full`}>
                        <Text style={tw`text-[${COLORS.primary}] text-[9px] font-black uppercase`}>Live</Text>
                    </View>
                )}
                <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider ml-auto`}>Max Weight</Text>
            </View>

            {/* Time Range Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`} contentContainerStyle={tw`gap-2`}>
                {RANGE_OPTIONS.map((range) => (
                    <TouchableOpacity
                        key={range}
                        onPress={() => setSelectedRange(range)}
                        style={tw`px-3.5 py-1.5 rounded-full border ${
                            selectedRange === range
                                ? `bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                : 'bg-white/5 border-white/10'
                        }`}
                    >
                        <Text style={tw`font-bold text-[11px] ${selectedRange === range ? 'text-black' : 'text-slate-400'}`}>
                            {range}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Chart or Empty State */}
            {visibleData.length === 0 ? (
                <View style={tw`h-32 items-center justify-center bg-white/5 rounded-xl`}>
                    <Text style={tw`text-slate-500 text-sm text-center px-4`}>
                        {data.length === 0 && todayMaxWeight <= 0
                            ? 'Complete a set to start tracking progress'
                            : 'No data for this time range'}
                    </Text>
                </View>
            ) : (
                <ProgressionLineChart data={visibleData} weightUnit={weightUnit} />
            )}
        </View>
    );
}

// ─── SVG Line Chart ───
function ProgressionLineChart({
    data,
    weightUnit,
}: {
    data: { date: string; weight: number; originalDate: Date; isLive?: boolean }[];
    weightUnit: string;
}) {
    const height = 180;
    const width = SCREEN_WIDTH - 72;
    const padding = { top: 25, right: 15, bottom: 28, left: 35 };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const maxWeight = Math.max(...data.map(d => d.weight));
    const minWeight = Math.min(...data.map(d => d.weight));
    const range = (maxWeight - minWeight) || 1;
    const buffer = range * 0.15;
    const yMax = maxWeight + buffer;
    const yMin = Math.max(0, minWeight - buffer);
    const yRange = yMax - yMin;

    const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

    const points = data.map((d, i) => ({
        x: data.length === 1 ? padding.left + plotWidth / 2 : padding.left + i * stepX,
        y: data.length === 1 ? padding.top + plotHeight / 2 : padding.top + plotHeight - ((d.weight - yMin) / yRange) * plotHeight,
        val: d.weight,
        date: d.date,
        isLive: !!(d as any).isLive,
    }));

    // Path for historical points only (solid line)
    const historicalPoints = points.filter(p => !p.isLive);
    const livePoint = points.find(p => p.isLive);

    const historyPathData = historicalPoints.length > 1
        ? `M ${historicalPoints.map(p => `${p.x},${p.y}`).join(' L ')}`
        : '';

    // Dashed line from last historical point to live point
    const lastHistorical = historicalPoints[historicalPoints.length - 1];
    const dashPathData = lastHistorical && livePoint
        ? `M ${lastHistorical.x},${lastHistorical.y} L ${livePoint.x},${livePoint.y}`
        : '';

    // If no historical points but there's a live point, or only one historical point
    const singlePointOnly = points.length === 1;

    // Show ~4 date labels evenly spaced
    const dateInterval = Math.max(1, Math.ceil(points.length / 4));

    // Y-axis grid: 4 lines
    const yGridLines = [0, 0.33, 0.66, 1].map(r => {
        const y = padding.top + plotHeight - r * plotHeight;
        const val = yMin + r * yRange;
        return { y, val: Math.round(val) };
    });

    return (
        <View style={tw`items-center mt-1`}>
            <Svg height={height} width={width}>
                {/* Y-axis grid lines + labels */}
                {yGridLines.map((line, i) => (
                    <React.Fragment key={i}>
                        <Line
                            x1={padding.left}
                            y1={line.y}
                            x2={width - padding.right}
                            y2={line.y}
                            stroke="white"
                            strokeOpacity={0.05}
                            strokeWidth={1}
                        />
                        <SvgText
                            x={padding.left - 6}
                            y={line.y + 4}
                            fill="#64748b"
                            fontSize="9"
                            textAnchor="end"
                        >
                            {line.val >= 1000 ? `${(line.val / 1000).toFixed(1)}k` : line.val}
                        </SvgText>
                    </React.Fragment>
                ))}

                {/* Solid line for historical data */}
                {historyPathData ? (
                    <Path d={historyPathData} fill="none" stroke={COLORS.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                ) : null}

                {/* Dashed line to live point */}
                {dashPathData ? (
                    <Path d={dashPathData} fill="none" stroke={COLORS.primary} strokeWidth="2" strokeLinecap="round" strokeDasharray="6,4" strokeOpacity={0.6} />
                ) : null}

                {/* Data points + labels */}
                {points.map((p, i) => {
                    const isFirst = i === 0;
                    const isLast = i === points.length - 1;
                    const isSingle = singlePointOnly;
                    const showDate = isFirst || isLast || i % dateInterval === 0;

                    return (
                        <React.Fragment key={i}>
                            {/* Glow ring for live point */}
                            {p.isLive && (
                                <Circle cx={p.x} cy={p.y} r={10} fill={COLORS.primary} fillOpacity={0.15} />
                            )}

                            <Circle
                                cx={p.x}
                                cy={p.y}
                                r={p.isLive ? 6 : isSingle ? 6 : isLast ? 5 : 3.5}
                                fill={p.isLive || isLast || isSingle ? COLORS.primary : '#112116'}
                                stroke={p.isLive ? '#fff' : COLORS.primary}
                                strokeWidth={p.isLive ? 2 : (isLast || isSingle ? 0 : 2)}
                            />

                            {/* Value label on first, last, single, or live point */}
                            {(isFirst || isLast || isSingle || p.isLive) && (
                                <SvgText
                                    x={p.x}
                                    y={p.y - 12}
                                    fill={p.isLive ? COLORS.primary : 'white'}
                                    fontSize={p.isLive ? '12' : '11'}
                                    fontWeight="bold"
                                    textAnchor="middle"
                                >
                                    {p.val}
                                </SvgText>
                            )}

                            {/* Date label */}
                            {showDate && (
                                <SvgText
                                    x={p.x}
                                    y={height - 6}
                                    fill={p.isLive ? COLORS.primary : '#64748b'}
                                    fontSize="9"
                                    fontWeight={p.isLive ? 'bold' : 'normal'}
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
}
