import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, setDoc, deleteDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { User, Users, Check, ArrowRight } from 'lucide-react-native';

export default function MemberSetupScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const [selectedRole, setSelectedRole] = useState<'solo' | 'coach' | null>(null);
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSelectSolo = async () => {
        setSelectedRole('solo');
        // Proceed directly for solo users
        setLoading(true);
        try {
            await updateMemberType('solo');
            // Navigate to MemberTabs
            navigation.reset({
                index: 0,
                routes: [{ name: 'MemberTabs' }],
            });
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Could not setup profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectCoach = () => {
        setSelectedRole('coach');
    };

    const handleRedeemCode = async () => {
        if (!inviteCode.trim() || inviteCode.length < 6) {
            Alert.alert('Invalid Code', 'Please enter a valid 6-character invite code.', [{ text: 'OK' }]);
            return;
        }

        setLoading(true);
        try {
            // 1. Query for the invite code
            // Note: In a real app, you might want a dedicated 'invites' collection vs querying profiles directly
            // dependent on security rules. For MVP, querying clientProfiles is fine.
            const profilesRef = collection(db, 'clientProfiles');
            const q = query(profilesRef, where('inviteCode', '==', inviteCode.toUpperCase()), where('isClaimed', '==', false));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                Alert.alert('Invalid Code', 'This code was not found or has already been used.', [{ text: 'OK' }]);
                setLoading(false);
                return;
            }

            // 2. Claim the profile & Migrate to User UID
            const profileSnapshot = querySnapshot.docs[0];
            const profileData = profileSnapshot.data();

            // The trainer created a doc with an Auto-ID.
            // But our app expects the profile doc ID to match the Auth UID (user.uid).
            // So we COPY the data to doc(user.uid) and DELETE the old auto-ID doc.

            if (user?.uid) {


                await setDoc(doc(db, 'clientProfiles', user.uid), {
                    ...profileData,
                    id: user.uid,        // Ensure ID field matches doc ID
                    userId: user.uid,    // explicit field
                    role: 'client',      // Explicitly set role
                    trainerId: profileData.trainerId, // Ensure connection
                    isClaimed: true,
                    status: 'active',
                    claimedAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });

                // Delete the old temporary doc
                await deleteDoc(profileSnapshot.ref);
            } else {
                throw new Error("User ID missing during activation");
            }

            Alert.alert('Success! 🎉', `Welcome, ${profileData.name}! You have successfully connected with your coach.`, [
                {
                    text: "Let's Go!",
                    onPress: () => {
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'MemberTabs' }],
                        });
                    }
                }
            ]);

        } catch (error) {
            console.error("Error redeeming code:", error);
            Alert.alert('Connection Error', 'Failed to connect. Please check your internet and try again.', [{ text: 'OK' }]);
        } finally {
            setLoading(false);
        }
    };

    const updateMemberType = async (type: 'solo' | 'coached') => {
        if (!user?.uid) return;
        const clientRef = doc(db, 'clientProfiles', user.uid);
        await setDoc(clientRef, {
            type,
            onboarded: true,
            updatedAt: Timestamp.now(),
        }, { merge: true });
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={tw`flex-1`}
            >
                <ScrollView contentContainerStyle={tw`flex-grow p-6 justify-center`}>

                    <View style={tw`mb-10`}>
                        <Text style={tw`text-white text-3xl font-bold mb-3`}>How do you train?</Text>
                        <Text style={tw`text-slate-400 text-base`}>
                            Choose how you want to use FitConnect. You can change this later.
                        </Text>
                    </View>

                    <View style={tw`gap-4`}>
                        {/* Option 1: Valid Coach */}
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={handleSelectCoach}
                            style={[
                                tw`p-6 rounded-2xl border-2`,
                                selectedRole === 'coach'
                                    ? tw`bg-[${COLORS.primary}]/10 border-[${COLORS.primary}]`
                                    : tw`bg-[${COLORS.backgroundLight}] border-transparent`
                            ]}
                        >
                            <View style={tw`flex-row items-center justify-between mb-2`}>
                                <Users size={32} color={selectedRole === 'coach' ? COLORS.primary : '#94a3b8'} />
                                {selectedRole === 'coach' && <Check size={20} color={COLORS.primary} />}
                            </View>
                            <Text style={[
                                tw`text-lg font-bold mb-1`,
                                selectedRole === 'coach' ? tw`text-white` : tw`text-slate-300`
                            ]}>
                                I have a Coach
                            </Text>
                            <Text style={tw`text-slate-500`}>
                                I have an invite code from my trainer.
                            </Text>

                            {selectedRole === 'coach' && (
                                <View style={tw`mt-4 pt-4 border-t border-white/10`}>
                                    <View style={tw`flex-row gap-2`}>
                                        <TextInput
                                            style={tw`flex-1 bg-black/30 text-white p-4 rounded-xl border border-white/10 font-bold tracking-widest text-center uppercase`}
                                            placeholder="ENTER CODE"
                                            placeholderTextColor="#64748b"
                                            value={inviteCode}
                                            onChangeText={setInviteCode}
                                            maxLength={6}
                                            autoCapitalize="characters"
                                        />
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleRedeemCode}
                                        disabled={loading}
                                        style={tw`bg-[${COLORS.primary}] p-4 rounded-xl items-center mt-3`}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="black" />
                                        ) : (
                                            <Text style={tw`text-black font-bold`}>Connect & Continue</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </TouchableOpacity>

                        {/* Option 2: Solo */}
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={handleSelectSolo}
                            style={[
                                tw`p-6 rounded-2xl border-2`,
                                selectedRole === 'solo'
                                    ? tw`bg-[${COLORS.primary}]/10 border-[${COLORS.primary}]`
                                    : tw`bg-[${COLORS.backgroundLight}] border-transparent`
                            ]}
                        >
                            <View style={tw`flex-row items-center justify-between mb-2`}>
                                <User size={32} color={selectedRole === 'solo' ? COLORS.primary : '#94a3b8'} />
                                {loading && selectedRole === 'solo' && <ActivityIndicator color={COLORS.primary} />}
                            </View>
                            <Text style={[
                                tw`text-lg font-bold mb-1`,
                                selectedRole === 'solo' ? tw`text-white` : tw`text-slate-300`
                            ]}>
                                I'm Training Solo
                            </Text>
                            <Text style={tw`text-slate-500`}>
                                I want to track my own workouts and progress.
                            </Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
