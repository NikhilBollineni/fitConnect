import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { Users, Dumbbell, ChevronRight, Zap } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

export default function RoleSelectScreen() {
    const { setUserRole, user } = useAuth();
    const [loading, setLoading] = useState(false);

    const handleRoleSelect = async (role: 'trainer' | 'client') => {
        setLoading(true);
        try {
            await setUserRole(role);
            // Navigation happens automatically via AuthContext role change
        } catch (e) {
            Alert.alert('Error', 'Failed to set role. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}] justify-between pt-20 pb-12 px-6`}>

            {/* Branding Section */}
            <View style={tw`items-center`}>
                <View style={tw`w-20 h-20 rounded-3xl bg-[${COLORS.primary}] items-center justify-center mb-6 shadow-lg`}>
                    <Zap size={40} color="black" fill="black" />
                </View>

                <Text style={tw`text-white text-3xl font-bold tracking-tight mb-2`}>
                    Welcome to FitConnect!
                </Text>
                <Text style={tw`text-slate-400 text-base text-center leading-6 px-4`}>
                    Choose how you'd like to use the app.
                </Text>
            </View>

            {/* Role Selection Cards */}
            <View style={tw`gap-4`}>
                <Text style={tw`text-slate-500 text-xs uppercase tracking-widest font-bold text-center mb-2`}>
                    I am a
                </Text>

                {/* Trainer Card */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={loading}
                    onPress={() => handleRoleSelect('trainer')}
                    style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-5 border border-white/5 flex-row items-center`}
                >
                    <View style={tw`w-14 h-14 rounded-xl bg-[${COLORS.primary}]/15 items-center justify-center mr-4`}>
                        <Users size={28} color={COLORS.primary} />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={tw`text-white text-lg font-bold mb-0.5`}>Trainer</Text>
                        <Text style={tw`text-slate-400 text-sm`}>Build plans, track clients</Text>
                    </View>
                    <ChevronRight size={22} color={COLORS.muted} />
                </TouchableOpacity>

                {/* Member Card */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={loading}
                    onPress={() => handleRoleSelect('client')}
                    style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-5 border border-white/5 flex-row items-center`}
                >
                    <View style={tw`w-14 h-14 rounded-xl bg-blue-500/15 items-center justify-center mr-4`}>
                        <Dumbbell size={28} color="#3b82f6" />
                    </View>
                    <View style={tw`flex-1`}>
                        <Text style={tw`text-white text-lg font-bold mb-0.5`}>Member</Text>
                        <Text style={tw`text-slate-400 text-sm`}>Join solo or connect with a coach</Text>
                    </View>
                    <ChevronRight size={22} color={COLORS.muted} />
                </TouchableOpacity>
            </View>

            {/* Footer / Loading */}
            <View style={tw`items-center h-10`}>
                {loading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                    <Text style={tw`text-slate-600 text-xs`}>
                        You can change this later in Settings.
                    </Text>
                )}
            </View>
        </View>
    );
}
