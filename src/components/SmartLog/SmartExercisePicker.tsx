import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../../constants/theme';
import { Search, X, Dumbbell, ArrowDown, Footprints, Flame, Sparkles, Plus, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { aiService } from '../../services/aiService';
import { CATEGORIES, SUB_CATEGORIES } from '../../constants/exercises';

interface SmartPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (exerciseName: string) => void;
    onSelectMultiple?: (exerciseNames: string[]) => void;
    intent?: string | null;
    recentHistory?: string[]; // For AI context
}

export default function SmartExercisePicker({ visible, onClose, onSelect, onSelectMultiple, intent, recentHistory = [] }: SmartPickerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(intent || null);
    const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [loadingAI, setLoadingAI] = useState(false);
    const [selectedSequence, setSelectedSequence] = useState<string[]>([]);

    // Reset when visible or intent changes
    useEffect(() => {
        if (visible) {
            setSelectedCategory(intent || null);
            setSelectedSubCategory(null);
            setSelectedSequence([]);
            setSearchQuery('');
        }
    }, [visible, intent]);

    // AI Suggestions
    useEffect(() => {
        if (visible && recentHistory.length > 0) {
            setLoadingAI(true);
            aiService.getExerciseSuggestions(recentHistory)
                .then(suggestions => {
                    setAiSuggestions(suggestions);
                    setLoadingAI(false);
                });
        }
    }, [visible, recentHistory]);

    // Computed List
    const filteredExercises = useMemo(() => {
        // 1. Intent Mode (Flat list)
        if (intent && !searchQuery) {
            // If it's a main category (PUSH/PULL/LEGS)
            if (SUB_CATEGORIES[intent]) {
                return SUB_CATEGORIES[intent].flatMap(sub => sub.exercises);
            }
            // If it's a sub-category ID (like CHEST)
            const parentCat = Object.keys(SUB_CATEGORIES).find(cat =>
                SUB_CATEGORIES[cat].some(sub => sub.id === intent)
            );
            if (parentCat) {
                return SUB_CATEGORIES[parentCat].find(sub => sub.id === intent)?.exercises || [];
            }
        }

        // 2. Search Mode
        if (searchQuery) {
            return Object.values(SUB_CATEGORIES).flatMap(cat => cat.flatMap(sub => sub.exercises))
                .filter(ex => ex.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // 3. Sub-Category Selected
        if (selectedSubCategory && selectedCategory) {
            const sub = SUB_CATEGORIES[selectedCategory]?.find(s => s.id === selectedSubCategory);
            return sub ? sub.exercises : [];
        }

        return [];
    }, [searchQuery, selectedCategory, selectedSubCategory, intent]);

    // When searching, clear category to show all results
    useEffect(() => {
        if (searchQuery) {
            setSelectedCategory(null);
            setSelectedSubCategory(null);
        }
    }, [searchQuery]);

    if (!visible) return null;

    return (
        <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
            <View style={tw`flex-1 bg-[${COLORS.background}]`}>

                {/* ─── Header ─── */}
                <View style={tw`pt-14 px-6 pb-4 border-b border-white/10 flex-row items-center gap-3`}>
                    <View style={tw`flex-1 bg-white/5 h-12 rounded-xl flex-row items-center px-4 border border-white/5`}>
                        <Search size={20} color="#94a3b8" />
                        <TextInput
                            placeholder="Find exercise..."
                            placeholderTextColor="#94a3b8"
                            style={tw`flex-1 ml-3 text-white font-bold text-base`}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus={false}
                        />
                    </View>
                    <TouchableOpacity onPress={onClose} style={tw`p-2`}>
                        <Text style={tw`text-[${COLORS.primary}] font-bold`}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={tw`flex-1`}>

                    {/* ─── AI Suggestions (Only on main screen) ─── */}
                    {!selectedCategory && !searchQuery && (
                        <View style={tw`mt-6 mb-2`}>
                            <View style={tw`px-6 flex-row items-center gap-2 mb-3`}>
                                <Sparkles size={16} color="#c084fc" />
                                <Text style={tw`text-white font-bold text-sm uppercase tracking-wider`}>Smart Suggestions</Text>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`px-6 gap-3`}>
                                {loadingAI ? (
                                    <View style={tw`w-40 h-14 bg-white/5 rounded-xl justify-center items-center`}>
                                        <ActivityIndicator color={COLORS.primary} />
                                    </View>
                                ) : aiSuggestions.length > 0 ? (
                                    aiSuggestions.map((ex, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            onPress={() => onSelect(ex)}
                                            style={tw`bg-purple-500/10 border border-purple-500/30 px-4 py-3 rounded-xl flex-row items-center gap-2`}
                                        >
                                            <Plus size={16} color="#c084fc" />
                                            <Text style={tw`text-purple-200 font-bold`}>{ex}</Text>
                                        </TouchableOpacity>
                                    ))
                                ) : (
                                    <Text style={tw`text-slate-500 italic text-xs`}>Complete a workout to get suggestions!</Text>
                                )}
                            </ScrollView>
                        </View>
                    )}

                    {/* ─── Muscle Map Categories (Main Level) ─── */}
                    {!selectedCategory && !searchQuery && (
                        <View style={tw`p-6`}>
                            <Text style={tw`text-slate-400 font-bold text-xs uppercase tracking-widest mb-4`}>Browse by Muscle</Text>

                            {CATEGORIES.map((cat) => {
                                const Icon = cat.icon;
                                return (
                                    <TouchableOpacity
                                        key={cat.id}
                                        onPress={() => setSelectedCategory(cat.id)}
                                        style={tw`h-32 mb-4 rounded-3xl overflow-hidden relative border border-white/5 bg-black`}
                                    >
                                        {/* Background Tint */}
                                        <View style={tw`absolute inset-0 bg-[${cat.color}] opacity-10`} />

                                        {/* Decorative Giant Icon */}
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
                        </View>
                    )}

                    {/* ─── Sub-Categories (Level 2) ─── */}
                    {selectedCategory && !selectedSubCategory && !searchQuery && (
                        <View style={tw`p-6`}>
                            <TouchableOpacity
                                onPress={() => setSelectedCategory(null)}
                                style={tw`mb-6 flex-row items-center gap-2 bg-white/5 p-3 rounded-lg self-start border border-white/5`}
                            >
                                <ArrowLeft size={16} color="white" />
                                <Text style={tw`text-white font-bold`}>Back to Categories</Text>
                            </TouchableOpacity>

                            <Text style={tw`text-3xl font-black text-white italic uppercase tracking-tighter mb-6`}>
                                {CATEGORIES.find(c => c.id === selectedCategory)?.label} Focus
                            </Text>

                            <View style={tw`flex-row flex-wrap gap-3`}>
                                {SUB_CATEGORIES[selectedCategory as keyof typeof SUB_CATEGORIES].map((sub) => (
                                    <TouchableOpacity
                                        key={sub.id}
                                        onPress={() => setSelectedSubCategory(sub.id)}
                                        style={tw`w-[48%] bg-white/5 border border-white/5 rounded-2xl p-5 items-center justify-center h-32 mb-1`}
                                    >
                                        <View style={tw`w-12 h-12 bg-white/10 rounded-full items-center justify-center mb-3`}>
                                            <Dumbbell size={24} color={CATEGORIES.find(c => c.id === selectedCategory)?.color || 'white'} />
                                        </View>
                                        <Text style={tw`text-white font-bold text-lg text-center`}>{sub.label}</Text>
                                        <Text style={tw`text-slate-400 text-xs mt-1`}>{sub.exercises.length} Exercises</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* ─── Exercise List (Level 3 or Search) ─── */}
                    {(selectedSubCategory || searchQuery) && (
                        <View style={tw`px-6 pt-4`}>
                            {selectedSubCategory && !searchQuery && (
                                <TouchableOpacity
                                    onPress={() => setSelectedSubCategory(null)}
                                    style={tw`mb-4 flex-row items-center gap-2`}
                                >
                                    <View style={tw`p-1 bg-white/10 rounded-full`}><ArrowLeft size={12} color="white" /></View>
                                    <Text style={tw`text-slate-400 font-bold`}>Back to {SUB_CATEGORIES[selectedCategory!].find(s => s.id === selectedSubCategory)?.label}</Text>
                                </TouchableOpacity>
                            )}

                            {filteredExercises.map((ex, i) => {
                                const selectedIndex = selectedSequence.indexOf(ex);
                                const isSelected = selectedIndex !== -1;

                                return (
                                    <TouchableOpacity
                                        key={i}
                                        onPress={() => {
                                            if (intent) {
                                                // Toggle Logic for Multi-select
                                                if (isSelected) {
                                                    setSelectedSequence(prev => prev.filter(item => item !== ex));
                                                } else {
                                                    setSelectedSequence(prev => [...prev, ex]);
                                                }
                                            } else {
                                                onSelect(ex);
                                            }
                                        }}
                                        style={[
                                            tw`p-3 bg-white/5 mb-3 rounded-xl border flex-row justify-between items-center`,
                                            isSelected ? tw`border-[${COLORS.primary}] bg-[${COLORS.primary}]/5` : tw`border-white/5`
                                        ]}
                                    >
                                        <View style={tw`flex-row items-center gap-4`}>
                                            <View style={tw`w-12 h-12 bg-white/10 rounded-lg items-center justify-center`}>
                                                <Dumbbell size={20} color={isSelected ? COLORS.primary : '#94a3b8'} style={{ opacity: isSelected ? 1 : 0.5 }} />
                                            </View>
                                            <Text style={[tw`text-white font-bold text-base`, isSelected && tw`text-[${COLORS.primary}]`]}>{ex}</Text>
                                        </View>

                                        {isSelected ? (
                                            <View style={tw`w-8 h-8 rounded-full bg-[${COLORS.primary}] items-center justify-center`}>
                                                <Text style={tw`text-black font-black text-sm`}>{selectedIndex + 1}</Text>
                                            </View>
                                        ) : (
                                            <View style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}>
                                                <Plus size={16} color="#94a3b8" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            {filteredExercises.length === 0 && (
                                <View style={tw`items-center py-10`}>
                                    <Text style={tw`text-slate-500`}>No exercises found.</Text>
                                    <TouchableOpacity
                                        onPress={() => onSelect(searchQuery)}
                                        style={tw`mt-4 bg-white/10 px-4 py-2 rounded-lg`}
                                    >
                                        <Text style={tw`text-white`}>Create "{searchQuery}"</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                </ScrollView>

                {/* ─── Intent Mode Footer ─── */}
                {intent && selectedSequence.length > 0 && (
                    <View style={tw`p-6 pb-10 bg-[${COLORS.background}] border-t border-white/10`}>
                        <TouchableOpacity
                            onPress={() => onSelectMultiple?.(selectedSequence)}
                            style={tw`h-16 bg-[${COLORS.primary}] rounded-2xl flex-row items-center justify-center gap-3`}
                            activeOpacity={0.8}
                        >
                            <Sparkles size={24} color="black" />
                            <Text style={tw`text-black font-black text-xl uppercase`}>
                                Build Workout ({selectedSequence.length})
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </Modal>
    );
}
