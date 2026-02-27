import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import tw from 'twrnc';
import { X, PlayCircle, Zap, Dumbbell, Layers, TrendingUp, Sparkles, Trophy } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { SmartContext } from '../../services/SmartContextService';

interface ContextCardProps {
    visible: boolean;
    onClose: () => void;
    onStart: () => void;
    onStartNew?: () => void; // New prop for secondary action
    onSelectIntent?: (intent: string) => void;
    context: SmartContext | null;
    loading?: boolean;
}

function MetricPill({ icon: Icon, value, label, color }: { icon: any; value: string; label: string; color: string }) {
    return (
        <View style={tw`flex-1 bg-white/5 rounded-2xl p-4 items-center border border-white/5`}>
            <View style={[tw`w-10 h-10 rounded-full items-center justify-center mb-2`, { backgroundColor: color + '20' }]}>
                <Icon size={18} color={color} />
            </View>
            <Text style={tw`text-white font-black text-xl`}>{value}</Text>
            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1`}>{label}</Text>
        </View>
    );
}

function IntentCard({ label, sub, icon: Icon, color, onPress }: { label: string, sub: string, icon: any, color: string, onPress: () => void }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={tw`w-[48%] h-24 bg-white/5 rounded-2xl border border-white/10 p-4 relative overflow-hidden`}
        >
            <View style={tw`absolute -right-2 -bottom-2 opacity-10`}>
                <Icon size={64} color={color} />
            </View>
            <View style={[tw`w-8 h-8 rounded-full items-center justify-center mb-2`, { backgroundColor: color + '20' }]}>
                <Icon size={16} color={color} />
            </View>
            <Text style={tw`text-white font-bold text-base`}>{label}</Text>
            <Text style={tw`text-slate-500 text-[10px] uppercase font-bold`}>{sub}</Text>
        </TouchableOpacity>
    );
}

export default function ContextCardModal({ visible, onClose, onStart, onStartNew, onSelectIntent, context, loading }: ContextCardProps) {
    if (!visible) return null;

    // Loading State
    if (loading) {
        return (
            <Modal
                animationType="fade"
                transparent={true}
                visible={visible}
                onRequestClose={onClose}
            >
                <View style={tw`flex-1 justify-end`}>
                    <TouchableOpacity style={tw`absolute inset-0 bg-black/70`} activeOpacity={1} />
                    <View style={tw`bg-[#0a0a0f] rounded-t-3xl border-t border-white/10 overflow-hidden`}>
                        <View style={tw`w-10 h-1 bg-white/20 self-center mt-3 rounded-full`} />
                        <View style={tw`p-6 pt-8`}>
                            {/* Skeleton Header */}
                            <View style={tw`flex-row justify-between items-start mb-5`}>
                                <View style={tw`flex-1`}>
                                    <View style={tw`w-24 h-4 bg-white/10 rounded-full mb-3`} />
                                    <View style={tw`w-48 h-8 bg-white/10 rounded-lg mb-2`} />
                                    <View style={tw`w-32 h-4 bg-white/10 rounded-lg`} />
                                </View>
                            </View>

                            {/* Skeleton Message */}
                            <View style={tw`h-20 bg-white/5 rounded-2xl mb-8`} />

                            {/* Skeleton Metrics */}
                            <View style={tw`flex-row gap-3 mb-8`}>
                                <View style={tw`flex-1 h-24 bg-white/5 rounded-2xl`} />
                                <View style={tw`flex-1 h-24 bg-white/5 rounded-2xl`} />
                                <View style={tw`flex-1 h-24 bg-white/5 rounded-2xl`} />
                            </View>

                            {/* Skeleton Button */}
                            <View style={tw`h-16 rounded-2xl bg-white/10 mb-8`} />
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }

    if (!context) return null;

    const isCompleted = context.type === 'COMPLETED';
    const metrics = context.lastWeekMetrics; // Re-used for "Today's Stats" if Completed
    const planExerciseCount = context.data?.exercises?.length || 0;

    // Victory Theme or Standard Theme
    const themeColor = isCompleted ? '#fbbf24' : COLORS.primary; // Gold vs Primary
    const buttonText = isCompleted ? "View Details" : "Start Workout";
    const subTitle = isCompleted ? "You crushed it!" : context.title;

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={tw`flex-1 justify-end`}>
                {/* Backdrop */}
                <TouchableOpacity
                    style={tw`absolute inset-0 bg-black/70`}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <View style={tw`bg-[#0a0a0f] rounded-t-3xl border-t border-white/10 overflow-hidden`}>
                    {/* Drag Handle */}
                    <View style={tw`w-10 h-1 bg-white/20 self-center mt-3 rounded-full`} />

                    <View style={tw`p-6 pt-8`}>
                        {/* ─── Header ─── */}
                        <View style={tw`flex-row justify-between items-start mb-5`}>
                            <View style={tw`flex-1`}>
                                <View style={tw`flex-row items-center gap-2 mb-2`}>
                                    {isCompleted ? <Trophy size={14} color={themeColor} /> : <Sparkles size={14} color={themeColor} />}
                                    <Text style={[tw`font-bold uppercase tracking-widest text-[10px]`, { color: themeColor }]}>
                                        {isCompleted ? "SESSION COMPLETE" : "SMART LOG"}
                                    </Text>
                                </View>
                                <Text style={tw`text-white font-black text-3xl tracking-tight`}>
                                    {context.subtitle}
                                </Text>
                                <Text style={tw`text-slate-400 text-sm mt-1`}>
                                    {subTitle} {isCompleted ? '' : `· ${planExerciseCount} exercises ready`}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={tw`bg-white/5 p-2.5 rounded-full`}>
                                <X size={18} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        {/* ─── Coach Message ─── */}
                        <View style={[tw`p-4 rounded-2xl border mb-5`, { backgroundColor: themeColor + '15', borderColor: themeColor + '25' }]}>
                            <Text style={tw`text-white/80 text-sm leading-5`}>
                                {context.contextMessage}
                            </Text>
                        </View>

                        {/* ─── Metrics Section (Last Week OR Today's Victory Stats) ─── */}
                        {metrics ? (
                            <View style={tw`mb-6`}>
                                <Text style={tw`text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-3`}>
                                    {isCompleted ? "Today's Performance" : `Last ${metrics.date} — Same Day`}
                                </Text>
                                <View style={tw`flex-row gap-3`}>
                                    <MetricPill
                                        icon={Layers}
                                        value={metrics.totalExercises.toString()}
                                        label="Exercises"
                                        color="#60a5fa"
                                    />
                                    <MetricPill
                                        icon={Dumbbell}
                                        value={metrics.totalSets.toString()}
                                        label="Sets"
                                        color="#4ade80"
                                    />
                                    <MetricPill
                                        icon={TrendingUp}
                                        value={`${metrics.avgWeightPerSet}kg`}
                                        label="Avg / Set"
                                        color="#f59e0b"
                                    />
                                </View>
                            </View>
                        ) : (
                            !isCompleted && (
                                <View style={tw`mb-6`}>
                                    <Text style={tw`text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-3`}>
                                        Select Your Focus
                                    </Text>
                                    <View style={tw`flex-row flex-wrap gap-2`}>
                                        <IntentCard
                                            label="Push"
                                            sub="Chest, Shoulders"
                                            icon={Dumbbell}
                                            color="#f87171"
                                            onPress={() => onSelectIntent?.('PUSH')}
                                        />
                                        <IntentCard
                                            label="Pull"
                                            sub="Back, Biceps"
                                            icon={TrendingUp}
                                            color="#60a5fa"
                                            onPress={() => onSelectIntent?.('PULL')}
                                        />
                                        <IntentCard
                                            label="Legs"
                                            sub="Quads, Glutes"
                                            icon={Layers}
                                            color="#4ade80"
                                            onPress={() => onSelectIntent?.('LEGS')}
                                        />
                                        <IntentCard
                                            label="Core"
                                            sub="Abs, Cardio"
                                            icon={Zap}
                                            color="#facc15"
                                            onPress={() => onSelectIntent?.('CORE')}
                                        />
                                    </View>
                                </View>
                            )
                        )}

                        {/* ─── Today's Plan Preview (Only if NOT completed) ─── */}
                        {context.data?.exercises && !isCompleted && (
                            <View style={tw`mb-6`}>
                                <Text style={tw`text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-3`}>
                                    Today's Exercises
                                </Text>
                                <View style={tw`flex-row flex-wrap gap-2`}>
                                    {context.data.exercises.slice(0, 6).map((ex: any, i: number) => (
                                        <View key={i} style={tw`bg-white/5 px-3 py-2 rounded-xl border border-white/5`}>
                                            <Text style={tw`text-white text-xs font-semibold`}>{ex.name}</Text>
                                            <Text style={tw`text-slate-500 text-[10px]`}>
                                                {ex.sets?.length || 0} sets
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* ─── Action Button ─── */}
                        <TouchableOpacity
                            onPress={onStart}
                            style={[tw`h-16 rounded-2xl flex-row items-center justify-center gap-3 mb-3`, { backgroundColor: themeColor }]}
                            activeOpacity={0.85}
                        >
                            {isCompleted ? <Trophy size={24} color="black" /> : <PlayCircle size={24} color="black" />}
                            <Text style={tw`text-black font-black text-xl uppercase tracking-wide`}>
                                {buttonText}
                            </Text>
                        </TouchableOpacity>

                        {/* ─── Secondary Action (Start New Workout) ─── */}
                        {isCompleted && onStartNew && (
                            <TouchableOpacity
                                onPress={onStartNew}
                                style={tw`h-14 rounded-2xl flex-row items-center justify-center gap-2 mb-4 border border-white/20`}
                                activeOpacity={0.7}
                            >
                                <PlayCircle size={20} color="white" />
                                <Text style={tw`text-white font-bold text-base`}>Start New Workout</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}
