import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Dimensions, Image, Alert } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { CATEGORIES, SUB_CATEGORIES } from '../../constants/exercises';
import { ArrowLeft, Clock, Dumbbell, Sparkles, Check, ChevronRight, Play } from 'lucide-react-native';
import { aiService } from '../../services/aiService';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export default function AIGeneratorView() {
    const navigation = useNavigation<any>();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Selections
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
    const [duration, setDuration] = useState('45 min');
    const [equipment, setEquipment] = useState('Full Gym');

    // Result
    const [generatedWorkout, setGeneratedWorkout] = useState<any[]>([]);
    const [loadingMessage, setLoadingMessage] = useState('Analyzing muscle recovery...');

    useEffect(() => {
        if (loading) {
            const msgs = [
                'Analyzing muscle recovery...',
                'Selecting optimal volume...',
                'Structuring supersets...',
                'Optimizing rest intervals...',
                'Selecting finisher exercises...'
            ];
            let i = 0;
            const interval = setInterval(() => {
                i = (i + 1) % msgs.length;
                setLoadingMessage(msgs[i]);
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [loading]);

    const handleGenerate = async () => {
        setLoading(true);
        setStep(3); // Loading View
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const muscle = selectedSubCategory
            ? `${selectedCategory} (${SUB_CATEGORIES[selectedCategory!].find(s => s.id === selectedSubCategory)?.label} Focus)`
            : selectedCategory || 'Full Body';

        try {
            const workout = await aiService.generateWorkout(muscle, duration, equipment);
            setGeneratedWorkout(workout);
            setStep(4); // Result View
        } catch (error) {
            console.error(error);
            Alert.alert("AI Error", "Failed to generate workout. Please try again.");
            setStep(2);
        } finally {
            setLoading(false);
        }
    };

    const startWorkout = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        navigation.navigate('WorkoutView', {
            workoutData: {
                id: Date.now().toString(),
                title: `AI ${selectedSubCategory || selectedCategory} Blast`,
                duration: duration,
                exercises: generatedWorkout.map((ex, exIdx) => ({
                    id: `ai-ex-${exIdx}-${Date.now()}`,
                    name: ex.name,
                    sets: Array.from({ length: ex.sets }, (_, sIdx) => ({
                        id: `ai-ex-${exIdx}-set-${sIdx}-${Date.now()}`,
                        targetReps: ex.reps.toString(),
                        targetWeight: '0', // Default for new workouts
                        completed: false,
                        actualReps: '',
                        actualWeight: ''
                    })),
                    notes: ex.notes
                }))
            },
            mode: 'ai_generated'
        });
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* ─── Header ─── */}
            <View style={tw`pt-14 px-6 pb-4 flex-row items-center justify-between`}>
                <TouchableOpacity onPress={() => step > 0 ? setStep(step - 1) : navigation.goBack()} style={tw`p-2 bg-white/5 rounded-full`}>
                    <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <Text style={tw`text-white font-black text-lg uppercase tracking-wider`}>AI Generator</Text>
                <View style={tw`w-10`} />
            </View>

            {/* ─── Step 0: Muscle Category ─── */}
            {step === 0 && (
                <ScrollView contentContainerStyle={tw`p-6`}>
                    <Text style={tw`text-3xl text-white font-black mb-2`}>What's the focus?</Text>
                    <Text style={tw`text-slate-400 mb-8`}>Select a muscle group to destroy today.</Text>

                    {CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        return (
                            <TouchableOpacity
                                key={cat.id}
                                onPress={() => {
                                    setSelectedCategory(cat.id);
                                    setStep(1);
                                }}
                                style={tw`h-32 mb-4 rounded-3xl overflow-hidden relative border border-white/5 bg-black`}
                            >
                                <View style={tw`absolute inset-0 bg-[${cat.color}] opacity-10`} />
                                <View style={tw`absolute -right-6 -bottom-6 opacity-10 rotate-[-15deg]`}>
                                    <Icon size={140} color={cat.color} />
                                </View>
                                <View style={tw`p-6 h-full justify-center`}>
                                    <View style={tw`flex-row items-center gap-3 mb-1`}>
                                        <View style={tw`w-10 h-10 rounded-full bg-[${cat.color}]/20 items-center justify-center`}>
                                            <Icon size={20} color={cat.color} />
                                        </View>
                                        <Text style={tw`text-white text-2xl font-black italic uppercase tracking-tighter`}>{cat.label}</Text>
                                    </View>
                                    <Text style={tw`text-slate-400 font-bold ml-13 opacity-70`}>{cat.sub}</Text>
                                </View>
                                <View style={tw`absolute right-6 top-1/2 -translate-y-3`}>
                                    <ChevronRight size={20} color={cat.color} style={{ opacity: 0.5 }} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* ─── Step 1: Sub-Category (Optional) ─── */}
            {step === 1 && selectedCategory && (
                <ScrollView contentContainerStyle={tw`p-6`}>
                    <Text style={tw`text-3xl text-white font-black mb-2`}>Specific Target?</Text>
                    <Text style={tw`text-slate-400 mb-8`}>Narrow it down or keep it general.</Text>

                    <TouchableOpacity
                        onPress={() => {
                            setSelectedSubCategory(null);
                            setStep(2);
                        }}
                        style={tw`w-full bg-white/5 border border-white/5 rounded-2xl p-6 mb-4 items-center flex-row gap-4`}
                    >
                        <View style={tw`w-12 h-12 bg-white/10 rounded-full items-center justify-center`}>
                            <Sparkles size={24} color={COLORS.primary} />
                        </View>
                        <View>
                            <Text style={tw`text-white font-bold text-lg`}>Overall {CATEGORIES.find(c => c.id === selectedCategory)?.label}</Text>
                            <Text style={tw`text-slate-400 text-sm`}>Balance focus on all muscles.</Text>
                        </View>
                        <ChevronRight size={20} color="white" style={tw`ml-auto opacity-50`} />
                    </TouchableOpacity>

                    <Text style={tw`text-slate-500 font-bold text-xs uppercase tracking-widest mb-4 mt-4`}>Quick Focus</Text>

                    <View style={tw`flex-row flex-wrap gap-3`}>
                        {SUB_CATEGORIES[selectedCategory as keyof typeof SUB_CATEGORIES].map((sub) => (
                            <TouchableOpacity
                                key={sub.id}
                                onPress={() => {
                                    setSelectedSubCategory(sub.id);
                                    setStep(2);
                                }}
                                style={tw`w-[48%] bg-white/5 border border-white/5 rounded-2xl p-5 items-center justify-center h-32 mb-1`}
                            >
                                <View style={tw`w-12 h-12 bg-white/10 rounded-full items-center justify-center mb-3`}>
                                    <Dumbbell size={24} color="white" />
                                </View>
                                <Text style={tw`text-white font-bold text-lg text-center`}>{sub.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            )}

            {/* ─── Step 2: Logistics ─── */}
            {step === 2 && (
                <View style={tw`p-6 flex-1`}>
                    <Text style={tw`text-3xl text-white font-black mb-2`}>Logistics.</Text>
                    <Text style={tw`text-slate-400 mb-8`}>Almost there.</Text>

                    {/* Duration */}
                    <Text style={tw`text-white font-bold mb-4`}>Duration</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-8 max-h-16`}>
                        {['30 min', '45 min', '60 min', '90 min'].map(d => (
                            <TouchableOpacity
                                key={d}
                                onPress={() => setDuration(d)}
                                style={tw`mr-3 px-6 h-12 rounded-full border items-center justify-center ${duration === d ? `bg-white border-white` : `bg-white/5 border-white/10`}`}
                            >
                                <Text style={tw`font-bold ${duration === d ? `text-black` : `text-white`}`}>{d}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Equipment */}
                    <Text style={tw`text-white font-bold mb-4`}>Equipment</Text>
                    {['Full Gym', 'Dumbbells Only', 'Bodyweight'].map(e => (
                        <TouchableOpacity
                            key={e}
                            onPress={() => setEquipment(e)}
                            style={tw`w-full mb-3 p-4 rounded-xl border flex-row items-center justify-between ${equipment === e ? `bg-purple-500/20 border-purple-500` : `bg-white/5 border-white/5`}`}
                        >
                            <Text style={tw`text-white font-bold text-base`}>{e}</Text>
                            {equipment === e && <Check size={20} color={COLORS.primary} />}
                        </TouchableOpacity>
                    ))}

                    <View style={tw`flex-1`} />

                    <TouchableOpacity
                        onPress={handleGenerate}
                        style={tw`w-full bg-[${COLORS.primary}] h-14 rounded-xl items-center justify-center flex-row gap-2`}
                    >
                        <Sparkles size={20} color="white" />
                        <Text style={tw`text-white font-black text-lg uppercase tracking-wide`}>Generate Workout</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ─── Step 3: Generating ─── */}
            {step === 3 && (
                <View style={tw`flex-1 items-center justify-center`}>
                    <Sparkles size={60} color={COLORS.primary} style={tw`mb-6 animate-spin`} />
                    <View style={tw`px-10 items-center`}>
                        <Text style={tw`text-white font-black text-2xl mb-2 text-center`}>{loadingMessage}</Text>
                        <Text style={tw`text-slate-400 text-center`}>
                            {loadingMessage.includes('Analyzing') ? 'Crafting the perfect routine based on your goals.' : 'Almost ready to crushed it.'}
                        </Text>
                    </View>
                </View>
            )}

            {/* ─── Step 4: Review ─── */}
            {step === 4 && (
                <View style={tw`flex-1`}>
                    <ScrollView contentContainerStyle={tw`p-6 pb-32`}>
                        <Text style={tw`text-3xl text-white font-black mb-2`}>Ready to Kill It?</Text>
                        <Text style={tw`text-slate-400 mb-6`}>{duration} • {selectedSubCategory || selectedCategory} Focus</Text>

                        {generatedWorkout.map((ex, i) => (
                            <View key={i} style={tw`bg-white/5 border border-white/5 p-4 rounded-xl mb-3`}>
                                <Text style={tw`text-white font-black text-lg mb-1`}>{ex.name}</Text>
                                <View style={tw`flex-row gap-4 mb-2`}>
                                    <Text style={tw`text-slate-400 font-bold`}>{ex.sets} Sets</Text>
                                    <Text style={tw`text-slate-400 font-bold`}>{ex.reps} Reps</Text>
                                </View>
                                {ex.notes && <Text style={tw`text-purple-300 text-xs italic`}>💡 {ex.notes}</Text>}
                            </View>
                        ))}
                    </ScrollView>

                    <View style={tw`absolute bottom-0 left-0 right-0 p-6 bg-black/80 border-t border-white/10`}>
                        <TouchableOpacity
                            onPress={startWorkout}
                            style={tw`w-full bg-[${COLORS.primary}] h-14 rounded-xl items-center justify-center flex-row gap-2`}
                        >
                            <Play size={20} color="white" fill="white" />
                            <Text style={tw`text-white font-black text-lg uppercase tracking-wide`}>Start Workout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setStep(0)} style={tw`mt-4 items-center`}>
                            <Text style={tw`text-slate-500 font-bold`}>Discard & Start Over</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}
