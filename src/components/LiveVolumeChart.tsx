import React, { useEffect, useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import tw from 'twrnc';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

// ─── Types ───
interface LiveVolumeChartProps {
    /** Cumulative volume per set from last session (background area) */
    ghostData: number[];
    /** Cumulative volume per set from today (active line) */
    activeData: number[];
    /** Total expected number of sets (defines x-axis width) */
    totalSets: number;
    /** Called at animation peak for haptic feedback */
    onAnimationPeak?: () => void;
    /** Current weight unit (lbs/kg) */
    weightUnit?: string;
    /** Custom title for the chart */
    label?: string;
}

// ─── Chart Dimensions (P3: dynamic width) ───
const CHART_HEIGHT = 160;
const PADDING_LEFT = 35; // Space for Y-axis labels
const PADDING_RIGHT = 12;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 25;

// ─── Animated Components ───
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Helper: Build SVG path from data points ───
function buildPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    // Smooth curve using cubic bezier
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
}

// ─── Helper: Build area fill path (closes to bottom) ───
function buildAreaPath(points: { x: number; y: number }[], bottomY: number): string {
    if (points.length === 0) return '';
    const linePath = buildPath(points);
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    return `${linePath} L ${lastPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`;
}

// ─── Main Component ───
export default function LiveVolumeChart({
    ghostData,
    activeData,
    totalSets,
    onAnimationPeak,
    weightUnit = '',
    label = '',
}: LiveVolumeChartProps) {
    const { width: screenWidth } = useWindowDimensions();
    const CHART_WIDTH = screenWidth - 32; // 16px padding each side
    const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    // Determine y-axis scale (based on max of BOTH datasets)
    const maxVolume = useMemo(() => {
        const allValues = [...ghostData, ...activeData];
        if (allValues.length === 0) return 500;
        const actualMax = Math.max(...allValues);
        return Math.ceil((actualMax * 1.2) / 100) * 100; // 20% headroom
    }, [ghostData, activeData]);

    // Convert data → chart coordinates
    const toPoint = (index: number, value: number) => ({
        x: PADDING_LEFT + (index / Math.max(totalSets - 1, 1)) * PLOT_WIDTH,
        y: PADDING_TOP + PLOT_HEIGHT - (value / maxVolume) * PLOT_HEIGHT,
    });

    // Ghost Data: Render as a FILLED AREA (background shape)
    const ghostPoints = useMemo(
        () => ghostData.map((v, i) => toPoint(i, v)),
        [ghostData, maxVolume, totalSets]
    );
    // Since ghost data is "past", we might not have points for all 'totalSets' if this session has more sets.
    // But usually ghosts are complete.
    const ghostAreaPath = useMemo(
        () => buildAreaPath(ghostPoints, PADDING_TOP + PLOT_HEIGHT),
        [ghostPoints]
    );
    const ghostLinePath = useMemo(() => buildPath(ghostPoints), [ghostPoints]);


    // Active Data: Render as a LINE (foreground)
    const activePoints = useMemo(
        () => activeData.map((v, i) => toPoint(i, v)),
        [activeData, maxVolume, totalSets]
    );
    const activePath = useMemo(() => buildPath(activePoints), [activePoints]);

    // Gradient fill for active area (optional, maybe keep it minimal)
    const activeAreaPath = useMemo(
        () => buildAreaPath(activePoints, PADDING_TOP + PLOT_HEIGHT),
        [activePoints]
    );

    // Latest point for animated dot
    const latestPoint = activePoints.length > 0 ? activePoints[activePoints.length - 1] : null;

    // ─── Animation ───
    const dotScale = useSharedValue(0);

    useEffect(() => {
        if (activeData.length === 0) return;
        dotScale.value = 0;
        // Animate dot pop
        setTimeout(() => {
            dotScale.value = withTiming(1, {
                duration: 300,
                easing: Easing.bezier(0.34, 1.56, 0.64, 1),
            });
        }, 100);

        if (onAnimationPeak) onAnimationPeak();
    }, [activeData.length]);

    // Comparison Logic
    const currentVol = activeData.length > 0 ? activeData[activeData.length - 1] : 0;
    const prevVolAtSamePoint = ghostData.length > 0 ? (ghostData[Math.min(activeData.length - 1, ghostData.length - 1)] || 0) : 0;
    const isAhead = activeData.length > 0 && ghostData.length > 0 && currentVol > prevVolAtSamePoint;
    const volumeDiff = Math.abs(currentVol - prevVolAtSamePoint);

    return (
        <View style={tw`mb-2`}>
            {/* SVG Chart */}
            <View style={tw`bg-[#13131a] rounded-3xl border border-white/5 overflow-hidden`}>
                <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
                    <Defs>
                        <LinearGradient id="activeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <Stop offset="0%" stopColor={isAhead ? COLORS.primary : '#ef4444'} stopOpacity="0.3" />
                            <Stop offset="100%" stopColor={isAhead ? COLORS.primary : '#ef4444'} stopOpacity="0.0" />
                        </LinearGradient>
                        <LinearGradient id="ghostGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <Stop offset="0%" stopColor="#475569" stopOpacity="0.2" />
                            <Stop offset="100%" stopColor="#475569" stopOpacity="0.05" />
                        </LinearGradient>
                    </Defs>

                    {/* Y-Axis Grid */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const val = Math.round(maxVolume * ratio);
                        const y = PADDING_TOP + PLOT_HEIGHT * (1 - ratio);
                        return (
                            <React.Fragment key={`grid-${ratio}`}>
                                <Line
                                    x1={PADDING_LEFT}
                                    y1={y}
                                    x2={PADDING_LEFT + PLOT_WIDTH}
                                    y2={y}
                                    stroke="rgba(255,255,255,0.03)"
                                    strokeWidth={1}
                                />
                                {ratio > 0 && (
                                    <SvgText
                                        x={PADDING_LEFT - 8}
                                        y={y + 3}
                                        textAnchor="end"
                                        fill="#475569"
                                        fontSize={9}
                                        fontWeight="600"
                                    >
                                        {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                    </SvgText>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {/* 1. LAYER: Ghost Area (Background Shape) */}
                    {ghostPoints.length > 1 && (
                        <>
                            <Path
                                d={ghostAreaPath}
                                fill="url(#ghostGradient)"
                            />
                            <Path
                                d={ghostLinePath}
                                stroke="#475569"
                                strokeWidth={1}
                                strokeOpacity={0.5}
                                fill="none"
                            />
                        </>
                    )}

                    {/* 2. LAYER: Active Linear Progress (Foreground) */}
                    {activePoints.length > 1 && (
                        <>
                            <Path
                                d={activeAreaPath}
                                fill="url(#activeGradient)"
                            />
                            <Path
                                d={activePath}
                                stroke={isAhead ? COLORS.primary : '#ef4444'}
                                strokeWidth={3}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </>
                    )}

                    {/* Active Dots */}
                    {activePoints.slice(0, -1).map((p, i) => (
                        <Circle
                            key={`active-${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={3}
                            fill="#1e293b" // Dark core
                            stroke={isAhead ? COLORS.primary : '#ef4444'} // Colored ring
                            strokeWidth={2}
                        />
                    ))}

                    {/* Latest Animated Dot */}
                    {latestPoint && (
                        <AnimatedCircle
                            cx={latestPoint.x}
                            cy={latestPoint.y}
                            r={5}
                            fill={isAhead ? COLORS.primary : '#ef4444'}
                            stroke="#fff"
                            strokeWidth={2}
                            animatedProps={useAnimatedProps(() => ({
                                transform: [{ scale: dotScale.value }]
                            }))}
                        />
                    )}

                    {/* X-axis labels */}
                    {Array.from({ length: totalSets }, (_, i) => {
                        const x = PADDING_LEFT + (i / Math.max(totalSets - 1, 1)) * PLOT_WIDTH;
                        return (
                            <SvgText
                                key={`label-${i}`}
                                x={x}
                                y={CHART_HEIGHT - 6}
                                textAnchor="middle"
                                fill="#64748b"
                                fontSize={9}
                                fontWeight="700"
                            >
                                {i + 1}
                            </SvgText>
                        );
                    })}
                </Svg>
            </View>
        </View>
    );
}
