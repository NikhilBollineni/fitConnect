import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, RefreshControl } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, TrendingUp, Calendar, Zap, ChevronRight, CheckCircle2, DollarSign, UserPlus, MessageSquare, Crown } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
const DEMO_EMAIL = 'nikhilbollineni11@gmail.com';

export default function TrainerDashboard() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const { isProSubscriber, clientLimit } = useSubscription();
    const [stats, setStats] = useState({
        activeClients: 0,
        revenue: 0,
        pendingReviews: 0,
        completedWorkouts: 0 // "Check-ins"
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        if (!user?.uid) return;

        try {
            setLoading(true);

            // 1. Fetch Clients (from clientProfiles)
            const clientsQuery = query(
                collection(db, 'clientProfiles'),
                where('trainerId', '==', user.uid)
            );
            const clientDocs = await getDocs(clientsQuery);
            const activeClientsCount = clientDocs.docs.filter(d => {
                const status = d.data().status;
                return status === 'active' || status === 'pending_claim';
            }).length;

            // 2. Fetch Recent Logs for Check-ins & Reviews
            // We fetch the last 20 logs for this trainer to calculate weekly stats
            const logsQuery = query(
                collection(db, 'workoutLogs'),
                where('trainerId', '==', user.uid),
                orderBy('createdAt', 'desc'),
                limit(20)
            );

            let checkInsCount = 0;
            let pendingReviewsCount = 0;

            try {
                const logsSnap = await getDocs(logsQuery);
                const now = new Date();
                const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

                logsSnap.forEach(doc => {
                    const data = doc.data();
                    const createdAt = data.createdAt?.toDate();

                    // Check-ins (Logs from last 7 days)
                    if (createdAt && createdAt >= oneWeekAgo) {
                        checkInsCount++;
                    }

                    // Reviews Due (Logs not yet reviewed)
                    // Assuming 'reviewed' field exists, defaulting to false if missing
                    if (!data.reviewed) {
                        pendingReviewsCount++;
                    }
                });
            } catch (e) {
                console.log("Error fetching logs:", e);
            }



            // INJECT MOCK STATS FOR DEMO USER
            if (user.email === DEMO_EMAIL) {
                setStats({
                    activeClients: activeClientsCount + 6, // 6 mock clients
                    revenue: 0,
                    pendingReviews: pendingReviewsCount + 2, // 2 fake reviews
                    completedWorkouts: checkInsCount + 15 // Fake check-ins
                });
            } else {
                setStats({
                    activeClients: activeClientsCount,
                    revenue: 0, // Removed revenue calculation
                    pendingReviews: pendingReviewsCount,
                    completedWorkouts: checkInsCount
                });
            }

        } catch (error) {
            console.error("Error fetching dashboard:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.uid]);

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [fetchData])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    return (
        <SafeAreaView style={tw`flex-1 bg-[${COLORS.background}]`} edges={['top']}>
            <View style={tw`flex-1 px-6 pt-4`}>
                {/* Header */}
                <View style={tw`flex-row justify-between items-center mb-8`}>
                    <View>
                        <Text style={tw`text-[${COLORS.primary}] text-xs uppercase font-bold tracking-wider mb-1`}>
                            Coach Mode
                        </Text>
                        <Text style={tw`text-white text-3xl font-bold`}>Overview</Text>
                    </View>
                    <View style={tw`flex-row items-center gap-3`}>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('TrainerProfile')}
                            style={tw`w-12 h-12 rounded-full overflow-hidden border-2 border-[${COLORS.primary}]`}
                        >
                            <View style={tw`w-full h-full bg-[${COLORS.primary}]/20 items-center justify-center`}>
                                <Text style={tw`text-[${COLORS.primary}] font-bold text-lg`}>
                                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'T'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                >
                    {/* Stats Row */}
                    <View style={tw`flex-row gap-3 mb-6`}>
                        {/* Total Clients */}
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                            <Users size={20} color={COLORS.primary} />
                            <Text style={tw`text-white text-2xl font-bold mt-2`}>{stats.activeClients}</Text>
                            <Text style={tw`text-slate-400 text-xs`}>Total Clients</Text>
                        </View>

                        {/* Check-ins */}
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                            <CheckCircle2 size={20} color="#3b82f6" />
                            <Text style={tw`text-white text-2xl font-bold mt-2`}>{stats.completedWorkouts}</Text>
                            <Text style={tw`text-slate-400 text-xs`}>Check-ins (Wk)</Text>
                        </View>

                        {/* Reviews */}
                        <View style={tw`flex-1 bg-[${COLORS.backgroundLight}] p-4 rounded-2xl border border-white/5`}>
                            <MessageSquare size={20} color="#fb923c" />
                            <Text style={tw`text-white text-2xl font-bold mt-2`}>{stats.pendingReviews}</Text>
                            <Text style={tw`text-slate-400 text-xs`}>Reviews Due</Text>
                        </View>
                    </View>

                    {/* Pending Actions Section */}
                    {stats.pendingReviews > 0 && (
                        <TouchableOpacity
                            onPress={() => navigation.navigate('TrainerReviews')}
                            style={tw`bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 mb-6 flex-row items-center justify-between`}
                        >
                            <View style={tw`flex-row items-center gap-3`}>
                                <View style={tw`w-10 h-10 bg-orange-500 rounded-full items-center justify-center`}>
                                    <Text style={tw`text-white font-bold`}>{stats.pendingReviews}</Text>
                                </View>
                                <View>
                                    <Text style={tw`text-white font-bold text-base`}>Workouts to Review</Text>
                                    <Text style={tw`text-slate-400 text-xs`}>Give feedback to your clients</Text>
                                </View>
                            </View>
                            <ChevronRight size={20} color="#fb923c" />
                        </TouchableOpacity>
                    )}

                    {/* Upgrade Banner */}
                    {!isProSubscriber && stats.activeClients >= clientLimit && (
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Paywall')}
                            style={tw`bg-[${COLORS.primary}]/10 border border-[${COLORS.primary}]/20 rounded-2xl p-4 mb-6 flex-row items-center justify-between`}
                        >
                            <View style={tw`flex-row items-center gap-3 flex-1`}>
                                <View style={tw`w-10 h-10 bg-[${COLORS.primary}] rounded-full items-center justify-center`}>
                                    <Crown size={20} color="black" />
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={tw`text-white font-bold text-sm`}>Client Limit Reached</Text>
                                    <Text style={tw`text-slate-400 text-xs mt-0.5`}>Upgrade to Pro for up to 10 clients</Text>
                                </View>
                            </View>
                            <ChevronRight size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                    )}

                    {/* Quick Actions Header */}
                    <Text style={tw`text-white text-lg font-bold mb-4`}>Quick Actions</Text>

                    {/* Add Client Action */}
                    <TouchableOpacity
                        onPress={() => {
                            if (!isProSubscriber && stats.activeClients >= clientLimit) {
                                navigation.navigate('Paywall');
                            } else {
                                navigation.navigate('AddClient');
                            }
                        }}
                        style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3 flex-row items-center`}
                    >
                        <View style={tw`w-10 h-10 rounded-full bg-green-500/15 items-center justify-center mr-4`}>
                            <UserPlus size={20} color="#22c55e" />
                        </View>
                        <View style={tw`flex-1`}>
                            <Text style={tw`text-white font-bold text-sm`}>Add New Client</Text>
                            <Text style={tw`text-slate-400 text-xs mt-0.5`}>Grow your business</Text>
                        </View>
                        <ChevronRight size={18} color="#64748b" />
                    </TouchableOpacity>

                    {/* Broadcast Message Action */}
                    <TouchableOpacity
                        onPress={() => navigation.navigate('Messages')}
                        style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3 flex-row items-center`}
                    >
                        <View style={tw`w-10 h-10 rounded-full bg-blue-500/15 items-center justify-center mr-4`}>
                            <MessageSquare size={20} color="#3b82f6" />
                        </View>
                        <View style={tw`flex-1`}>
                            <Text style={tw`text-white font-bold text-sm`}>Broadcast Message</Text>
                            <Text style={tw`text-slate-400 text-xs mt-0.5`}>Send announcement to all clients</Text>
                        </View>
                        <ChevronRight size={18} color="#64748b" />
                    </TouchableOpacity>

                </ScrollView>
            </View>
        </SafeAreaView >
    );
}
