import React, { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    TextInput, Switch, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import tw from 'twrnc';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import { ArrowLeft, Save, User, Loader, Database, Link, ChevronRight, LogOut, MessageSquare, Calendar, Pencil, Check } from 'lucide-react-native';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, writeBatch, query, where, getDocs, updateDoc, deleteDoc, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { seedMockData } from '../utils/mockData';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import DatePickerModal from '../components/DatePickerModal';
import { sendJourneyDateMessage } from '../utils/journeyDate';

// ------------------------------------------------------------------
// ClientProfileScreen — Manage profile & visibility settings
// ------------------------------------------------------------------
export default function ClientProfileScreen() {
    const navigation = useNavigation<any>();
    const { logOut, user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [seeding, setSeeding] = useState(false);

    // Redeem Code State
    const [inviteCode, setInviteCode] = useState('');
    const [redeeming, setRedeeming] = useState(false);
    const [showRedeemInput, setShowRedeemInput] = useState(false);

    // Profile Data
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [weight, setWeight] = useState('');
    const [bio, setBio] = useState('');
    const [location, setLocation] = useState('');
    const [goal, setGoal] = useState('');
    const [experience, setExperience] = useState('Beginner');

    // Trainer Integration
    const [trainerData, setTrainerData] = useState<{ name: string; email: string; specialty?: string; bio?: string } | null>(null);
    const [currentTrainerId, setCurrentTrainerId] = useState<string | null>(null);

    // Privacy & Settings
    const [isVisible, setIsVisible] = useState(false);
    const [weightUnit, setWeightUnit] = useState('lbs');

    // Journey Date
    const [journeyDate, setJourneyDate] = useState<Date | null>(null);
    const [pendingJourney, setPendingJourney] = useState<Date | null>(null);
    const [journeyStatus, setJourneyStatus] = useState<string>('none');
    const [showJourneyPicker, setShowJourneyPicker] = useState(false);

    const CLIENT_ID = user?.uid ?? '';

    useFocusEffect(
        useCallback(() => {
            fetchProfile();
        }, [])
    );

    const fetchProfile = async () => {
        if (!CLIENT_ID) {
            setLoading(false);
            return;
        }
        try {
            const docRef = doc(db, 'clientProfiles', CLIENT_ID);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setName(data.name || '');
                setAge(data.age ? String(data.age) : '');
                setWeight(data.weight ? String(data.weight) : '');
                setBio(data.bio || '');
                setLocation(data.location || '');
                setGoal(data.goal || '');
                setExperience(data.experience || 'Beginner');
                setIsVisible(data.isVisibleToTrainers || false);
                setWeightUnit(data.preferredWeightUnit || 'lbs');

                // Journey date
                setJourneyDate(data.journeyStartDate?.toDate?.() || null);
                setPendingJourney(data.pendingJourneyDate?.toDate?.() || null);
                setJourneyStatus(data.journeyDateStatus || 'none');

                // Link Trainer
                const tId = data.trainerId || null;

                setCurrentTrainerId(tId);

                if (tId) {
                    // Step 1: Try dedicated trainerProfiles collection
                    const trainerDoc = await getDoc(doc(db, 'trainerProfiles', tId));
                    if (trainerDoc.exists()) {
                        const tData = trainerDoc.data();

                        setTrainerData({
                            name: tData.name || 'Coach',
                            email: tData.email || '',
                            specialty: tData.specialty || '',
                            bio: tData.bio || ''
                        });
                    } else {
                        // Step 2: Fallback to clientProfiles (all users have a base profile here)

                        const fallbackDoc = await getDoc(doc(db, 'clientProfiles', tId));
                        if (fallbackDoc.exists()) {
                            const fData = fallbackDoc.data();

                            setTrainerData({
                                name: fData.name || fData.displayName || 'Coach',
                                email: fData.email || '',
                                specialty: fData.specialty || '',
                                bio: fData.bio || ''
                            });
                        } else {
                            console.warn('[ClientProfile] No trainer profile found in either collection for ID:', tId);
                            setTrainerData(null);
                        }
                    }
                } else {
                    setTrainerData(null);

                }
            } else {
                console.warn('[ClientProfile] Client profile doc does not exist for:', CLIENT_ID);
            }
        } catch (error) {
            console.error('[ClientProfile] Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMessageCoach = async () => {
        if (!currentTrainerId || !user) return;
        try {
            const q = query(
                collection(db, 'chats'),
                where('participants', 'array-contains', user.uid)
            );
            const snapshot = await getDocs(q);
            let targetChatId = null;

            for (const d of snapshot.docs) {
                const p = d.data().participants || [];
                if (p.includes(currentTrainerId)) {
                    targetChatId = d.id;
                    break;
                }
            }

            if (!targetChatId) {
                const newChat = await addDoc(collection(db, 'chats'), {
                    participants: [user.uid, currentTrainerId],
                    participantNames: {
                        [user.uid]: name || 'Client',
                        [currentTrainerId]: trainerData?.name || 'Coach'
                    },
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    lastMessage: 'Chat started',
                    unreadCount: { [user.uid]: 0, [currentTrainerId]: 0 }
                });
                targetChatId = newChat.id;
            }

            navigation.navigate('Chat', {
                chatId: targetChatId,
                title: trainerData?.name || 'Coach',
            });

        } catch (error) {
            console.error("Chat Error", error);
            Alert.alert("Error", "Could not start chat.");
        }
    };


    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Missing Name', 'Please enter your name.');
            return;
        }

        setSaving(true);
        try {
            await setDoc(doc(db, 'clientProfiles', CLIENT_ID), {
                name: name.trim(),
                age: parseInt(age) || 0,
                weight: parseFloat(weight) || 0,
                bio: bio.trim(),
                location: location.trim(),
                goal: goal.trim(),
                experience,
                isVisibleToTrainers: isVisible,
                preferredWeightUnit: weightUnit,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            Alert.alert('Profile Saved', 'Your profile has been updated successfully.');
        } catch (error) {
            console.error('Error saving profile:', error);
            Alert.alert('Error', 'Failed to save profile.');
        } finally {
            setSaving(false);
        }
    };

    // ---- REDEEM CODE FUNCTION ----
    const handleRedeemCode = async () => {
        if (!inviteCode.trim() || inviteCode.length < 6) {
            Alert.alert('Invalid Code', 'Please enter a valid 6-character code.');
            return;
        }

        setRedeeming(true);
        try {
            // 1. Find the profile with this invite code
            const normalizedCode = inviteCode.trim().toUpperCase();

            const q = query(
                collection(db, 'clientProfiles'),
                where('inviteCode', '==', normalizedCode),
                where('isClaimed', '==', false),
                limit(1)
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                Alert.alert('Invalid Code', 'Code not found or already claimed.');
                return;
            }

            const inviteProfileDoc = snapshot.docs[0];
            const inviteData = inviteProfileDoc.data();


            if (!inviteData.trainerId) {
                Alert.alert('Error', 'This code is not linked to any trainer.');
                return;
            }

            // 2. Prepare updates for the Current User (CLIENT_ID) 
            // We want to adopt the plan, trainer, and potentially goal from the invite
            const updatesForCurrentUser = {
                trainerId: inviteData.trainerId,
                goal: inviteData.goal || goal, // Prefer invite goal if exists, else keep current
                dietPlan: inviteData.dietPlan || null,
                exercisePlan: inviteData.exercisePlan || null,
                isVisibleToTrainers: true, // Auto-enable visibility so trainer can see them
                updatedAt: serverTimestamp(),
            };

            // 3. Mark the invite profile as claimed (and by whom)
            // We do NOT delete it yet to keep a record, but in a real app we might merge/delete.
            const updatesForInviteProfile = {
                isClaimed: true,
                claimedAt: serverTimestamp(),
                claimedBy: CLIENT_ID, // Track who claimed it
                status: 'claimed'
            };

            const batch = writeBatch(db);

            // Update Current User
            const currentUserRef = doc(db, 'clientProfiles', CLIENT_ID);
            batch.set(currentUserRef, updatesForCurrentUser, { merge: true });

            // Update Invite Profile
            const inviteRef = doc(db, 'clientProfiles', inviteProfileDoc.id);
            batch.update(inviteRef, updatesForInviteProfile);

            await batch.commit();

            // 4. Client-side state update
            await fetchProfile(); // Refresh to see "My Coach" card

            Alert.alert(
                'Connected! 🎉',
                `You have successfully connected with your trainer.\n\nPlan imported: ${inviteData.goal || 'Custom Plan'}`,
                [{
                    text: 'Great!', onPress: () => {
                        setShowRedeemInput(false);
                        setInviteCode('');
                    }
                }]
            );
        } catch (error) {
            console.error('Redeem error:', error);
            Alert.alert('Error', 'Failed to redeem code. Please try again.');
        } finally {
            setRedeeming(false);
        }
    };



    if (loading) {
        return (
            <View style={tw`flex-1 bg-[${COLORS.background}] items-center justify-center`}>
                <Loader size={24} color={COLORS.primary} />
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
                <Text style={tw`text-white font-bold text-lg`}>My Profile</Text>
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    style={tw`px-4 py-2 rounded-full bg-[${COLORS.primary}] flex-row items-center gap-1.5`}
                >
                    {saving ? <Loader size={16} color="black" /> : <Save size={16} color="black" />}
                    <Text style={tw`text-black font-bold text-sm`}>Save</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tw`flex-1`}>
                <ScrollView contentContainerStyle={{ padding: 20 }}>



                    {/* Trainer Connection Section */}
                    {currentTrainerId ? (
                        <View style={tw`bg-[${COLORS.primary}]/10 p-5 rounded-2xl border border-[${COLORS.primary}]/20 mb-6`}>
                            {/* Header Row */}
                            <View style={tw`flex-row items-center gap-4 mb-4`}>
                                <View style={tw`w-14 h-14 rounded-full bg-[${COLORS.primary}]/20 items-center justify-center border border-[${COLORS.primary}]/30`}>
                                    <Text style={tw`text-[${COLORS.primary}] text-xl font-bold`}>
                                        {trainerData?.name ? trainerData.name.charAt(0).toUpperCase() : '?'}
                                    </Text>
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={tw`text-[${COLORS.primary}] text-xs font-bold uppercase tracking-wider mb-0.5`}>My Coach</Text>
                                    <Text style={tw`text-white font-bold text-lg`}>{trainerData?.name || 'Loading...'}</Text>
                                    {trainerData?.specialty && (
                                        <Text style={tw`text-slate-400 text-xs`}>{trainerData.specialty} Specialist</Text>
                                    )}
                                </View>
                            </View>

                            {/* Bio / Description */}
                            {trainerData?.bio && (
                                <Text style={tw`text-slate-400 text-sm leading-5 mb-4 italic`}>
                                    "{trainerData.bio.length > 80 ? trainerData.bio.substring(0, 80) + '...' : trainerData.bio}"
                                </Text>
                            )}

                            {/* Action Buttons */}
                            <View style={tw`flex-row gap-3`}>
                                <TouchableOpacity
                                    onPress={handleMessageCoach}
                                    style={tw`flex-1 bg-[${COLORS.primary}] py-3 rounded-xl flex-row items-center justify-center gap-2`}
                                >
                                    <MessageSquare size={18} color="black" />
                                    <Text style={tw`text-black font-bold text-sm`}>Message Coach</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={tw`mt-4 pt-4 border-t border-[${COLORS.primary}]/10 flex-row items-center justify-between`}>
                                <View>
                                    <Text style={tw`text-[${COLORS.primary}] text-xs font-bold`}>
                                        ✓ Account Linked
                                    </Text>
                                    <Text style={tw`text-slate-500 text-[10px] mt-0.5`}>
                                        Coach manages your plan & visibility
                                    </Text>
                                </View>
                            </View>

                            {/* Journey Start Date */}
                            <View style={tw`mt-4 pt-4 border-t border-[${COLORS.primary}]/10`}>
                                <View style={tw`flex-row items-center justify-between`}>
                                    <View style={tw`flex-row items-center gap-2`}>
                                        <Calendar size={16} color="#c084fc" />
                                        <Text style={tw`text-slate-400 text-xs font-bold uppercase`}>Journey Start Date</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setShowJourneyPicker(true)}
                                        style={tw`flex-row items-center gap-1 px-2 py-1 rounded-full bg-white/5`}
                                    >
                                        <Pencil size={10} color="#c084fc" />
                                        <Text style={tw`text-purple-400 text-[10px] font-bold`}>Edit</Text>
                                    </TouchableOpacity>
                                </View>
                                {journeyStatus === 'confirmed' && journeyDate ? (
                                    <Text style={tw`text-white font-bold text-sm mt-1.5`}>
                                        {format(journeyDate, 'MMMM d, yyyy')}
                                    </Text>
                                ) : journeyStatus === 'pending' && pendingJourney ? (
                                    <View style={tw`mt-1.5`}>
                                        <Text style={tw`text-amber-400 text-xs font-bold`}>
                                            Pending: {format(pendingJourney, 'MMMM d, yyyy')}
                                        </Text>
                                        <View style={tw`flex-row gap-2 mt-2`}>
                                            <TouchableOpacity
                                                onPress={async () => {
                                                    try {
                                                        await updateDoc(doc(db, 'clientProfiles', CLIENT_ID), {
                                                            journeyStartDate: Timestamp.fromDate(pendingJourney),
                                                            pendingJourneyDate: null,
                                                            journeyDateStatus: 'confirmed',
                                                        });
                                                        if (currentTrainerId && user) {
                                                            await sendJourneyDateMessage(
                                                                { uid: CLIENT_ID, displayName: user.displayName },
                                                                currentTrainerId, pendingJourney, CLIENT_ID,
                                                                name || 'Client', 'client'
                                                            );
                                                        }
                                                        setJourneyDate(pendingJourney);
                                                        setPendingJourney(null);
                                                        setJourneyStatus('confirmed');
                                                        Alert.alert('Confirmed!', 'Journey start date accepted.');
                                                    } catch (e) { Alert.alert('Error', 'Could not confirm.'); }
                                                }}
                                                style={tw`flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-[${COLORS.primary}]`}
                                            >
                                                <Check size={12} color="black" />
                                                <Text style={tw`text-black text-xs font-bold`}>Accept</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => setShowJourneyPicker(true)}
                                                style={tw`flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10`}
                                            >
                                                <Pencil size={10} color="#c084fc" />
                                                <Text style={tw`text-purple-400 text-xs font-bold`}>Edit</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : (
                                    <Text style={tw`text-slate-500 text-xs mt-1.5`}>Not set yet</Text>
                                )}
                            </View>
                        </View>
                    ) : (
                        <>
                            {/* Redeem Code Section (Only if NO trainer) */}
                            <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-6`}>
                                <View style={tw`flex-row justify-between items-center mb-2`}>
                                    <View style={tw`flex-row items-center gap-3`}>
                                        <View style={tw`w-10 h-10 rounded-full bg-[${COLORS.primary}]/20 items-center justify-center`}>
                                            <Link size={20} color={COLORS.primary} />
                                        </View>
                                        <View>
                                            <Text style={tw`text-white font-bold text-base`}>Have a Trainer Code?</Text>
                                            <Text style={tw`text-slate-400 text-xs`}>Link account to a coach</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setShowRedeemInput(!showRedeemInput)}
                                        style={tw`px-3 py-1.5 rounded-full bg-white/5`}
                                    >
                                        <Text style={tw`text-[${COLORS.primary}] text-xs font-bold`}>{showRedeemInput ? 'Cancel' : 'Enter Code'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {showRedeemInput && (
                                    <View style={tw`flex-row gap-2 mt-2`}>
                                        <TextInput
                                            style={tw`flex-1 bg-white/5 text-white px-4 py-2 rounded-xl font-bold text-center tracking-widest`}
                                            placeholder="ABC-123"
                                            placeholderTextColor="#555"
                                            autoCapitalize="characters"
                                            maxLength={6}
                                            value={inviteCode}
                                            onChangeText={setInviteCode}
                                        />
                                        <TouchableOpacity
                                            onPress={handleRedeemCode}
                                            disabled={redeeming}
                                            style={tw`bg-[${COLORS.primary}] px-4 py-2 rounded-xl items-center justify-center`}
                                        >
                                            <Text style={tw`text-black font-bold text-xs`}>{redeeming ? '...' : 'Claim'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            {/* Privacy Settings Card (Only if NO trainer) */}
                            <View style={tw`bg-[${COLORS.backgroundLight}] p-5 rounded-2xl border border-white/5 mb-6`}>
                                <View style={tw`flex-row justify-between items-start mb-2`}>
                                    <View style={tw`flex-1 mr-4`}>
                                        <Text style={tw`text-white font-bold text-base mb-1`}>Allow Trainers to Find Me</Text>
                                        <Text style={tw`text-slate-400 text-xs leading-5`}>
                                            If enabled, your profile will be visible to trainers in the marketplace, and they can send you coaching requests.
                                        </Text>
                                    </View>
                                    <Switch
                                        value={isVisible}
                                        onValueChange={setIsVisible}
                                        trackColor={{ false: '#334155', true: COLORS.primary }}
                                        thumbColor={isVisible ? 'white' : '#94a3b8'}
                                    />
                                </View>
                                <Text style={tw`text-xs font-bold mt-2 ${isVisible ? 'text-green-400' : 'text-slate-500'}`}>
                                    Currently: {isVisible ? 'VISIBLE ✅' : 'HIDDEN 🔒'}
                                </Text>
                            </View>
                        </>
                    )}

                    {/* Weight Unit Settings Card */}
                    <View style={tw`bg-[${COLORS.backgroundLight}] p-5 rounded-2xl border border-white/5 mb-6`}>
                        <Text style={tw`text-white font-bold text-base mb-1`}>Weight Units</Text>
                        <Text style={tw`text-slate-400 text-xs mb-4`}>Choose your preferred weight measurement system.</Text>

                        <View style={tw`flex-row bg-black/20 p-1 rounded-xl`}>
                            {['lbs', 'kg'].map((u) => (
                                <TouchableOpacity
                                    key={u}
                                    onPress={() => setWeightUnit(u)}
                                    style={tw`flex-1 py-3 rounded-lg items-center ${weightUnit === u ? `bg-[${COLORS.primary}] shadow-lg` : ''
                                        }`}
                                >
                                    <View style={tw`flex-row items-center gap-2`}>
                                        <Text style={tw`font-black uppercase tracking-widest text-sm ${weightUnit === u ? 'text-black' : 'text-slate-500'
                                            }`}>
                                            {u}
                                        </Text>
                                        {weightUnit === u && <View style={tw`w-1.5 h-1.5 rounded-full bg-black/30`} />}
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Profile Fields */}
                    <Text style={tw`text-slate-500 text-xs font-bold mb-4 uppercase tracking-wider`}>Profile Details</Text>

                    <View style={tw`gap-4`}>
                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>FULL NAME</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                placeholder="e.g. John Doe"
                                placeholderTextColor="#555"
                                value={name}
                                onChangeText={setName}
                            />
                        </View>

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
                                <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>WEIGHT ({weightUnit})</Text>
                                <TextInput
                                    style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                    placeholder="0"
                                    placeholderTextColor="#555"
                                    keyboardType="numeric"
                                    value={weight}
                                    onChangeText={setWeight}
                                />
                            </View>
                        </View>

                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>LOCATION</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                placeholder="City, State"
                                placeholderTextColor="#555"
                                value={location}
                                onChangeText={setLocation}
                            />
                        </View>

                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>FITNESS GOAL</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                placeholder="e.g. Weight Loss, Muscle Gain"
                                placeholderTextColor="#555"
                                value={goal}
                                onChangeText={setGoal}
                            />
                        </View>

                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>EXPERIENCE LEVEL</Text>
                            <View style={tw`flex-row gap-2`}>
                                {['Beginner', 'Intermediate', 'Advanced'].map(exp => (
                                    <TouchableOpacity
                                        key={exp}
                                        onPress={() => setExperience(exp)}
                                        style={tw`px-3 py-2 rounded-lg border ${experience === exp ? `bg-[${COLORS.primary}]/20 border-[${COLORS.primary}]` : 'bg-white/5 border-transparent'
                                            }`}
                                    >
                                        <Text style={tw`text-xs font-bold ${experience === exp ? `text-[${COLORS.primary}]` : 'text-slate-400'}`}>
                                            {exp}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>BIO / NOTES</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold h-24`}
                                placeholder="Tell trainers about yourself..."
                                placeholderTextColor="#555"
                                multiline
                                textAlignVertical="top"
                                value={bio}
                                onChangeText={setBio}
                            />
                        </View>
                    </View>

                    {/* Logout Section */}
                    <View style={tw`mt-8 mb-8`}>
                        <View style={tw`border-t border-white/5 pt-6`}>
                            {user?.email && (
                                <Text style={tw`text-slate-500 text-xs text-center mb-4`}>
                                    Signed in as {user.email}
                                </Text>
                            )}
                            <TouchableOpacity
                                onPress={() => {
                                    Alert.alert(
                                        'Log Out',
                                        'Are you sure you want to log out?',
                                        [
                                            { text: 'Cancel', style: 'cancel' },
                                            {
                                                text: 'Log Out',
                                                style: 'destructive',
                                                onPress: async () => {
                                                    try {
                                                        await logOut();
                                                    } catch (e) {
                                                        Alert.alert('Error', 'Failed to log out.');
                                                    }
                                                },
                                            },
                                        ]
                                    );
                                }}
                                style={tw`flex-row items-center justify-center gap-2 bg-white/5 py-4 rounded-2xl border border-white/10 mb-4`}
                            >
                                <LogOut size={18} color="white" />
                                <Text style={tw`text-white font-bold text-base`}>Log Out</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => {
                                    Alert.alert(
                                        'Delete Account',
                                        'This action is PERMANENT. All your data, logs, and profile will be wiped forever.\n\nAre you sure?',
                                        [
                                            { text: 'Cancel', style: 'cancel' },
                                            {
                                                text: 'Delete Forever',
                                                style: 'destructive',
                                                onPress: async () => {
                                                    try {
                                                        setLoading(true);
                                                        // 1. Delete Firestore Data (Best effort from client)
                                                        await deleteDoc(doc(db, 'clientProfiles', CLIENT_ID));

                                                        // 2. Delete Auth Account
                                                        await user.delete();
                                                        // Note: If requires recent login, this might fail. 
                                                        // Ideally re-authenticate flow is needed but for MVP this often works if session is fresh.
                                                    } catch (e: any) {
                                                        console.error("Delete Error:", e);
                                                        if (e.code === 'auth/requires-recent-login') {
                                                            Alert.alert('Security Check', 'Please log out and log back in to verify identity before deleting.');
                                                        } else {
                                                            Alert.alert('Error', 'Failed to delete account. Please contact support.');
                                                        }
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                },
                                            },
                                        ]
                                    );
                                }}
                                style={tw`flex-row items-center justify-center gap-2 bg-red-500/10 py-4 rounded-2xl border border-red-500/20`}
                            >
                                <Text style={tw`text-red-500 font-bold text-base`}>Delete Account</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Journey Date Picker Modal */}
            <DatePickerModal
                visible={showJourneyPicker}
                onClose={() => setShowJourneyPicker(false)}
                onSelect={async (date) => {
                    try {
                        await updateDoc(doc(db, 'clientProfiles', CLIENT_ID), {
                            journeyStartDate: Timestamp.fromDate(date),
                            pendingJourneyDate: null,
                            journeyDateStatus: 'confirmed',
                        });
                        // Notify trainer
                        if (currentTrainerId && user) {
                            await sendJourneyDateMessage(
                                { uid: CLIENT_ID, displayName: user.displayName },
                                currentTrainerId, date, CLIENT_ID,
                                name || 'Client', 'client'
                            );
                        }
                        setJourneyDate(date);
                        setPendingJourney(null);
                        setJourneyStatus('confirmed');
                        Alert.alert('Updated!', `Journey start date set to ${format(date, 'MMMM d, yyyy')}.`);
                    } catch (e) {
                        Alert.alert('Error', 'Could not update date.');
                    }
                }}
                initialDate={journeyDate || pendingJourney || new Date()}
                title="Edit Journey Start Date"
                maxDate={new Date()}
            />
        </View>
    );
}
