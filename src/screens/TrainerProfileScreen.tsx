import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import tw from 'twrnc';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import { ArrowLeft, Save, Loader, LogOut, Award, Briefcase, MapPin, Crown } from 'lucide-react-native';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

// ------------------------------------------------------------------
// TrainerProfileScreen — Manage trainer profile & credentials
// ------------------------------------------------------------------
export default function TrainerProfileScreen() {
    const navigation = useNavigation<any>();
    const { logOut, user } = useAuth();
    const { isProSubscriber } = useSubscription();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Profile Data
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [location, setLocation] = useState('');
    const [yearsExperience, setYearsExperience] = useState('');
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [certifications, setCertifications] = useState('');

    const SPECIALTIES = [
        'Strength', 'Weight Loss', 'Bodybuilding',
        'CrossFit', 'HIIT', 'Yoga', 'Rehab', 'Sports'
    ];

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        if (!user) { setLoading(false); return; }
        try {
            const docRef = doc(db, 'trainerProfiles', user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setName(data.name || user.displayName || '');
                setBio(data.bio || '');
                setLocation(data.location || '');
                setYearsExperience(data.yearsExperience ? String(data.yearsExperience) : '');
                // Support both new array format and legacy single string
                if (Array.isArray(data.specialties) && data.specialties.length > 0) {
                    setSpecialties(data.specialties);
                } else if (data.specialty) {
                    // Legacy: single specialty string — migrate to array
                    setSpecialties(data.specialty.includes(',')
                        ? data.specialty.split(',').map((s: string) => s.trim()).filter(Boolean)
                        : [data.specialty.trim()]
                    );
                }
                setCertifications(data.certifications || '');
            } else {
                // Pre-fill name from auth
                setName(user.displayName || '');
            }
        } catch (error) {
            console.error('Error fetching trainer profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Missing Name', 'Please enter your name.');
            return;
        }
        if (!user) return;

        setSaving(true);
        try {
            await setDoc(doc(db, 'trainerProfiles', user.uid), {
                name: name.trim(),
                bio: bio.trim(),
                location: location.trim(),
                yearsExperience: parseInt(yearsExperience) || 0,
                specialties: specialties,
                specialty: specialties.join(', '), // Backward compatibility
                certifications: certifications.trim(),
                email: user.email,
                updatedAt: Timestamp.now(),
            }, { merge: true });

            Alert.alert('Profile Saved', 'Your trainer profile has been updated.');
        } catch (error) {
            console.error('Error saving trainer profile:', error);
            Alert.alert('Error', 'Failed to save profile.');
        } finally {
            setSaving(false);
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
                <Text style={tw`text-white font-bold text-lg`}>Coach Profile</Text>
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

                    {/* Profile Avatar Section */}
                    <View style={tw`items-center mb-8`}>
                        <View style={tw`w-24 h-24 rounded-full bg-[${COLORS.primary}]/20 border-2 border-[${COLORS.primary}] items-center justify-center mb-3`}>
                            <Text style={tw`text-[${COLORS.primary}] text-3xl font-bold`}>
                                {name ? name.charAt(0).toUpperCase() : '?'}
                            </Text>
                        </View>
                        <Text style={tw`text-white text-xl font-bold`}>{name || 'Your Name'}</Text>
                        {user?.email && (
                            <Text style={tw`text-slate-400 text-sm mt-1`}>{user.email}</Text>
                        )}
                    </View>

                    {/* Quick Stats */}
                    <View style={tw`flex-row gap-3 mb-8`}>
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5 items-center`}>
                            <Briefcase size={18} color={COLORS.primary} />
                            <Text style={tw`text-white text-lg font-bold mt-1`}>{yearsExperience || '0'}</Text>
                            <Text style={tw`text-slate-400 text-[10px]`}>Years Exp</Text>
                        </View>
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5 items-center`}>
                            <Award size={18} color="#f59e0b" />
                            <Text style={tw`text-white text-lg font-bold mt-1`}>{certifications ? certifications.split(',').length : '0'}</Text>
                            <Text style={tw`text-slate-400 text-[10px]`}>Certs</Text>
                        </View>
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5 items-center`}>
                            <MapPin size={18} color="#3b82f6" />
                            <Text style={tw`text-white text-lg font-bold mt-1 text-center text-xs`}>{location || '—'}</Text>
                            <Text style={tw`text-slate-400 text-[10px]`}>Location</Text>
                        </View>
                    </View>

                    {/* Profile Fields */}
                    <Text style={tw`text-slate-500 text-xs font-bold mb-4 uppercase tracking-wider`}>Personal Info</Text>

                    <View style={tw`gap-4 mb-6`}>
                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>FULL NAME</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                placeholder="e.g. Coach Mike"
                                placeholderTextColor="#555"
                                value={name}
                                onChangeText={setName}
                            />
                        </View>

                        <View style={tw`flex-row gap-3`}>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>YEARS EXPERIENCE</Text>
                                <TextInput
                                    style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                    placeholder="5"
                                    placeholderTextColor="#555"
                                    keyboardType="numeric"
                                    value={yearsExperience}
                                    onChangeText={setYearsExperience}
                                />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>LOCATION</Text>
                                <TextInput
                                    style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                    placeholder="City, State"
                                    placeholderTextColor="#555"
                                    value={location}
                                    onChangeText={setLocation}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Professional Info */}
                    <Text style={tw`text-slate-500 text-xs font-bold mb-4 uppercase tracking-wider`}>Professional Details</Text>

                    <View style={tw`gap-4 mb-6`}>
                        <View>
                            <View style={tw`flex-row items-center justify-between mb-2`}>
                                <Text style={tw`text-slate-400 text-xs font-bold`}>SPECIALTIES</Text>
                                <Text style={tw`text-slate-500 text-[10px]`}>{specialties.length}/5 selected</Text>
                            </View>
                            <View style={tw`flex-row flex-wrap gap-2`}>
                                {SPECIALTIES.map(spec => {
                                    const isSelected = specialties.includes(spec);
                                    const isMaxReached = specialties.length >= 5 && !isSelected;
                                    return (
                                        <TouchableOpacity
                                            key={spec}
                                            onPress={() => {
                                                if (isSelected) {
                                                    setSpecialties(prev => prev.filter(s => s !== spec));
                                                } else if (!isMaxReached) {
                                                    setSpecialties(prev => [...prev, spec]);
                                                } else {
                                                    Alert.alert('Limit Reached', 'You can select up to 5 specialties.');
                                                }
                                            }}
                                            style={tw`px-4 py-3 rounded-lg border ${isSelected
                                                ? `bg-[${COLORS.primary}]/20 border-[${COLORS.primary}]`
                                                : isMaxReached
                                                    ? 'bg-white/5 border-transparent opacity-40'
                                                    : 'bg-white/5 border-transparent'
                                                }`}
                                        >
                                            <Text style={tw`text-xs font-bold ${isSelected
                                                ? `text-[${COLORS.primary}]`
                                                : 'text-slate-400'
                                                }`}>
                                                {isSelected ? `✓ ${spec}` : spec}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>CERTIFICATIONS</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold`}
                                placeholder="e.g. NASM, ACE, CSCS"
                                placeholderTextColor="#555"
                                value={certifications}
                                onChangeText={setCertifications}
                            />
                            <Text style={tw`text-slate-500 text-[10px] mt-1`}>Separate multiple with commas</Text>
                        </View>

                        <View>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-1.5`}>BIO</Text>
                            <TextInput
                                style={tw`bg-white/5 text-white px-4 py-3 rounded-xl font-semibold h-28`}
                                placeholder="Tell clients about your coaching style, experience, and what makes you unique..."
                                placeholderTextColor="#555"
                                multiline
                                textAlignVertical="top"
                                value={bio}
                                onChangeText={setBio}
                            />
                        </View>
                    </View>

                    {/* Subscription Section */}
                    <View style={tw`mt-6`}>
                        <Text style={tw`text-slate-500 text-xs font-bold mb-3 uppercase tracking-wider`}>Subscription</Text>
                        <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5`}>
                            <View style={tw`flex-row items-center justify-between`}>
                                <View style={tw`flex-row items-center gap-3`}>
                                    <View style={tw`w-10 h-10 rounded-full ${isProSubscriber ? `bg-[${COLORS.primary}]/15` : 'bg-white/5'} items-center justify-center`}>
                                        <Crown size={20} color={isProSubscriber ? COLORS.primary : '#64748b'} />
                                    </View>
                                    <View>
                                        <Text style={tw`text-white font-bold`}>
                                            {isProSubscriber ? 'Pro Plan' : 'Free Plan'}
                                        </Text>
                                        <Text style={tw`text-slate-400 text-xs mt-0.5`}>
                                            {isProSubscriber ? 'Up to 10 clients' : 'Up to 2 clients'}
                                        </Text>
                                    </View>
                                </View>
                                {!isProSubscriber && (
                                    <TouchableOpacity
                                        onPress={() => navigation.navigate('Paywall')}
                                        style={tw`px-4 py-2 rounded-full bg-[${COLORS.primary}]`}
                                    >
                                        <Text style={tw`text-black font-bold text-xs`}>Upgrade</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Logout Section */}
                    <View style={tw`mt-4 mb-8`}>
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
                                style={tw`flex-row items-center justify-center gap-2 bg-red-500/10 py-4 rounded-2xl border border-red-500/20`}
                            >
                                <LogOut size={18} color="#ef4444" />
                                <Text style={tw`text-red-400 font-bold text-base`}>Log Out</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
