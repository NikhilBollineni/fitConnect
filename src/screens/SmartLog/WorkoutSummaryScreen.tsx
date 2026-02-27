import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, Platform, ScrollView, Animated } from 'react-native';
import tw from 'twrnc';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../../constants/theme';
import { Share2, Home, CheckCircle2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

// Fun Unit Comparisons
const FUN_UNITS = [
    { name: 'Baby Elephant', weight: 100, icon: '🐘' },
    { name: 'Grand Piano', weight: 500, icon: '🎹' },
    { name: 'Your Car', weight: 1500, icon: '🚗' },
    { name: 'Islands Hippo', weight: 2000, icon: '🦛' },
    { name: 'T-Rex', weight: 8000, icon: '🦖' },
    { name: 'Space Shuttle', weight: 75000, icon: '🚀' },
];

export default function WorkoutSummaryScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { workoutData } = route.params || {};

    const [totalVolume, setTotalVolume] = useState(0);
    const [funComparison, setFunComparison] = useState(FUN_UNITS[0]);
    const [scaleAnim] = useState(new Animated.Value(0.5));

    useEffect(() => {
        if (workoutData) {
            // Calculate Volume
            let volume = 0;
            workoutData.exercises?.forEach((ex: any) => {
                ex.sets?.forEach((set: any) => {
                    if (set.completed && set.actualWeight && set.actualReps) {
                        volume += (parseFloat(set.actualWeight) * parseFloat(set.actualReps));
                    }
                });
            });
            setTotalVolume(volume);

            // Find Fun Unit
            // Reverse sort to find the largest unit smaller than volume
            const unit = FUN_UNITS.slice().reverse().find(u => volume >= u.weight) || FUN_UNITS[0];
            setFunComparison(unit);

            // Animation
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 5,
                useNativeDriver: true,
            }).start();

            // Haptic Success
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    }, [workoutData]);

    const handleShare = async () => {
        // In a real app, use ViewShot to capture and share
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        alert('Sharing Image Generated!');
    };

    const handleHome = () => {
        navigation.navigate('MemberTabs', { screen: 'Home' });
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}] pt-12 px-6 pb-8 justify-between`}>
            <View style={tw`items-center mt-10`}>
                <Text style={tw`text-slate-400 text-sm font-bold uppercase tracking-widest mb-2`}>SESSION COMPLETE</Text>
                <Text style={tw`text-white text-3xl font-black text-center mb-10`}>{workoutData?.title || "Workout"}</Text>

                {/* The "Hippo" Card */}
                <Animated.View style={[
                    tw`bg-white/5 w-full aspect-square rounded-[3rem] items-center justify-center border border-white/10 relative overflow-hidden`,
                    { transform: [{ scale: scaleAnim }] }
                ]}>
                    <View style={tw`absolute inset-0 bg-[${COLORS.primary}]/5`} />

                    <Text style={tw`text-8xl mb-4`}>{funComparison.icon}</Text>

                    <View style={tw`items-center`}>
                        <Text style={tw`text-slate-400 font-bold uppercase text-xs mb-1`}>TOTAL VOLUME</Text>
                        <Text style={tw`text-white text-5xl font-black`}>{totalVolume.toLocaleString()}kg</Text>
                        <Text style={tw`text-[${COLORS.primary}] font-bold text-lg mt-4`}>
                            That's like lifting a {funComparison.name}!
                        </Text>
                    </View>
                </Animated.View>
            </View>

            {/* Actions */}
            <View style={tw`gap-4`}>
                <TouchableOpacity
                    onPress={handleShare}
                    style={tw`w-full bg-white/10 h-16 rounded-2xl flex-row items-center justify-center gap-3 border border-white/5`}
                >
                    <Share2 size={24} color="white" />
                    <Text style={tw`text-white font-bold text-lg`}>Share Achievement</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleHome}
                    style={tw`w-full bg-[${COLORS.primary}] h-16 rounded-2xl flex-row items-center justify-center gap-3 shadow-lg shadow-[${COLORS.primary}]/20`}
                >
                    <Home size={24} color="black" />
                    <Text style={tw`text-black font-black text-lg uppercase tracking-wide`}>Back to Home</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
