import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, Animated, Share, Platform, Vibration } from 'react-native';
import tw from 'twrnc';
import { BlurView } from 'expo-blur';
import { CheckCircle2, Trophy, Layers, Dumbbell, TrendingUp, Share2 } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import * as Haptics from 'expo-haptics';
import { aiService } from '../../services/aiService';
import { Sparkles } from 'lucide-react-native';

interface VictoryModalProps {
    visible: boolean;
    workoutData: any;
    onClose: () => void;
    weightUnit?: string;
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

export default function VictoryModal({ visible, workoutData, onClose, weightUnit = 'lbs' }: VictoryModalProps) {
    const [scaleAnim] = useState(new Animated.Value(0.8));
    const [opacityAnim] = useState(new Animated.Value(0));
    const [aiSummary, setAiSummary] = useState<string>('');
    const [summaryOpacity] = useState(new Animated.Value(0));

    // Q3: Single source of truth for workout stats
    const stats = useMemo(() => {
        if (!workoutData) return { totalExercises: 0, totalSets: 0, totalWeight: 0, weightedSets: 0, totalVolume: 0, avgWeight: 0 };
        const exercises = workoutData.exercises || [];
        let totalSets = 0;
        let totalWeight = 0;
        let weightedSets = 0;
        let totalVolume = 0;

        exercises.forEach((ex: any) => {
            (ex.sets || []).forEach((s: any) => {
                if (s.completed) {
                    totalSets++;
                    const w = parseFloat((s.actualWeight || s.targetWeight || '0').toString().replace(/[^0-9.]/g, ''));
                    const r = parseFloat((s.actualReps || s.targetReps || '0').toString());
                    if (w > 0) {
                        totalWeight += w;
                        weightedSets++;
                        totalVolume += w * r;
                    }
                }
            });
        });

        return {
            totalExercises: exercises.length,
            totalSets,
            totalWeight,
            weightedSets,
            totalVolume,
            avgWeight: weightedSets > 0 ? Math.round(totalWeight / weightedSets) : 0,
        };
    }, [workoutData]);

    useEffect(() => {
        if (visible) {
            // Haptic feedback sequence
            Vibration.vibrate();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 250);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 500);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 750);

            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();

            // Fetch AI Summary using memoized stats
            aiService.getPostWorkoutHype({
                exercises: stats.totalExercises,
                sets: stats.totalSets,
                volume: stats.totalVolume
            }, weightUnit).then(summary => {
                setAiSummary(summary);
                Animated.timing(summaryOpacity, {
                    toValue: 1,
                    duration: 500,
                    delay: 500,
                    useNativeDriver: true
                }).start();
            });
        } else {
            scaleAnim.setValue(0.8);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    if (!visible || !workoutData) return null;

    const { totalExercises, totalSets, avgWeight, totalVolume } = stats;
    const exercises = workoutData.exercises || [];

    // ─── Share Handler ───
    const handleShare = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const exerciseNames = exercises.map((ex: any) => ex.name).join(', ');
        const shareMessage =
            `🏋️ Workout Complete!\n\n` +
            `💪 ${totalExercises} Exercises: ${exerciseNames}\n` +
            `📊 ${totalSets} Sets Completed\n` +
            `⚡ ${avgWeight}${weightUnit} Avg Weight\n` +
            `🔥 ${Math.round(totalVolume).toLocaleString()}${weightUnit} Total Volume\n\n` +
            `Logged with FitConnect — the fastest workout logger on Earth ⚡`;

        try {
            await Share.share({
                message: shareMessage,
                ...(Platform.OS === 'ios' ? { url: '' } : {}),
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    return (
        <Modal
            animationType="none"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={tw`flex-1 justify-center items-center bg-black/85`}>
                <Animated.View
                    style={[
                        tw`w-[88%] bg-[#0c0c14] border border-white/10 rounded-3xl overflow-hidden`,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    {/* ─── Gold Accent Bar ─── */}
                    <View style={tw`h-1.5 bg-yellow-400`} />

                    <View style={tw`p-6 items-center`}>
                        {/* ─── Trophy Icon ─── */}
                        <View style={tw`w-20 h-20 bg-yellow-500/10 rounded-full items-center justify-center mb-5 border border-yellow-500/20`}>
                            <Trophy size={40} color="#fbbf24" />
                        </View>

                        {/* ─── Title ─── */}
                        <Text style={tw`text-white text-3xl font-black tracking-tight text-center mb-1`}>
                            Workout Complete!
                        </Text>

                        {/* ─── AI Hype Summary ─── */}
                        {aiSummary ? (
                            <Animated.View style={[tw`flex-row gap-3 bg-purple-500/10 p-4 rounded-2xl border border-purple-500/20 mb-6 w-full`, { opacity: summaryOpacity }]}>
                                <Sparkles size={20} color="#d8b4fe" style={tw`mt-1`} />
                                <Text style={tw`text-purple-200 font-medium flex-1 italic`}>"{aiSummary}"</Text>
                            </Animated.View>
                        ) : (
                            <View style={tw`h-4 mb-6`} />
                        )}

                        {/* ─── Stats Grid ─── */}
                        <View style={tw`flex-row gap-3 w-full mb-6`}>
                            <MetricPill
                                icon={Layers}
                                value={totalExercises.toString()}
                                label="Exercises"
                                color="#60a5fa"
                            />
                            <MetricPill
                                icon={Dumbbell}
                                value={totalSets.toString()}
                                label="Sets"
                                color="#4ade80"
                            />
                            <MetricPill
                                icon={TrendingUp}
                                value={`${avgWeight}${weightUnit}`}
                                label="Avg Weight"
                                color="#fbbf24"
                            />
                        </View>

                        {/* ─── Trainer Sync Confirmation ─── */}
                        <View style={tw`flex-row items-center gap-2 mb-6 bg-green-500/8 px-4 py-2.5 rounded-full border border-green-500/15`}>
                            <CheckCircle2 size={14} color="#4ade80" />
                            <Text style={tw`text-green-400 font-bold text-xs uppercase tracking-wider`}>
                                Sent to Trainer
                            </Text>
                        </View>

                        {/* ─── Action Buttons ─── */}
                        <View style={tw`w-full gap-3`}>
                            {/* Share Button */}
                            <TouchableOpacity
                                onPress={handleShare}
                                style={tw`w-full bg-white/5 border border-white/10 h-14 rounded-xl flex-row items-center justify-center gap-2`}
                                activeOpacity={0.7}
                            >
                                <Share2 size={18} color="white" />
                                <Text style={tw`text-white font-bold text-base`}>Share Workout</Text>
                            </TouchableOpacity>

                            {/* Done Button */}
                            <TouchableOpacity
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    onClose();
                                }}
                                style={tw`w-full bg-white h-14 rounded-xl items-center justify-center`}
                                activeOpacity={0.85}
                            >
                                <Text style={tw`text-black font-black text-lg uppercase tracking-wide`}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}
