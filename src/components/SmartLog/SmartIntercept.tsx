import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../../constants/theme';
import { AlertTriangle, ArrowRight, X } from 'lucide-react-native';
import { aiService } from '../../services/aiService';

interface SmartInterceptProps {
    visible: boolean;
    onClose: () => void;      // "Resume Workout"
    onQuit: () => void;       // "End Anyway"
    completedPercent: number;
    remainingExercises: string[];
}

export default function SmartIntercept({ visible, onClose, onQuit, completedPercent, remainingExercises }: SmartInterceptProps) {
    const [aiMessage, setAiMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (visible) {
            setLoading(true);
            aiService.getEarlyExitNudge(completedPercent, remainingExercises)
                .then(msg => {
                    setAiMessage(msg);
                    setLoading(false);
                });
        }
    }, [visible, completedPercent, remainingExercises]);

    if (!visible) return null;

    return (
        <Modal transparent animationType="fade" visible={visible}>
            <View style={tw`flex-1 bg-black/90 justify-center items-center px-6`}>
                <View style={tw`bg-slate-900 w-full rounded-3xl border border-white/10 p-6`}>

                    {/* Header */}
                    <View style={tw`flex-row items-center gap-3 mb-4`}>
                        <View style={tw`bg-yellow-500/20 p-3 rounded-full`}>
                            <AlertTriangle size={24} color="#eab308" />
                        </View>
                        <View>
                            <Text style={tw`text-white font-bold text-xl`}>Hold on!</Text>
                            <Text style={tw`text-slate-400 text-sm`}>You're {Math.round(completedPercent)}% complete</Text>
                        </View>
                    </View>

                    {/* AI Message */}
                    <View style={tw`bg-white/5 p-4 rounded-xl mb-6 border-l-4 border-[${COLORS.primary}]`}>
                        {loading ? (
                            <ActivityIndicator color={COLORS.primary} />
                        ) : (
                            <Text style={tw`text-white text-base leading-6 italic`}>
                                "{aiMessage || "You've come this far. Finish strong!"}"
                            </Text>
                        )}
                    </View>

                    {/* Remaining Work */}
                    <Text style={tw`text-slate-500 text-xs uppercase font-bold mb-2`}>Still to go:</Text>
                    <View style={tw`flex-row flex-wrap gap-2 mb-8`}>
                        {remainingExercises.map((ex, i) => (
                            <View key={i} style={tw`bg-white/10 px-3 py-1.5 rounded-lg`}>
                                <Text style={tw`text-slate-300 text-xs`}>{ex}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Actions */}
                    <TouchableOpacity
                        onPress={onClose}
                        style={tw`bg-[${COLORS.primary}] h-14 rounded-xl items-center justify-center flex-row gap-2 mb-3 shadow-lg shadow-[${COLORS.primary}]/50`}
                    >
                        <Text style={tw`text-black font-bold text-lg`}>Resume Workout</Text>
                        <ArrowRight size={20} color="black" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={onQuit}
                        style={tw`h-12 items-center justify-center`}
                    >
                        <Text style={tw`text-slate-500 font-bold`}>End Workout Anyway</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
