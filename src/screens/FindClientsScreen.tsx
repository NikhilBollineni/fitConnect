import React, { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, FlatList,
    TextInput, RefreshControl, Alert
} from 'react-native';
import tw from 'twrnc';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import {
    ArrowLeft, Search, Send, Target, MapPin,
    User, Loader, CheckCircle
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, Timestamp, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

// ------------------------------------------------------------------
// FindClientsScreen — Trainer browses available clients & sends
//                     coaching requests
// ------------------------------------------------------------------
export default function FindClientsScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const { isProSubscriber, clientLimit } = useSubscription();
    const trainerId = user?.uid ?? '';
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sentRequests, setSentRequests] = useState(new Set());
    const [sendingTo, setSendingTo] = useState(null);

    // ---- Fetch all client profiles ----
    const fetchClients = async () => {
        try {
            // Get all visible clients (in production you'd paginate / filter server-side)
            const snapshot = await getDocs(collection(db, 'clientProfiles'));
            const data = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(client => client.isVisibleToTrainers === true) // Filter by visibility
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setClients(data);

            // Also fetch already-sent requests so we can mark them
            const reqSnapshot = await getDocs(collection(db, 'trainerRequests'));
            const myRequests = reqSnapshot.docs
                .map(d => d.data())
                .filter(r => r.trainerId === trainerId);
            setSentRequests(new Set(myRequests.map(r => r.clientId)));
        } catch (e) {
            console.error('Error fetching clients:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchClients(); }, []));
    const onRefresh = () => { setRefreshing(true); fetchClients(); };

    // ---- Send coaching request ----
    const sendRequest = async (client) => {
        // Check subscription limit before sending request
        if (!isProSubscriber) {
            const q = query(collection(db, 'clientProfiles'), where('trainerId', '==', trainerId));
            const snap = await getDocs(q);
            const activeCount = snap.docs.filter(d => {
                const status = d.data().status;
                return status === 'active' || status === 'pending_claim';
            }).length;
            if (activeCount >= clientLimit) {
                navigation.navigate('Paywall');
                return;
            }
        }

        setSendingTo(client.id);
        try {
            await addDoc(collection(db, 'trainerRequests'), {
                trainerId: trainerId,
                trainerName: user?.displayName || 'Coach',
                clientId: client.id,
                clientName: client.name,
                status: 'pending',
                message: `Hi ${client.name}! I'd love to be your fitness coach. Let's crush your ${client.goal || 'fitness'} goals together 💪`,
                createdAt: Timestamp.now(),
            });
            setSentRequests(prev => new Set([...prev, client.id]));
            Alert.alert('Request Sent! 🎉', `Your coaching request has been sent to ${client.name}.`);
        } catch (e) {
            console.error('Error sending request:', e);
            Alert.alert('Error', 'Failed to send request. Try again.');
        } finally {
            setSendingTo(null);
        }
    };

    // ---- Filtered list ----
    const filtered = clients.filter(c =>
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.goal || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ---- Goal color helper ----
    const goalColor = (goal) => {
        const g = (goal || '').toLowerCase();
        if (g.includes('loss')) return '#f43f5e';
        if (g.includes('gain') || g.includes('muscle')) return '#3b82f6';
        if (g.includes('strength')) return '#fb923c';
        if (g.includes('endurance')) return '#8b5cf6';
        return COLORS.primary;
    };

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header */}
            <View style={tw`pt-12 px-6 pb-4 border-b border-white/5`}>
                <View style={tw`flex-row items-center justify-between mb-4`}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tw`w-10 h-10 items-center justify-center rounded-full bg-white/5`}>
                        <ArrowLeft size={22} color="white" />
                    </TouchableOpacity>
                    <Text style={tw`text-white font-bold text-lg`}>Find Clients</Text>
                    <View style={tw`w-10`} />
                </View>

                {/* Search Bar */}
                <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3`}>
                    <Search size={18} color={COLORS.muted} />
                    <TextInput
                        style={tw`flex-1 text-white ml-3 text-sm font-semibold`}
                        placeholder="Search by name or goal..."
                        placeholderTextColor="#555"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {loading ? (
                <View style={tw`items-center py-20`}>
                    <Text style={tw`text-slate-400`}>Loading clients...</Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    style={tw`flex-1`}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                    removeClippedSubviews={true}
                    ListHeaderComponent={
                        <Text style={tw`text-slate-500 text-xs font-bold mb-3`}>
                            {filtered.length} CLIENT{filtered.length !== 1 ? 'S' : ''} FOUND
                        </Text>
                    }
                    ListHeaderComponentStyle={tw`px-5 pt-4`}
                    ListEmptyComponent={
                        <View style={tw`items-center py-20 px-6`}>
                            <User size={48} color={COLORS.muted} />
                            <Text style={tw`text-slate-400 text-base mt-4 text-center`}>
                                {searchQuery ? 'No clients match your search.' : 'No client profiles found.\nClients need to create profiles first.'}
                            </Text>
                        </View>
                    }
                    renderItem={({ item: client }) => {
                        const alreadySent = sentRequests.has(client.id);
                        const isSending = sendingTo === client.id;

                        return (
                            <View
                                style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3 mx-5`}
                            >
                                {/* Top: Avatar + Info */}
                                <View style={tw`flex-row items-center mb-3`}>
                                    <View style={tw`w-14 h-14 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center mr-4`}>
                                        <Text style={tw`text-[${COLORS.primary}] font-bold text-xl`}>
                                            {(client.name || '?').charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={tw`flex-1`}>
                                        <Text style={tw`text-white font-bold text-base`}>{client.name || 'Unknown'}</Text>
                                        <View style={tw`flex-row items-center gap-3 mt-1`}>
                                            {client.age ? (
                                                <Text style={tw`text-slate-400 text-xs`}>{client.age} yrs</Text>
                                            ) : null}
                                            {client.location ? (
                                                <View style={tw`flex-row items-center gap-1`}>
                                                    <MapPin size={10} color={COLORS.muted} />
                                                    <Text style={tw`text-slate-400 text-xs`}>{client.location}</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </View>
                                </View>

                                {/* Goal Badge + Stats */}
                                <View style={tw`flex-row items-center gap-2 mb-3`}>
                                    {client.goal ? (
                                        <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: `${goalColor(client.goal)}20` }]}>
                                            <Text style={[tw`text-xs font-bold`, { color: goalColor(client.goal) }]}>
                                                {client.goal}
                                            </Text>
                                        </View>
                                    ) : null}
                                    {client.experience ? (
                                        <View style={tw`px-3 py-1 rounded-full bg-white/5`}>
                                            <Text style={tw`text-slate-400 text-xs font-bold`}>{client.experience}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                {/* Bio */}
                                {client.bio ? (
                                    <Text style={tw`text-slate-400 text-xs mb-3 leading-4`}>{client.bio}</Text>
                                ) : null}

                                {/* Action Button */}
                                {alreadySent ? (
                                    <View style={tw`flex-row items-center justify-center gap-2 py-3 rounded-xl bg-white/5`}>
                                        <CheckCircle size={16} color={COLORS.primary} />
                                        <Text style={tw`text-[${COLORS.primary}] font-bold text-sm`}>Request Sent</Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        onPress={() => sendRequest(client)}
                                        disabled={isSending}
                                        style={tw`flex-row items-center justify-center gap-2 py-3 rounded-xl bg-[${COLORS.primary}]`}
                                    >
                                        {isSending ? (
                                            <Loader size={16} color="black" />
                                        ) : (
                                            <Send size={16} color="black" />
                                        )}
                                        <Text style={tw`text-black font-bold text-sm`}>
                                            {isSending ? 'Sending...' : 'Send Coaching Request'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    }}
                />
            )}
        </View>
    );
}
