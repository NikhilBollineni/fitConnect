import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import tw from 'twrnc';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import {
    ArrowLeft, Save, Plus, Trash2,
    ChevronDown, ChevronUp, Utensils, Dumbbell, Loader
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let _exIdCounter = 0;
const createEmptyExercise = () => ({
    _id: `ex_${Date.now()}_${++_exIdCounter}_${Math.random().toString(36).slice(2, 7)}`,
    name: '', sets: '', reps: '', weight: '', notes: ''
});

// ------------------------------------------------------------------
// Section Header
// ------------------------------------------------------------------
const SectionHeader = ({ title, step }: { title: string, step: string }) => (
    <View style={tw`flex-row items-center gap-3 mb-4 mt-2`}>
        <View style={tw`w-8 h-8 rounded-full bg-[${COLORS.primary}] items-center justify-center`}>
            <Text style={tw`text-black font-bold text-xs`}>{step}</Text>
        </View>
        <Text style={tw`text-white font-bold text-lg`}>{title}</Text>
    </View>
);

// ------------------------------------------------------------------
// Memoized Exercise Row – prevents siblings from re-rendering on keystroke
// ------------------------------------------------------------------
const ExerciseRow = memo(({ exercise, idx, day, totalInDay, clientUnit, onUpdate, onRemove }: {
    exercise: any;
    idx: number;
    day: string;
    totalInDay: number;
    clientUnit: string;
    onUpdate: (day: string, index: number, field: string, value: string) => void;
    onRemove: (day: string, index: number) => void;
}) => (
    <View style={tw`mb-3 ${idx > 0 ? 'pt-3 border-t border-white/5' : ''}`}>
        <View style={tw`flex-row items-center mb-2`}>
            <View style={tw`w-6 h-6 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center mr-2`}>
                <Text style={tw`text-[${COLORS.primary}] font-bold text-[10px]`}>{idx + 1}</Text>
            </View>
            <TextInput
                style={tw`flex-1 bg-white/5 text-white px-3 py-2 rounded-lg font-bold text-sm mr-2`}
                placeholder="Exercise Name"
                placeholderTextColor="#555"
                defaultValue={exercise.name}
                onChangeText={(v) => onUpdate(day, idx, 'name', v)}
            />
            {totalInDay > 1 && (
                <TouchableOpacity
                    onPress={() => onRemove(day, idx)}
                    style={tw`w-8 h-8 rounded-lg bg-red-500/10 items-center justify-center`}
                >
                    <Trash2 size={14} color="#ef4444" />
                </TouchableOpacity>
            )}
        </View>

        <View style={tw`flex-row gap-2 mb-1.5`}>
            <View style={tw`flex-1`}>
                <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>SETS</Text>
                <TextInput
                    style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                    placeholder="3"
                    placeholderTextColor="#444"
                    keyboardType="numeric"
                    defaultValue={String(exercise.sets || '')}
                    onChangeText={(v) => onUpdate(day, idx, 'sets', v)}
                />
            </View>
            <View style={tw`flex-1`}>
                <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>REPS</Text>
                <TextInput
                    style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                    placeholder="12"
                    placeholderTextColor="#444"
                    keyboardType="numeric"
                    defaultValue={String(exercise.reps || '')}
                    onChangeText={(v) => onUpdate(day, idx, 'reps', v)}
                />
            </View>
            <View style={tw`flex-1`}>
                <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>WEIGHT ({clientUnit.toUpperCase()})</Text>
                <TextInput
                    style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                    placeholder={`20${clientUnit}`}
                    placeholderTextColor="#444"
                    defaultValue={exercise.weight}
                    onChangeText={(v) => onUpdate(day, idx, 'weight', v)}
                />
            </View>
        </View>

        <TextInput
            style={tw`bg-white/5 text-white px-3 py-2 rounded-lg text-xs`}
            placeholder="Notes (e.g. tempo, rest)"
            placeholderTextColor="#444"
            defaultValue={exercise.notes}
            onChangeText={(v) => onUpdate(day, idx, 'notes', v)}
        />
    </View>
));

// ------------------------------------------------------------------
// EditPlanScreen
// ------------------------------------------------------------------
export default function EditPlanScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { clientId, clientName, selectedDay, isSolo } = (route.params || {}) as {
        clientId: string;
        clientName: string;
        selectedDay?: string;
        isSolo?: boolean;
    };
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [clientUnit, setClientUnit] = useState('kg'); // Default to kg

    // --- Diet Plan (per day) ---
    const [dietExpanded, setDietExpanded] = useState(true);
    const initialDiet = DAYS.reduce((acc, day) => ({
        ...acc,
        [day]: { breakfast: '', lunch: '', dinner: '', snacks: '' }
    }), {});
    const [dietPlan, setDietPlan] = useState<any>(initialDiet);
    const dietDataRef = useRef<any>(initialDiet);

    // --- Exercises (per day) ---
    // exercisePlan (state) drives STRUCTURE only: which rows exist per day.
    // exerciseDataRef (ref) stores the LIVE values typed into inputs – updated
    // on every keystroke WITHOUT triggering a re-render, which is the key to
    // keeping the Android keyboard open.
    const [exercisesExpanded, setExercisesExpanded] = useState(true);
    const initialExercises = DAYS.reduce((acc, day) => ({
        ...acc,
        [day]: [createEmptyExercise()]
    }), {});
    const [exercisePlan, setExercisePlan] = useState<any>(initialExercises);
    const exerciseDataRef = useRef<any>(initialExercises);

    useEffect(() => {
        fetchCurrentPlan();
    }, [clientId]);

    const fetchCurrentPlan = async () => {
        try {
            const docRef = doc(db, 'clientProfiles', clientId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.preferredWeightUnit) setClientUnit(data.preferredWeightUnit);
                if (data.dietPlan) {
                    dietDataRef.current = data.dietPlan;
                    setDietPlan(data.dietPlan);
                }
                if (data.exercisePlan) {
                    const activePlan: any = {};
                    DAYS.forEach(day => {
                        if (data.exercisePlan[day] && data.exercisePlan[day].length > 0) {
                            activePlan[day] = data.exercisePlan[day].map((ex: any, i: number) => ({
                                ...ex,
                                _id: ex._id || `fetched_${day}_${i}_${Date.now()}`,
                                sets: ex.sets != null ? String(ex.sets) : '',
                                reps: ex.reps != null ? String(ex.reps) : '',
                                weight: ex.weight != null ? String(ex.weight) : '',
                                notes: ex.notes != null ? String(ex.notes) : '',
                            }));
                        } else {
                            activePlan[day] = [createEmptyExercise()];
                        }
                    });
                    exerciseDataRef.current = activePlan;
                    setExercisePlan(activePlan);
                }
            }
        } catch (error) {
            console.error("Error fetching plan:", error);
            Alert.alert("Error", "Failed to load current plan.");
        } finally {
            setLoading(false);
        }
    };

    // Only update the ref – no re-render, keyboard stays open
    const updateMeal = useCallback((day: string, meal: string, value: string) => {
        const current = dietDataRef.current;
        dietDataRef.current = { ...current, [day]: { ...current[day], [meal]: value } };
    }, []);

    const addExerciseToDay = (day: string) => {
        const newEx = createEmptyExercise();
        // Sync ref first with latest values, then add new exercise
        const current = exerciseDataRef.current;
        const updated = { ...current, [day]: [...current[day], newEx] };
        exerciseDataRef.current = updated;
        setExercisePlan(updated);
    };

    const removeExerciseFromDay = useCallback((day: string, index: number) => {
        const current = exerciseDataRef.current;
        if (current[day].length === 1) return;
        const updated = { ...current, [day]: current[day].filter((_: any, i: number) => i !== index) };
        exerciseDataRef.current = updated;
        setExercisePlan(updated);
    }, []);

    // Only update the ref – NO setState, NO re-render, keyboard stays open
    const updateExerciseInDay = useCallback((day: string, index: number, field: string, value: string) => {
        const current = exerciseDataRef.current;
        const updated = [...current[day]];
        updated[index] = { ...updated[index], [field]: value };
        exerciseDataRef.current = { ...current, [day]: updated };
    }, []);

    const handleSave = async () => {
        // Read live data from refs (not stale state)
        const liveExercises = exerciseDataRef.current;
        const liveDiet = dietDataRef.current;

        // 1. Validation
        let hasContent = false;
        const errors: string[] = [];

        // Check Diet
        DAYS.forEach(day => {
            const d = liveDiet[day];
            if (d && (d.breakfast?.trim() || d.lunch?.trim() || d.dinner?.trim() || d.snacks?.trim())) {
                hasContent = true;
            }
        });

        // Check Exercises
        DAYS.forEach(day => {
            (liveExercises[day] || []).forEach((ex: any, idx: number) => {
                const hasName = ex.name?.trim();
                const hasDetails = ex.sets || ex.reps || ex.weight;

                if (hasName) {
                    hasContent = true;
                    // Validate numbers
                    const s = parseInt(ex.sets);
                    const r = parseInt(ex.reps);
                    if (ex.sets && (isNaN(s) || s <= 0)) errors.push(`${day}: "${ex.name}" has invalid sets.`);
                    if (ex.reps && (isNaN(r) || r <= 0)) errors.push(`${day}: "${ex.name}" has invalid reps.`);
                } else if (hasDetails) {
                    // Name missing but has details
                    errors.push(`${day}: Exercise #${idx + 1} is missing a name.`);
                }
            });
        });

        if (!hasContent) {
            Alert.alert("Empty Plan", "Please add at least one meal or exercise before saving.");
            setSaving(false);
            return;
        }

        if (errors.length > 0) {
            Alert.alert("Validation Error", errors[0]); // Show first error
            setSaving(false);
            return;
        }

        setSaving(true);
        try {
            // 2. Clean Data (Proceed with saving) — read from ref
            const cleanedExercises: any = {};
            DAYS.forEach(day => {
                const valid = (liveExercises[day] || [])
                    .filter((ex: any) => ex.name?.trim())
                    .map((ex: any) => ({
                        name: ex.name.trim(),
                        sets: typeof ex.sets === 'string' ? parseInt(ex.sets) || 0 : ex.sets,
                        reps: typeof ex.reps === 'string' ? parseInt(ex.reps) || 0 : ex.reps,
                        weight: (ex.weight || '').toString().trim(),
                        notes: (ex.notes || '').toString().trim(),
                    }));
                if (valid.length > 0) cleanedExercises[day] = valid;
            });

            // 2. Update Firestore — use live ref data
            await updateDoc(doc(db, 'clientProfiles', clientId), {
                dietPlan: liveDiet,
                exercisePlan: cleanedExercises,
                updatedAt: serverTimestamp()
            });

            // 3. Determine what was updated
            const hasDiet = DAYS.some(day => {
                const d = liveDiet[day];
                return d && (d.breakfast?.trim() || d.lunch?.trim() || d.dinner?.trim() || d.snacks?.trim());
            });
            const hasExercise = Object.keys(cleanedExercises).length > 0;

            let planType: string = 'both';
            let messageText = "I've updated your Meal & Exercise plan! 🚀";
            if (hasDiet && hasExercise) {
                planType = 'both';
                messageText = "I've updated your Meal & Exercise plan! 🚀";
            } else if (hasDiet) {
                planType = 'meal';
                messageText = "I've updated your Meal plan! 🍽️";
            } else if (hasExercise) {
                planType = 'exercise';
                messageText = "I've updated your Exercise plan! 💪";
            }

            // 4. Send Notification in Chat (skip for solo users editing their own plan)
            if (user && !isSolo) {
                const chatsQuery = query(
                    collection(db, 'chats'),
                    where('participants', 'array-contains', user.uid)
                );
                const chatsSnap = await getDocs(chatsQuery);
                let targetChatId = null;

                const chatDoc = chatsSnap.docs.find(d => {
                    const p = d.data().participants || [];
                    return p.includes(clientId);
                });

                if (chatDoc) {
                    targetChatId = chatDoc.id;
                } else {
                    const newChat = await addDoc(collection(db, 'chats'), {
                        participants: [user.uid, clientId],
                        participantNames: {
                            [user.uid]: user.displayName || 'Coach',
                            [clientId]: clientName
                        },
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastMessage: messageText,
                        unreadCount: { [user.uid]: 0, [clientId]: 0 }
                    });
                    targetChatId = newChat.id;
                }

                if (targetChatId) {
                    await addDoc(collection(db, 'chats', targetChatId, 'messages'), {
                        text: messageText,
                        user: {
                            _id: user.uid,
                            name: user.displayName || 'Coach',
                        },
                        createdAt: serverTimestamp(),
                        metadata: { type: 'plan_update', planType, clientId, clientName }
                    });

                    // Update lastMessage for instant UI feedback.
                    // unreadCount is handled by the Cloud Function (onMessageCreated).
                    await updateDoc(doc(db, 'chats', targetChatId), {
                        lastMessage: messageText,
                        updatedAt: serverTimestamp(),
                    });
                }
            }

            Alert.alert(
                'Plan Updated!',
                isSolo ? 'Your plan has been saved.' : 'Your client has been notified.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );

        } catch (error) {
            console.error('Error saving plan:', error);
            Alert.alert('Error', 'Failed to save plan.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={tw`flex-1 bg-[${COLORS.background}] items-center justify-center`}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            <View style={tw`pt-12 px-6 pb-4 border-b border-white/5 flex-row items-center justify-between`}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`w-10 h-10 items-center justify-center rounded-full bg-white/5`}>
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>
                <View>
                    <Text style={tw`text-white font-bold text-lg text-center`}>Edit Plan</Text>
                    <Text style={tw`text-slate-400 text-xs text-center`}>{isSolo ? 'My Plan' : `for ${clientName}`}</Text>
                </View>
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    style={tw`px-4 py-2 rounded-full bg-[${COLORS.primary}] flex-row items-center gap-1.5`}
                >
                    {saving ? <Loader size={16} color="black" /> : <Save size={16} color="black" />}
                    <Text style={tw`text-black font-bold text-sm`}>{saving ? 'Saving' : 'Save'}</Text>
                </TouchableOpacity>
            </View>

            {/* iOS: KeyboardAvoidingView shifts content up. Android: "pan" mode in app.json handles it natively. */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={tw`flex-1`}
                enabled={Platform.OS === 'ios'}
            >
                <ScrollView
                    style={tw`flex-1 px-5 pt-5`}
                    contentContainerStyle={{ paddingBottom: 60 }}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="none"
                >
                    {selectedDay && (
                        <View style={tw`bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-2xl mb-5 flex-row items-center gap-3`}>
                            <Text style={tw`text-xl`}>📋</Text>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-amber-400 font-bold text-sm`}>{isSolo ? `Editing plan for ${selectedDay}` : `Client requested a plan for ${selectedDay}`}</Text>
                                <Text style={tw`text-amber-400/60 text-xs mt-0.5`}>Fill in the {selectedDay} section below and save</Text>
                            </View>
                        </View>
                    )}
                    {/* ============================================ */}
                    {/* SECTION 1: Diet Plan                          */}
                    {/* ============================================ */}
                    <SectionHeader step="1" title="Weekly Diet Plan" />

                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setDietExpanded(!dietExpanded)}
                        style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-1 flex-row items-center justify-between`}
                    >
                        <View style={tw`flex-row items-center gap-2`}>
                            <Utensils size={18} color="#fb923c" />
                            <Text style={tw`text-white font-bold`}>
                                {dietExpanded ? 'Collapse Diet Plan' : 'Expand Diet Plan'}
                            </Text>
                        </View>
                        {dietExpanded ? <ChevronUp size={20} color={COLORS.muted} /> : <ChevronDown size={20} color={COLORS.muted} />}
                    </TouchableOpacity>

                    {dietExpanded && (
                        <View style={tw`mb-5`}>
                            {DAYS.map(day => (
                                <View key={day} style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mt-3`}>
                                    <Text style={tw`text-[${COLORS.primary}] font-bold text-sm mb-3`}>{day}</Text>
                                    {['breakfast', 'lunch', 'dinner', 'snacks'].map(meal => (
                                        <View key={meal} style={tw`mb-2`}>
                                            <Text style={tw`text-slate-500 text-[10px] uppercase font-bold mb-1`}>{meal}</Text>
                                            <TextInput
                                                style={tw`bg-white/5 text-white px-3 py-2.5 rounded-lg text-sm`}
                                                placeholder={`e.g. ${meal === 'breakfast' ? 'Oats + Banana' : meal === 'lunch' ? 'Chicken + Rice' : meal === 'dinner' ? 'Fish + Veg' : 'Nuts'}`}
                                                placeholderTextColor="#444"
                                                defaultValue={dietPlan[day]?.[meal] || ''}
                                                onChangeText={(v) => updateMeal(day, meal, v)}
                                            />
                                        </View>
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}

                    {!dietExpanded && <View style={tw`mb-5`} />}

                    {/* ============================================ */}
                    {/* SECTION 2: Exercise Program                   */}
                    {/* ============================================ */}
                    <SectionHeader step="2" title="Weekly Exercise Program" />

                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setExercisesExpanded(!exercisesExpanded)}
                        style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-1 flex-row items-center justify-between`}
                    >
                        <View style={tw`flex-row items-center gap-2`}>
                            <Dumbbell size={18} color={COLORS.primary} />
                            <Text style={tw`text-white font-bold`}>
                                {exercisesExpanded ? 'Collapse Exercise Program' : 'Expand Exercise Program'}
                            </Text>
                        </View>
                        {exercisesExpanded ? <ChevronUp size={20} color={COLORS.muted} /> : <ChevronDown size={20} color={COLORS.muted} />}
                    </TouchableOpacity>

                    {exercisesExpanded && (
                        <View style={tw`mb-5`}>
                            {DAYS.map(day => (
                                <View key={day} style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mt-3`}>
                                    <Text style={tw`text-[${COLORS.primary}] font-bold text-sm mb-3`}>{day}</Text>

                                    {exercisePlan[day]?.map((exercise: any, idx: number) => (
                                        <ExerciseRow
                                            key={exercise._id || `fallback_${idx}`}
                                            exercise={exercise}
                                            idx={idx}
                                            day={day}
                                            totalInDay={exercisePlan[day].length}
                                            clientUnit={clientUnit}
                                            onUpdate={updateExerciseInDay}
                                            onRemove={removeExerciseFromDay}
                                        />
                                    ))}

                                    <TouchableOpacity
                                        onPress={() => addExerciseToDay(day)}
                                        style={tw`flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-white/10 mt-1`}
                                    >
                                        <Plus size={14} color={COLORS.muted} />
                                        <Text style={tw`text-slate-400 text-xs font-bold`}>Add Exercise</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                    <View style={tw`h-10`} />
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
