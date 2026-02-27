import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../../constants/theme';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, withSpring } from 'react-native-reanimated';

interface MissionBarProps {
    exercises: {
        name: string;
        sets: { completed: boolean }[]
    }[];
    currentExerciseIndex: number;
    currentSetIndex: number;
}

export default function MissionBar({ exercises, currentExerciseIndex, currentSetIndex }: MissionBarProps) {
    // Calculate total progress
    const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const completedSets = exercises.reduce((acc, ex) => {
        return acc + ex.sets.filter(s => s.completed).length;
    }, 0);

    // Animate overall progress percentage
    const progressPercent = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;
    const progressWidth = useSharedValue(0);

    useEffect(() => {
        progressWidth.value = withSpring(progressPercent, { damping: 15 });
    }, [progressPercent]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            width: `${progressWidth.value}%`,
        };
    });

    return (
        <View style={tw`w-full px-6 py-2`}>
            {/* Header Labels */}
            <View style={tw`flex-row justify-between items-center mb-2`}>
                <Text style={tw`text-slate-400 text-[10px] font-bold uppercase tracking-widest`}>
                    Mission Progress
                </Text>
                <Text style={tw`text-white text-xs font-bold`}>
                    {Math.round(progressPercent)}%
                </Text>
            </View>

            {/* Main Bar Container */}
            <View style={tw`h-2 bg-white/10 rounded-full overflow-hidden flex-row`}>
                {/* Animated Fill */}
                <Animated.View style={[tw`h-full bg-[${COLORS.primary}] absolute left-0 top-0 bottom-0 rounded-full`, animatedStyle]} />

                {/* Segments (Overlays) */}
                {exercises.map((ex, i) => {
                    const exSets = ex.sets.length;
                    const segmentWidth = (exSets / totalSets) * 100;

                    return (
                        <View
                            key={i}
                            style={[
                                tw`h-full border-r border-slate-900/50`,
                                { width: `${segmentWidth}%` }
                            ]}
                        />
                    );
                })}
            </View>

            {/* Current exercise indicator */}
            <View style={tw`mt-1 flex-row justify-between`}>
                <Text style={tw`text-slate-500 text-[10px]`}>
                    {completedSets} / {totalSets} Sets
                </Text>
                {progressPercent >= 100 && (
                    <Text style={tw`text-[${COLORS.primary}] text-[10px] font-bold uppercase`}>Mission Complete</Text>
                )}
            </View>
        </View>
    );
}
