import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    TextInput, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import tw from 'twrnc';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import {
    ArrowLeft, Save, Plus, Trash2,
    Utensils, Dumbbell, Loader, Calendar, X
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp, doc, setDoc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { Clipboard } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import DatePickerModal from '../components/DatePickerModal';

// Helper to generate 6-char code
const generateInviteCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};


// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const GOAL_OPTIONS = [
    'Weight Loss', 'Muscle Gain', 'Strength', 'Endurance', 'General Fitness', 'Flexibility'
];

const createEmptyExercise = () => ({ name: '', sets: '', reps: '', weight: '', notes: '' });

// ------------------------------------------------------------------
// Section Header
// ------------------------------------------------------------------
const SectionHeader = ({ title, step }) => (
    <View style={tw`flex-row items-center gap-3 mb-4 mt-2`}>
        <View style={tw`w-8 h-8 rounded-full bg-[${COLORS.primary}] items-center justify-center`}>
            <Text style={tw`text-black font-bold text-xs`}>{step}</Text>
        </View>
        <Text style={tw`text-white font-bold text-lg`}>{title}</Text>
    </View>
);

// ------------------------------------------------------------------
// AddClientScreen
// ------------------------------------------------------------------
export default function AddClientScreen() {
    const navigation = useNavigation();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    // --- Client Details ---
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [age, setAge] = useState('');
    const [height, setHeight] = useState('');
    const [weight, setWeight] = useState('');
    const [selectedGoal, setSelectedGoal] = useState('');

    // --- Journey Start Date ---
    const [journeyDate, setJourneyDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    // --- Day selector + tab for plan sections ---
    const [selectedDay, setSelectedDay] = useState(
        new Date().toLocaleDateString('en-US', { weekday: 'long' })
    );
    const [activeTab, setActiveTab] = useState<'workout' | 'nutrition'>('workout');

    // --- Diet Plan (per day) ---
    const [dietPlan, setDietPlan] = useState(
        DAYS.reduce((acc, day) => ({
            ...acc,
            [day]: { breakfast: '', lunch: '', dinner: '', snacks: '' }
        }), {})
    );

    const updateMeal = (day, meal, value) => {
        setDietPlan(prev => ({
            ...prev,
            [day]: { ...prev[day], [meal]: value }
        }));
    };

    // --- Exercises (per day) ---
    const [exercisePlan, setExercisePlan] = useState(
        DAYS.reduce((acc, day) => ({
            ...acc,
            [day]: [createEmptyExercise()]
        }), {})
    );

    const addExerciseToDay = (day) => {
        setExercisePlan(prev => ({
            ...prev,
            [day]: [...prev[day], createEmptyExercise()]
        }));
    };

    const removeExerciseFromDay = (day, index) => {
        if (exercisePlan[day].length === 1) return;
        setExercisePlan(prev => ({
            ...prev,
            [day]: prev[day].filter((_, i) => i !== index)
        }));
    };

    const updateExerciseInDay = (day, index, field, value) => {
        setExercisePlan(prev => {
            const updated = [...prev[day]];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, [day]: updated };
        });
    };

    // --- Save to Firebase ---
    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Missing Name', "Please enter the client's name.");
            return;
        }
        if (!selectedGoal) {
            Alert.alert('Missing Goal', 'Please select a fitness goal.');
            return;
        }

        // Validate email format if provided
        if (email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                Alert.alert('Invalid Email', 'Please enter a valid email address.');
                return;
            }
        }

        // Validate age if provided
        if (age.trim()) {
            const ageNum = parseInt(age);
            if (isNaN(ageNum) || ageNum < 10 || ageNum > 120) {
                Alert.alert('Invalid Age', 'Age must be between 10 and 120.');
                return;
            }
        }

        const cleanedExercises = {};
        DAYS.forEach(day => {
            const valid = exercisePlan[day]
                .filter(ex => ex.name.trim())
                .map(ex => ({
                    name: ex.name.trim(),
                    sets: parseInt(ex.sets) || 0,
                    reps: parseInt(ex.reps) || 0,
                    weight: ex.weight.trim(),
                    notes: ex.notes.trim(),
                }));
            if (valid.length > 0) cleanedExercises[day] = valid;
        });

        setSaving(true);
        try {
            // Check for existing email
            if (email.trim()) {
                const emailQuery = query(collection(db, 'clientProfiles'), where('email', '==', email.trim().toLowerCase()));
                const emailSnap = await getDocs(emailQuery);

                if (!emailSnap.empty) {
                    const existingClient = emailSnap.docs[0].data();
                    if (existingClient.trainerId && existingClient.trainerId !== user?.uid) {
                        Alert.alert("Client Exists", "This email is already registered with another trainer.");
                        setSaving(false);
                        return;
                    }
                }
            }

            const inviteCode = generateInviteCode();

            const clientData: any = {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                age: parseInt(age) || 0,
                height: height.trim(),
                weight: weight.trim(),
                goal: selectedGoal,
                dietPlan,
                exercisePlan: cleanedExercises,
                trainerId: user?.uid || '',
                inviteCode,
                isClaimed: false,
                createdAt: Timestamp.now(),
                status: 'pending_claim',
                // Journey date (optional — client will confirm after claiming)
                ...(journeyDate && {
                    pendingJourneyDate: Timestamp.fromDate(journeyDate),
                    journeyDateStatus: 'pending',
                    journeyDateProposedBy: user?.uid || '',
                }),
            };

            await addDoc(collection(db, 'clientProfiles'), clientData);

            // Auto-ensure trainerProfiles doc exists so clients can fetch trainer info
            if (user?.uid) {
                const trainerProfileRef = doc(db, 'trainerProfiles', user.uid);
                const trainerSnap = await getDoc(trainerProfileRef);
                if (!trainerSnap.exists()) {
                    await setDoc(trainerProfileRef, {
                        name: user.displayName || 'Coach',
                        email: user.email || '',
                        createdAt: Timestamp.now(),
                    }, { merge: true });

                }
            }

            Alert.alert(
                'Client Plan Created! 🎟',
                `Invite Code: ${inviteCode}\n\nShare this code with your client. When they enter it in the app, they will automatically get this plan and be linked to you.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error) {
            console.error('Error saving client:', error);
            Alert.alert('Error', 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            <View style={tw`pt-12 px-6 pb-4 border-b border-white/5 flex-row items-center justify-between`}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`w-10 h-10 items-center justify-center rounded-full bg-white/5`}>
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>
                <Text style={tw`text-white font-bold text-lg`}>Add Client</Text>
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    style={tw`px-4 py-2 rounded-full bg-[${COLORS.primary}] flex-row items-center gap-1.5`}
                >
                    {saving ? <Loader size={16} color="black" /> : <Save size={16} color="black" />}
                    <Text style={tw`text-black font-bold text-sm`}>{saving ? 'Saving' : 'Save'}</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tw`flex-1`}>
                <ScrollView
                    style={tw`flex-1 px-5 pt-5`}
                    contentContainerStyle={{ paddingBottom: 60 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ============================================ */}
                    {/* SECTION 1: Client Details                     */}
                    {/* ============================================ */}
                    <SectionHeader step="1" title="Client Details" />

                    <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-5`}>
                        <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>FULL NAME</Text>
                        <TextInput
                            style={tw`bg-white/5 text-white px-4 py-3 rounded-xl mb-3 font-semibold`}
                            placeholder="e.g. Sarah Jenkins"
                            placeholderTextColor="#555"
                            value={name}
                            onChangeText={setName}
                        />

                        <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>EMAIL (Optional)</Text>
                        <TextInput
                            style={tw`bg-white/5 text-white px-4 py-3 rounded-xl mb-3 font-semibold`}
                            placeholder="client@example.com"
                            placeholderTextColor="#555"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                        />

                        <View style={tw`flex-row gap-3`}>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>AGE</Text>
                                <TextInput
                                    style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                    placeholder="25"
                                    placeholderTextColor="#555"
                                    keyboardType="numeric"
                                    value={age}
                                    onChangeText={setAge}
                                />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>HEIGHT</Text>
                                <TextInput
                                    style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                    placeholder="5ft 8in"
                                    placeholderTextColor="#555"
                                    value={height}
                                    onChangeText={setHeight}
                                />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>WEIGHT</Text>
                                <TextInput
                                    style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                    placeholder="70kg"
                                    placeholderTextColor="#555"
                                    value={weight}
                                    onChangeText={setWeight}
                                />
                            </View>
                        </View>

                        <Text style={tw`text-slate-400 text-xs font-bold mt-4 mb-2`}>FITNESS GOAL</Text>
                        <View style={tw`flex-row flex-wrap gap-2`}>
                            {GOAL_OPTIONS.map(goal => (
                                <TouchableOpacity
                                    key={goal}
                                    onPress={() => setSelectedGoal(goal)}
                                    style={tw`px-4 py-2 rounded-full border ${selectedGoal === goal
                                        ? `bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                        : 'bg-white/5 border-white/10'
                                        }`}
                                >
                                    <Text style={tw`text-sm font-semibold ${selectedGoal === goal ? 'text-black' : 'text-slate-300'
                                        }`}>
                                        {goal}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={tw`text-slate-400 text-xs font-bold mt-4 mb-2`}>JOURNEY START DATE (Optional)</Text>
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            style={tw`bg-white/5 rounded-xl px-4 py-3 flex-row items-center justify-between`}
                        >
                            <View style={tw`flex-row items-center gap-2`}>
                                <Calendar size={16} color={journeyDate ? COLORS.primary : '#64748b'} />
                                <Text style={tw`${journeyDate ? 'text-white font-semibold' : 'text-slate-500'} text-sm`}>
                                    {journeyDate ? format(journeyDate, 'MMMM d, yyyy') : 'Tap to set date...'}
                                </Text>
                            </View>
                            {journeyDate && (
                                <TouchableOpacity
                                    onPress={() => setJourneyDate(null)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <X size={16} color="#64748b" />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* ============================================ */}
                    {/* SECTION 2: Weekly Plan (Diet + Exercises)     */}
                    {/* ============================================ */}
                    <SectionHeader step="2" title="Weekly Plan" />

                    {/* Day Selector */}
                    <View style={tw`mb-4`}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
                            {DAYS.map((day) => {
                                const isSelected = selectedDay === day;
                                // Check if day has any data filled
                                const hasWorkout = exercisePlan[day]?.some(ex => ex.name.trim());
                                const hasMeal = dietPlan[day] && (dietPlan[day].breakfast.trim() || dietPlan[day].lunch.trim() || dietPlan[day].dinner.trim() || dietPlan[day].snacks.trim());
                                const hasData = hasWorkout || hasMeal;
                                return (
                                    <TouchableOpacity
                                        key={day}
                                        onPress={() => setSelectedDay(day)}
                                        style={[
                                            tw`w-11 h-14 rounded-2xl items-center justify-center border`,
                                            isSelected
                                                ? tw`bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                                : tw`bg-white/5 border-white/5`
                                        ]}
                                    >
                                        <Text style={[tw`text-[10px] font-bold mb-0.5`, isSelected ? tw`text-black` : tw`text-slate-500`]}>
                                            {day.slice(0, 3)}
                                        </Text>
                                        <Text style={[tw`text-base font-bold`, isSelected ? tw`text-black` : tw`text-white`]}>
                                            {day.charAt(0)}
                                        </Text>
                                        {hasData && !isSelected && (
                                            <View style={tw`absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[${COLORS.primary}]`} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Workout / Nutrition Toggle */}
                    <View style={tw`flex-row mb-4 bg-white/5 p-1 rounded-2xl`}>
                        <TouchableOpacity
                            onPress={() => setActiveTab('workout')}
                            style={[
                                tw`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl`,
                                activeTab === 'workout' ? tw`bg-slate-700` : tw`bg-transparent`
                            ]}
                        >
                            <Dumbbell size={15} color={activeTab === 'workout' ? 'white' : '#64748b'} />
                            <Text style={[tw`font-bold text-sm`, activeTab === 'workout' ? tw`text-white` : tw`text-slate-500`]}>Workout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveTab('nutrition')}
                            style={[
                                tw`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl`,
                                activeTab === 'nutrition' ? tw`bg-slate-700` : tw`bg-transparent`
                            ]}
                        >
                            <Utensils size={15} color={activeTab === 'nutrition' ? 'white' : '#64748b'} />
                            <Text style={[tw`font-bold text-sm`, activeTab === 'nutrition' ? tw`text-white` : tw`text-slate-500`]}>Nutrition</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Content: Workout or Nutrition for selected day */}
                    {activeTab === 'workout' ? (
                        /* ─── WORKOUT EDITOR FOR SELECTED DAY ─── */
                        <View style={tw`mb-6`}>
                            <View style={tw`flex-row justify-between items-center mb-3`}>
                                <Text style={tw`text-white font-bold text-base`}>{selectedDay}'s Workout</Text>
                                <View style={tw`flex-row items-center gap-1`}>
                                    <Dumbbell size={14} color={COLORS.primary} />
                                    <Text style={tw`text-[${COLORS.primary}] text-xs font-bold`}>
                                        {exercisePlan[selectedDay]?.filter(ex => ex.name.trim()).length || 0} exercises
                                    </Text>
                                </View>
                            </View>

                            {exercisePlan[selectedDay]?.map((exercise, idx) => (
                                <View key={idx} style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3`}>
                                    {/* Exercise Name + Delete */}
                                    <View style={tw`flex-row items-center mb-2`}>
                                        <View style={tw`w-6 h-6 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center mr-2`}>
                                            <Text style={tw`text-[${COLORS.primary}] font-bold text-[10px]`}>{idx + 1}</Text>
                                        </View>
                                        <TextInput
                                            style={tw`flex-1 bg-white/5 text-white px-3 py-2 rounded-lg font-bold text-sm mr-2`}
                                            placeholder="Exercise Name"
                                            placeholderTextColor="#555"
                                            value={exercise.name}
                                            onChangeText={(v) => updateExerciseInDay(selectedDay, idx, 'name', v)}
                                        />
                                        {exercisePlan[selectedDay].length > 1 && (
                                            <TouchableOpacity
                                                onPress={() => removeExerciseFromDay(selectedDay, idx)}
                                                style={tw`w-8 h-8 rounded-lg bg-red-500/10 items-center justify-center`}
                                            >
                                                <Trash2 size={14} color="#ef4444" />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* Sets / Reps / Weight */}
                                    <View style={tw`flex-row gap-2 mb-1.5`}>
                                        <View style={tw`flex-1`}>
                                            <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>SETS</Text>
                                            <TextInput
                                                style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                                                placeholder="3"
                                                placeholderTextColor="#444"
                                                keyboardType="numeric"
                                                value={exercise.sets}
                                                onChangeText={(v) => updateExerciseInDay(selectedDay, idx, 'sets', v)}
                                            />
                                        </View>
                                        <View style={tw`flex-1`}>
                                            <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>REPS</Text>
                                            <TextInput
                                                style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                                                placeholder="12"
                                                placeholderTextColor="#444"
                                                keyboardType="numeric"
                                                value={exercise.reps}
                                                onChangeText={(v) => updateExerciseInDay(selectedDay, idx, 'reps', v)}
                                            />
                                        </View>
                                        <View style={tw`flex-1`}>
                                            <Text style={tw`text-slate-500 text-[10px] font-bold mb-1 text-center`}>WEIGHT</Text>
                                            <TextInput
                                                style={tw`bg-white/5 text-white text-center py-2 rounded-lg font-bold text-sm`}
                                                placeholder="20kg"
                                                placeholderTextColor="#444"
                                                value={exercise.weight}
                                                onChangeText={(v) => updateExerciseInDay(selectedDay, idx, 'weight', v)}
                                            />
                                        </View>
                                    </View>

                                    {/* Notes */}
                                    <TextInput
                                        style={tw`bg-white/5 text-white px-3 py-2 rounded-lg text-xs`}
                                        placeholder="Notes (e.g. tempo, rest, form cues)"
                                        placeholderTextColor="#444"
                                        value={exercise.notes}
                                        onChangeText={(v) => updateExerciseInDay(selectedDay, idx, 'notes', v)}
                                    />
                                </View>
                            ))}

                            {/* Add exercise button */}
                            <TouchableOpacity
                                onPress={() => addExerciseToDay(selectedDay)}
                                style={tw`flex-row items-center justify-center gap-1.5 py-3 rounded-2xl border border-dashed border-white/10 bg-white/3`}
                            >
                                <Plus size={16} color={COLORS.primary} />
                                <Text style={tw`text-[${COLORS.primary}] text-sm font-bold`}>Add Exercise</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        /* ─── NUTRITION EDITOR FOR SELECTED DAY ─── */
                        <View style={tw`mb-6`}>
                            <View style={tw`flex-row justify-between items-center mb-3`}>
                                <Text style={tw`text-white font-bold text-base`}>{selectedDay}'s Meals</Text>
                                <View style={tw`flex-row items-center gap-1`}>
                                    <Utensils size={14} color="#fb923c" />
                                    <Text style={tw`text-orange-400 text-xs font-bold`}>
                                        {dietPlan[selectedDay] && Object.values(dietPlan[selectedDay]).filter((v: string) => v.trim()).length || 0} meals filled
                                    </Text>
                                </View>
                            </View>

                            <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5`}>
                                {[
                                    { key: 'breakfast', emoji: '🌅', label: 'Breakfast', placeholder: 'e.g. Oats + Banana + Protein Shake' },
                                    { key: 'lunch', emoji: '☀️', label: 'Lunch', placeholder: 'e.g. Chicken Breast + Rice + Veggies' },
                                    { key: 'dinner', emoji: '🌙', label: 'Dinner', placeholder: 'e.g. Salmon + Sweet Potato' },
                                    { key: 'snacks', emoji: '🥜', label: 'Snacks', placeholder: 'e.g. Almonds + Greek Yogurt' },
                                ].map((meal, idx) => (
                                    <View key={meal.key} style={tw`${idx > 0 ? 'pt-3 mt-3 border-t border-white/5' : ''}`}>
                                        <View style={tw`flex-row items-center gap-2 mb-1.5`}>
                                            <Text style={tw`text-base`}>{meal.emoji}</Text>
                                            <Text style={tw`text-slate-400 text-xs font-bold uppercase`}>{meal.label}</Text>
                                        </View>
                                        <TextInput
                                            style={tw`bg-white/5 text-white px-3 py-2.5 rounded-xl text-sm`}
                                            placeholder={meal.placeholder}
                                            placeholderTextColor="#444"
                                            value={dietPlan[selectedDay]?.[meal.key] || ''}
                                            onChangeText={(v) => updateMeal(selectedDay, meal.key, v)}
                                        />
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Journey Date Picker Modal */}
            <DatePickerModal
                visible={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onSelect={(date) => setJourneyDate(date)}
                initialDate={journeyDate || new Date()}
                title="Journey Start Date"
                maxDate={new Date()}
            />
        </View>
    );
}
