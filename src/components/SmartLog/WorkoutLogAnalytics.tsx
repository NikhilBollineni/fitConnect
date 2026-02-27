import React from 'react';
import { View, Text } from 'react-native';
import tw from 'twrnc';
import { Trophy, Layers, Repeat, Info } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

interface WorkoutLogAnalyticsProps {
    exerciseName: string;
    bestWeight: number;
    totalSets: number;
    totalReps: number;
    weightUnit: string;
    // ghostData & activeData removed as volume chart is deprecated
}

const StatItem = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) => (
    <View style={tw`flex-1 bg-black/20 p-3 rounded-2xl border border-white/5 items-center justify-center`}>
        <Icon size={16} color={color} style={tw`mb-2`} />
        <Text style={[tw`text-lg font-black tracking-tight`, { color }]}>{value}</Text>
        <Text style={tw`text-slate-500 text-[9px] font-bold uppercase tracking-wider`}>{label}</Text>
    </View>
);

export default function WorkoutLogAnalytics({
    exerciseName,
    bestWeight,
    totalSets,
    totalReps,
    weightUnit,
}: WorkoutLogAnalyticsProps) {

    return (
        <View style={tw`mb-6`}>
            {/* Header */}
            <View style={tw`flex-row items-center justify-between px-1 mb-3`}>
                <Text style={tw`text-white font-black text-base tracking-tight`}>
                    Performance
                </Text>
            </View>

            {/* Main Stats Row */}
            <View style={tw`flex-row flex-wrap justify-between gap-2 px-1`}>
                <View style={tw`flex-1 min-w-[30%]`}>
                    <StatItem
                        icon={Trophy}
                        label="Best Lift"
                        value={`${bestWeight} ${weightUnit}`}
                        color="#fbbf24"
                    />
                </View>
                <View style={tw`flex-1 min-w-[30%]`}>
                    <StatItem
                        icon={Layers}
                        label="Lifetime Sets"
                        value={totalSets.toLocaleString()}
                        color="#60a5fa"
                    />
                </View>
                <View style={tw`flex-1 min-w-[30%]`}>
                    <StatItem
                        icon={Repeat}
                        label="Total Reps"
                        value={totalReps.toLocaleString()}
                        color="#4ade80"
                    />
                </View>
            </View>
        </View>
    );
}
