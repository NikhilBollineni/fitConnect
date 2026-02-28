import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import tw from 'twrnc';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Dumbbell, Utensils, Calendar, ChevronRight, Bell, Plus, Pencil } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../types/firestore';
import { sendPlanRequestMessage, PlanRequestType } from '../utils/planRequest';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ProgramScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { defaultTab } = (route.params as { defaultTab?: 'workout' | 'nutrition' }) || {};

    const { user } = useAuth();
    const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(new Date().toLocaleDateString('en-US', { weekday: 'long' }));
    const [activeTab, setActiveTab] = useState<'workout' | 'nutrition'>(defaultTab || 'workout');
    const [requestSent, setRequestSent] = useState<PlanRequestType | null>(null);
    const [sendingRequest, setSendingRequest] = useState(false);

    const fetchProfile = async () => {
        if (!user?.uid) return;
        try {
            const docRef = doc(db, "clientProfiles", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setClientProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Refresh profile on screen focus (e.g. returning from EditPlan)
    useFocusEffect(
        useCallback(() => {
            fetchProfile();
        }, [user])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchProfile();
    };

    const handleRequestPlan = async (type: PlanRequestType) => {
        if (!user || !clientProfile?.trainerId || sendingRequest) return;
        setSendingRequest(true);
        try {
            await sendPlanRequestMessage(user, clientProfile.trainerId, type, selectedDay);
            setRequestSent(type);
            const typeLabel = type === 'both' ? 'workout & meal' : type === 'exercise' ? 'workout' : 'meal';
            Alert.alert('Sent! 🎉', `Your coach has been notified and will create your ${typeLabel} plan for ${selectedDay} soon.`);
        } catch {
            Alert.alert('Error', 'Could not send the request. Please try again.');
        } finally {
            setSendingRequest(false);
        }
    };

    // Reset request state when the selected day changes
    useEffect(() => { setRequestSent(null); }, [selectedDay]);

    const dailyRoutine = clientProfile?.exercisePlan?.[selectedDay];
    const dailyMeals = clientProfile?.dietPlan?.[selectedDay];
    const noExercise = !dailyRoutine || dailyRoutine.length === 0;
    const noMeal = !dailyMeals;
    const isSolo = !clientProfile?.trainerId;

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}] pt-12`}>
            {/* Header */}
            <View style={tw`flex-row items-center justify-between px-6 mb-6`}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center`}
                >
                    <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <Text style={tw`text-white font-bold text-lg`}>Your Program</Text>
                <View style={tw`w-10`} />
            </View>

            {/* Day Selector */}
            <View style={tw`mb-6`}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`px-6 gap-3`}>
                    {DAYS.map((day) => {
                        const isSelected = selectedDay === day;
                        const dayInitial = day.charAt(0);
                        return (
                            <TouchableOpacity
                                key={day}
                                onPress={() => setSelectedDay(day)}
                                style={[
                                    tw`w-12 h-16 rounded-2xl items-center justify-center border`,
                                    isSelected
                                        ? tw`bg-[${COLORS.primary}] border-[${COLORS.primary}]`
                                        : tw`bg-white/5 border-white/5`
                                ]}
                            >
                                <Text style={[tw`text-xs font-bold mb-1`, isSelected ? tw`text-black` : tw`text-slate-500`]}>
                                    {day.slice(0, 3)}
                                </Text>
                                <Text style={[tw`text-lg font-bold`, isSelected ? tw`text-black` : tw`text-white`]}>
                                    {dayInitial}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Tab Toggles */}
            <View style={tw`flex-row mx-6 mb-6 bg-white/5 p-1 rounded-2xl`}>
                <TouchableOpacity
                    onPress={() => setActiveTab('workout')}
                    style={[
                        tw`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl`,
                        activeTab === 'workout' ? tw`bg-slate-700` : tw`bg-transparent`
                    ]}
                >
                    <Dumbbell size={16} color={activeTab === 'workout' ? 'white' : '#64748b'} />
                    <Text style={[tw`font-bold text-sm`, activeTab === 'workout' ? tw`text-white` : tw`text-slate-500`]}>
                        Workout
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setActiveTab('nutrition')}
                    style={[
                        tw`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl`,
                        activeTab === 'nutrition' ? tw`bg-slate-700` : tw`bg-transparent`
                    ]}
                >
                    <Utensils size={16} color={activeTab === 'nutrition' ? 'white' : '#64748b'} />
                    <Text style={[tw`font-bold text-sm`, activeTab === 'nutrition' ? tw`text-white` : tw`text-slate-500`]}>
                        Nutrition
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content Content */}
            <ScrollView contentContainerStyle={tw`px-6 pb-20`} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                {loading ? (
                    <ActivityIndicator color={COLORS.primary} style={tw`mt-10`} />
                ) : activeTab === 'workout' ? (
                    // Workout View
                    <View>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <Text style={tw`text-white font-bold text-xl`}>{selectedDay}'s Routine</Text>
                            <View style={tw`flex-row items-center gap-2`}>
                                {dailyRoutine && dailyRoutine.length > 0 && (
                                    <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: `${COLORS.primary}1A` }]}>
                                        <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
                                            {dailyRoutine.length} Exercises
                                        </Text>
                                    </View>
                                )}
                                {isSolo && dailyRoutine && dailyRoutine.length > 0 && (
                                    <TouchableOpacity
                                        onPress={() => (navigation as any).navigate('EditPlan', {
                                            clientId: user?.uid,
                                            clientName: clientProfile?.name || user?.displayName || 'User',
                                            selectedDay: selectedDay,
                                            isSolo: true,
                                        })}
                                        style={tw`w-8 h-8 bg-white/5 rounded-full items-center justify-center`}
                                    >
                                        <Pencil size={14} color="#64748b" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {dailyRoutine && dailyRoutine.length > 0 ? (
                            <View style={tw`gap-3`}>
                                {dailyRoutine.map((ex, idx) => (
                                    <View key={idx} style={[tw`flex-row items-center gap-4 p-4 rounded-2xl`, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                        <View style={[tw`w-10 h-10 rounded-xl items-center justify-center`, { backgroundColor: `${COLORS.primary}1F` }]}>
                                            <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 14 }}>{idx + 1}</Text>
                                        </View>
                                        <View style={tw`flex-1`}>
                                            <Text style={tw`text-white font-bold text-base mb-1`}>{ex.name}</Text>
                                            <View style={tw`flex-row gap-3`}>
                                                <View style={tw`bg-white/5 px-2 py-1 rounded-lg`}>
                                                    <Text style={tw`text-slate-400 text-xs`}>{ex.sets} Sets</Text>
                                                </View>
                                                <View style={tw`bg-white/5 px-2 py-1 rounded-lg`}>
                                                    <Text style={tw`text-slate-400 text-xs`}>{ex.reps} Reps</Text>
                                                </View>
                                                {ex.weight && (
                                                    <View style={tw`bg-white/5 px-2 py-1 rounded-lg`}>
                                                        <Text style={tw`text-slate-400 text-xs`}>
                                                            {ex.weight}{!isNaN(parseFloat(ex.weight)) && !ex.weight.match(/[a-z]/i) ? (clientProfile?.preferredWeightUnit || 'kg') : ''}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={tw`items-center justify-center py-10 bg-white/5 rounded-3xl border border-white/5 border-dashed`}>
                                <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                                    <Dumbbell size={32} color="#64748b" />
                                </View>
                                <Text style={tw`text-white font-bold text-lg mb-2`}>Rest Day</Text>
                                <Text style={tw`text-slate-500 text-center px-10 mb-4`}>
                                    Take it easy! Rest and recovery are just as important as training.
                                </Text>
                                {isSolo ? (
                                    <TouchableOpacity
                                        onPress={() => (navigation as any).navigate('EditPlan', {
                                            clientId: user?.uid,
                                            clientName: clientProfile?.name || user?.displayName || 'User',
                                            selectedDay: selectedDay,
                                            isSolo: true,
                                        })}
                                        style={tw`flex-row items-center gap-2 px-5 py-2.5 rounded-full border border-[${COLORS.primary}]/40 bg-[${COLORS.primary}]/10`}
                                    >
                                        <Plus size={14} color={COLORS.primary} />
                                        <Text style={tw`text-sm font-bold text-[${COLORS.primary}]`}>Create Workout</Text>
                                    </TouchableOpacity>
                                ) : !!clientProfile?.trainerId && (
                                    <TouchableOpacity
                                        onPress={() => handleRequestPlan(noMeal ? 'both' : 'exercise')}
                                        disabled={requestSent != null || sendingRequest}
                                        style={tw`flex-row items-center gap-2 px-5 py-2.5 rounded-full border ${
                                            requestSent != null
                                                ? 'border-green-500/30 bg-green-500/10'
                                                : 'border-[' + COLORS.primary + ']/40 bg-[' + COLORS.primary + ']/10'
                                        }`}
                                    >
                                        <Bell size={14} color={requestSent != null ? '#22c55e' : COLORS.primary} />
                                        <Text style={tw`text-sm font-bold ${requestSent != null ? 'text-green-400' : 'text-[' + COLORS.primary + ']'}`}>
                                            {sendingRequest ? 'Sending…' : requestSent != null ? 'Request Sent ✓' : noMeal ? 'Ask Coach for Workout & Meal' : 'Ask Coach for Workout'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                ) : (
                    // Nutrition View
                    <View>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <Text style={tw`text-white font-bold text-xl`}>{selectedDay}'s Meals</Text>
                            {isSolo && dailyMeals && (
                                <TouchableOpacity
                                    onPress={() => (navigation as any).navigate('EditPlan', {
                                        clientId: user?.uid,
                                        clientName: clientProfile?.name || user?.displayName || 'User',
                                        selectedDay: selectedDay,
                                        isSolo: true,
                                    })}
                                    style={tw`w-8 h-8 bg-white/5 rounded-full items-center justify-center`}
                                >
                                    <Pencil size={14} color="#64748b" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {dailyMeals ? (
                            <View style={tw`gap-4`}>
                                {[
                                    { emoji: '🌅', label: 'Breakfast', value: dailyMeals.breakfast },
                                    { emoji: '☀️', label: 'Lunch', value: dailyMeals.lunch },
                                    { emoji: '🌙', label: 'Dinner', value: dailyMeals.dinner },
                                    { emoji: '🥜', label: 'Snacks', value: dailyMeals.snacks },
                                ]
                                    .filter(m => m.value)
                                    .map(m => (
                                        <View key={m.label} style={[tw`p-5 rounded-2xl`, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                            <View style={tw`flex-row items-center gap-3 mb-3`}>
                                                <View style={tw`w-10 h-10 bg-orange-500/10 rounded-xl items-center justify-center`}>
                                                    <Text style={tw`text-xl`}>{m.emoji}</Text>
                                                </View>
                                                <Text style={tw`text-orange-400 font-bold uppercase tracking-wider text-sm`}>
                                                    {m.label}
                                                </Text>
                                            </View>
                                            <Text style={tw`text-white text-base leading-6 pl-2 border-l-2 border-white/10 ml-2`}>
                                                {m.value}
                                            </Text>
                                        </View>
                                    ))}
                            </View>
                        ) : (
                            <View style={tw`items-center justify-center py-10 bg-white/5 rounded-3xl border border-white/5 border-dashed`}>
                                <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                                    <Utensils size={32} color="#64748b" />
                                </View>
                                <Text style={tw`text-white font-bold text-lg mb-2`}>No Meal Plan</Text>
                                <Text style={tw`text-slate-500 text-center px-10 mb-4`}>
                                    No specific meals assigned for {selectedDay}. Eat clean!
                                </Text>
                                {isSolo ? (
                                    <TouchableOpacity
                                        onPress={() => (navigation as any).navigate('EditPlan', {
                                            clientId: user?.uid,
                                            clientName: clientProfile?.name || user?.displayName || 'User',
                                            selectedDay: selectedDay,
                                            isSolo: true,
                                        })}
                                        style={tw`flex-row items-center gap-2 px-5 py-2.5 rounded-full border border-orange-500/40 bg-orange-500/10`}
                                    >
                                        <Plus size={14} color="#f97316" />
                                        <Text style={tw`text-sm font-bold text-orange-400`}>Create Meal Plan</Text>
                                    </TouchableOpacity>
                                ) : !!clientProfile?.trainerId && (
                                    <TouchableOpacity
                                        onPress={() => handleRequestPlan(noExercise ? 'both' : 'meal')}
                                        disabled={requestSent != null || sendingRequest}
                                        style={tw`flex-row items-center gap-2 px-5 py-2.5 rounded-full border ${
                                            requestSent != null
                                                ? 'border-green-500/30 bg-green-500/10'
                                                : 'border-orange-500/40 bg-orange-500/10'
                                        }`}
                                    >
                                        <Bell size={14} color={requestSent != null ? '#22c55e' : '#f97316'} />
                                        <Text style={tw`text-sm font-bold ${requestSent != null ? 'text-green-400' : 'text-orange-400'}`}>
                                            {sendingRequest ? 'Sending…' : requestSent != null ? 'Request Sent ✓' : noExercise ? 'Ask Coach for Workout & Meal' : 'Ask Coach for Meal Plan'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
