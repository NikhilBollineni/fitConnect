import React, { useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import tw from 'twrnc';
import { Clock, Sparkles, ChevronDown, ChevronUp } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

interface LastSessionInsightProps {
    historySetSnapshot: { weight: number; reps: number }[];
    lastSessionDate: Date | null;
    weightUnit: string;
    exerciseName: string;
    isLoading?: boolean;
}

export default function LastSessionInsight({
    historySetSnapshot,
    lastSessionDate,
    weightUnit,
    exerciseName,
    isLoading = false,
}: LastSessionInsightProps) {
    const [expanded, setExpanded] = useState(false);

    if (isLoading) {
        return (
            <View style={tw`bg-black/20 rounded-2xl border border-white/5 p-5 mb-4 items-center justify-center h-20`}>
                <ActivityIndicator color={COLORS.muted} size="small" />
            </View>
        );
    }

    // No previous session — first time
    if (!historySetSnapshot || historySetSnapshot.length === 0) {
        return (
            <View style={tw`bg-black/20 rounded-2xl border border-white/5 p-5 mb-4 flex-row items-center gap-3`}>
                <View style={tw`w-10 h-10 bg-purple-500/15 rounded-xl items-center justify-center`}>
                    <Sparkles size={18} color="#d8b4fe" />
                </View>
                <View style={tw`flex-1`}>
                    <Text style={tw`text-white font-bold text-sm`}>First Time!</Text>
                    <Text style={tw`text-slate-500 text-xs mt-0.5`}>
                        No previous data for {exerciseName}. Let's set a baseline.
                    </Text>
                </View>
            </View>
        );
    }

    // Format the date
    const dateStr = lastSessionDate
        ? lastSessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';

    // Check if all sets are the same (compact display)
    const allSame = historySetSnapshot.every(
        s => s.weight === historySetSnapshot[0].weight && s.reps === historySetSnapshot[0].reps
    );

    const totalSets = historySetSnapshot.length;

    // Summary line for collapsed state
    const summaryText = allSame
        ? `${totalSets} sets x ${historySetSnapshot[0].reps} reps @ ${historySetSnapshot[0].weight} ${weightUnit}`
        : `${totalSets} sets — ${historySetSnapshot[0].weight}-${historySetSnapshot[historySetSnapshot.length - 1].weight} ${weightUnit}`;

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setExpanded(!expanded)}
            style={tw`bg-black/20 rounded-2xl border border-white/5 p-4 mb-4`}
        >
            {/* Header — always visible */}
            <View style={tw`flex-row items-center justify-between`}>
                <View style={tw`flex-row items-center gap-2 flex-1`}>
                    <View style={tw`w-7 h-7 bg-blue-500/15 rounded-lg items-center justify-center`}>
                        <Clock size={14} color="#60a5fa" />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={tw`text-white font-bold text-sm`}>Last Session</Text>
                        {!expanded && (
                            <Text style={tw`text-slate-400 text-xs mt-0.5`} numberOfLines={1}>{summaryText}</Text>
                        )}
                    </View>
                </View>
                <View style={tw`flex-row items-center gap-2`}>
                    {dateStr ? (
                        <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider`}>{dateStr}</Text>
                    ) : null}
                    {expanded ? (
                        <ChevronUp size={16} color="#64748b" />
                    ) : (
                        <ChevronDown size={16} color="#64748b" />
                    )}
                </View>
            </View>

            {/* Expanded Content */}
            {expanded && (
                <View style={tw`mt-3`}>
                    {allSame ? (
                        <View style={tw`bg-white/5 rounded-xl p-3`}>
                            <Text style={tw`text-white text-base font-bold`}>
                                {totalSets} sets <Text style={tw`text-slate-400 font-normal`}>x</Text> {historySetSnapshot[0].reps} reps{' '}
                                <Text style={tw`text-slate-400 font-normal`}>@</Text>{' '}
                                <Text style={tw`text-[${COLORS.primary}]`}>{historySetSnapshot[0].weight} {weightUnit}</Text>
                            </Text>
                        </View>
                    ) : (
                        <View style={tw`gap-1.5`}>
                            {historySetSnapshot.map((set, idx) => (
                                <View key={idx} style={tw`flex-row items-center bg-white/5 rounded-xl px-3 py-2`}>
                                    <Text style={tw`text-slate-500 text-xs font-bold w-12`}>Set {idx + 1}</Text>
                                    <Text style={tw`text-white text-sm font-bold flex-1`}>
                                        {set.weight} {weightUnit} <Text style={tw`text-slate-400 font-normal`}>x</Text> {set.reps} reps
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
}
