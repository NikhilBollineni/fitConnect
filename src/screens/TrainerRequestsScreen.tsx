import React, { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    RefreshControl, Alert
} from 'react-native';
import tw from 'twrnc';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import {
    ArrowLeft, CheckCircle, XCircle, Clock,
    Dumbbell, MessageCircle, Loader
} from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

// ------------------------------------------------------------------
// TrainerRequestsScreen — Client views incoming coaching requests
//                         and can accept / decline them
// ------------------------------------------------------------------
export default function TrainerRequestsScreen() {
    const navigation = useNavigation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);

    const { user } = useAuth();
    const userId = user?.uid ?? '';

    // ---- Fetch requests for this client ----
    const fetchRequests = async () => {
        if (!userId) return;
        try {
            // Server-side filtered query
            const q = query(collection(db, 'trainerRequests'), where('clientId', '==', userId));
            const snapshot = await getDocs(q);
            const data = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a: any, b: any) => {
                    const aT = a.createdAt?.toMillis?.() || 0;
                    const bT = b.createdAt?.toMillis?.() || 0;
                    return bT - aT;
                });
            setRequests(data);
        } catch (e) {
            console.error('Error fetching requests:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchRequests(); }, []));
    const onRefresh = () => { setRefreshing(true); fetchRequests(); };

    // ---- Handle accept / decline ----
    const handleAction = async (requestId, action) => {
        setUpdatingId(requestId);
        try {
            await updateDoc(doc(db, 'trainerRequests', requestId), {
                status: action,
                respondedAt: Timestamp.now(),
            });
            setRequests(prev =>
                prev.map(r => r.id === requestId ? { ...r, status: action } : r)
            );
            Alert.alert(
                action === 'accepted' ? 'Trainer Accepted! 🎉' : 'Request Declined',
                action === 'accepted'
                    ? 'Great! Your new trainer will be in touch soon.'
                    : 'The request has been declined.',
            );
        } catch (e) {
            console.error('Error updating request:', e);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setUpdatingId(null);
        }
    };

    // ---- Status badge ----
    const StatusBadge = ({ status }) => {
        const config = {
            pending: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Pending', Icon: Clock },
            accepted: { bg: `bg-[${COLORS.primary}]/15`, text: `text-[${COLORS.primary}]`, label: 'Accepted', Icon: CheckCircle },
            declined: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Declined', Icon: XCircle },
        };
        const c = config[status] || config.pending;
        return (
            <View style={tw`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${c.bg}`}>
                <c.Icon size={12} color={status === 'accepted' ? COLORS.primary : status === 'declined' ? '#f87171' : '#fbbf24'} />
                <Text style={tw`${c.text} text-xs font-bold`}>{c.label}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={tw`flex-1 bg-[${COLORS.background}]`} edges={['top']}>
            <View style={tw`flex-1 pt-4`}>
                {/* Header */}
                <View style={tw`px-6 pb-4 border-b border-white/5 flex-row items-center justify-center`}>
                    <Text style={tw`text-white font-bold text-lg`}>Trainer Requests</Text>
                </View>

                <ScrollView
                    style={tw`flex-1`}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                >
                    {loading ? (
                        <View style={tw`items-center py-20`}>
                            <Text style={tw`text-slate-400`}>Loading requests...</Text>
                        </View>
                    ) : requests.length === 0 ? (
                        <View style={tw`items-center py-20 px-6`}>
                            <MessageCircle size={48} color={COLORS.muted} />
                            <Text style={tw`text-white font-bold text-lg mt-4`}>No Requests Yet</Text>
                            <Text style={tw`text-slate-400 text-sm mt-2 text-center leading-5`}>
                                When trainers send you coaching requests, they'll appear here.
                            </Text>
                        </View>
                    ) : (
                        <View style={tw`px-5 pt-4`}>
                            {/* Pending requests first */}
                            {requests.filter(r => r.status === 'pending').length > 0 && (
                                <Text style={tw`text-slate-500 text-xs font-bold mb-3`}>
                                    PENDING ({requests.filter(r => r.status === 'pending').length})
                                </Text>
                            )}

                            {requests.map(req => {
                                const isPending = req.status === 'pending';
                                const isUpdating = updatingId === req.id;

                                return (
                                    <View
                                        key={req.id}
                                        style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3`}
                                    >
                                        {/* Trainer Info */}
                                        <View style={tw`flex-row items-center justify-between mb-3`}>
                                            <View style={tw`flex-row items-center flex-1`}>
                                                <View style={tw`w-12 h-12 rounded-full bg-blue-500/15 items-center justify-center mr-3`}>
                                                    <Dumbbell size={20} color="#3b82f6" />
                                                </View>
                                                <View style={tw`flex-1`}>
                                                    <Text style={tw`text-white font-bold text-base`}>{req.trainerName || 'Trainer'}</Text>
                                                    <Text style={tw`text-slate-400 text-xs mt-0.5`}>
                                                        {req.createdAt?.toDate?.()
                                                            ? new Date(req.createdAt.toDate()).toLocaleDateString('en-US', {
                                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                            })
                                                            : 'Recently'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <StatusBadge status={req.status} />
                                        </View>

                                        {/* Message */}
                                        {req.message ? (
                                            <View style={tw`bg-white/5 rounded-xl p-3 mb-3`}>
                                                <Text style={tw`text-slate-300 text-sm leading-5`}>{req.message}</Text>
                                            </View>
                                        ) : null}

                                        {/* Action Buttons (only for pending) */}
                                        {isPending && (
                                            <View style={tw`flex-row gap-3`}>
                                                <TouchableOpacity
                                                    onPress={() => handleAction(req.id, 'declined')}
                                                    disabled={isUpdating}
                                                    style={tw`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10`}
                                                >
                                                    <XCircle size={16} color="#94a3b8" />
                                                    <Text style={tw`text-slate-300 font-bold text-sm`}>Decline</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleAction(req.id, 'accepted')}
                                                    disabled={isUpdating}
                                                    style={tw`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-[${COLORS.primary}]`}
                                                >
                                                    {isUpdating ? (
                                                        <Loader size={16} color="black" />
                                                    ) : (
                                                        <CheckCircle size={16} color="black" />
                                                    )}
                                                    <Text style={tw`text-black font-bold text-sm`}>Accept</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}
