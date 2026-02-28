import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, RefreshControl, Platform } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Plus, Filter, ChevronRight, Activity, Clock, MoreVertical, ArrowDownAZ, ArrowUpAZ, AlertCircle, X } from 'lucide-react-native';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const DEMO_EMAIL = 'nikhilbollineni11@gmail.com';
const MOCK_CLIENTS = [
    { id: 'mock1', name: 'Aarav Patel', status: 'active', plan: 'Hypertrophy Phase 1', lastActive: '2h ago', lastSession: 'Chest & Tri', compliance: 92 },
    { id: 'mock2', name: 'Emily Chen', status: 'active', plan: 'Strength Foundation', lastActive: '5h ago', lastSession: 'Leg Day', compliance: 88 },
    { id: 'mock3', name: 'Marcus Johnson', status: 'active', plan: 'Summer Cut', lastActive: '1d ago', lastSession: 'Cardio & Abs', compliance: 75 },
    { id: 'mock4', name: 'Priya Sharma', status: 'active', plan: 'Post-Partum Recovery', lastActive: '3d ago', lastSession: 'Full Body', compliance: 95 },
    { id: 'mock5', name: 'David Kim', status: 'inactive', plan: 'Powerlifting Prep', lastActive: '2w ago', lastSession: 'Deadlift Day', compliance: 40 },
    { id: 'mock6', name: 'Sarah Jenkins', status: 'active', plan: 'Marathon Training', lastActive: '6h ago', lastSession: 'Long Run', compliance: 82 },
];

export default function TrainerClientsScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'needs-review'>('all');
    const [sortOrder, setSortOrder] = useState<'default' | 'a-z' | 'z-a'>('default');
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const fetchClients = useCallback(async () => {
        if (!user?.uid) return;
        setError(null);
        setLoading(true);
        try {
            // 1. Fetch Clients (from clientProfiles)
            const clientsQuery = query(
                collection(db, 'clientProfiles'),
                where('trainerId', '==', user.uid)
            );

            const clientDocs = await getDocs(clientsQuery);
            const clientsList = await Promise.all(clientDocs.docs.map(async (docSnap) => {
                const data = docSnap.data();

                // Fetch latest plan
                const plansQuery = query(
                    collection(db, 'plans'),
                    where('clientId', '==', docSnap.id),
                    orderBy('createdAt', 'desc'),
                    limit(1),
                );

                let planName = 'No Plan Assigned';
                try {
                    const planSnaps = await getDocs(plansQuery);
                    if (!planSnaps.empty) {
                        planName = planSnaps.docs[0].data().name || 'Custom Plan';
                    }
                } catch (e) {
                    console.log('Error fetching plan:', e);
                }

                return {
                    id: docSnap.id,
                    ...data,
                    plan: planName,
                    status: data.status || 'active',
                    compliance: 0,
                    lastActive: 'Unknown',
                    lastSession: 'None',
                };
            }));



            // Fetch unreviewed workout logs for all clients
            const clientIds = clientsList.map(c => c.id);
            const unreviewedMap: Record<string, Date> = {};
            for (let i = 0; i < clientIds.length; i += 30) {
                const batch = clientIds.slice(i, i + 30);
                try {
                    const logsQuery = query(
                        collection(db, 'workoutLogs'),
                        where('clientId', 'in', batch),
                        where('status', '==', 'completed'),
                        limit(500),
                    );
                    const logsSnap = await getDocs(logsQuery);
                    logsSnap.docs.forEach(d => {
                        const data = d.data();
                        if (!data.reviewed) {
                            const createdAt = data.createdAt?.toDate?.() || new Date();
                            // Keep the earliest unreviewed workout date per client
                            if (!unreviewedMap[data.clientId] || createdAt < unreviewedMap[data.clientId]) {
                                unreviewedMap[data.clientId] = createdAt;
                            }
                        }
                    });
                } catch (e) {
                    console.log('Error fetching unreviewed logs batch:', e);
                }
            }

            // Attach review status to each client
            clientsList.forEach((c: any) => {
                c.hasUnreviewedWorkout = !!unreviewedMap[c.id];
                c.earliestUnreviewedAt = unreviewedMap[c.id] || null;
            });

            // INJECT MOCK DATA FOR DEMO USER
            if (user.email === DEMO_EMAIL) {
                const mockData = MOCK_CLIENTS.map(mc => ({
                    ...mc,
                    compliance: 85,
                    hasUnreviewedWorkout: mc.id === 'mock1' || mc.id === 'mock2' || mc.id === 'mock4',
                    earliestUnreviewedAt: mc.id === 'mock4' ? new Date(Date.now() - 72 * 3600000)
                        : mc.id === 'mock1' ? new Date(Date.now() - 2 * 3600000)
                        : mc.id === 'mock2' ? new Date(Date.now() - 5 * 3600000)
                        : null,
                }));
                setClients([...clientsList, ...mockData]);
            } else {
                setClients(clientsList);
            }
        } catch (error) {
            console.error("Error fetching clients:", error);
            setError('Failed to load clients.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.uid]);

    useFocusEffect(
        useCallback(() => {
            fetchClients();
        }, [fetchClients])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchClients();
    };

    const filteredClients = clients
        .filter(client => {
            const matchesSearch = client.name?.toLowerCase().includes(searchQuery.toLowerCase());
            if (filter === 'needs-review') return matchesSearch && client.hasUnreviewedWorkout;
            if (filter === 'active' || filter === 'inactive') return matchesSearch && client.status === filter;
            return matchesSearch; // 'all'
        })
        .sort((a, b) => {
            // "Needs Review" filter: sort by earliest unreviewed workout (oldest first)
            if (filter === 'needs-review') {
                const dateA = a.earliestUnreviewedAt ? a.earliestUnreviewedAt.getTime() : Infinity;
                const dateB = b.earliestUnreviewedAt ? b.earliestUnreviewedAt.getTime() : Infinity;
                return dateA - dateB;
            }
            if (sortOrder === 'a-z') return (a.name || '').localeCompare(b.name || '');
            if (sortOrder === 'z-a') return (b.name || '').localeCompare(a.name || '');
            return 0; // default order
        });

    const activeFilterCount = (filter !== 'all' ? 1 : 0) + (sortOrder !== 'default' ? 1 : 0);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return '#22c55e';
            case 'inactive': return '#ef4444';
            default: return '#94a3b8';
        }
    };

    return (
        <SafeAreaView style={tw`flex-1 bg-[${COLORS.background}]`} edges={['top']}>
            <View style={tw`flex-1 px-6 pt-4`}>
                {/* Header */}
                <View style={tw`flex-row justify-between items-center mb-6`}>
                    <View>
                        <Text style={tw`text-[${COLORS.primary}] text-xs uppercase font-bold tracking-wider mb-1`}>
                            Management
                        </Text>
                        <Text style={tw`text-white text-3xl font-bold`}>Clients</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('AddClient')}
                        style={tw`w-12 h-12 rounded-full bg-[${COLORS.primary}] items-center justify-center shadow-lg`}
                    >
                        <Plus size={24} color="#000" />
                    </TouchableOpacity>
                </View>

                {/* Search & Filter */}
                <View style={tw`flex-row gap-3 mb-4`}>
                    <View style={tw`flex-1 flex-row items-center bg-[${COLORS.backgroundLight}] rounded-xl px-4 border border-white/5 h-12`}>
                        <Search size={20} color="#94a3b8" />
                        <TextInput
                            placeholder="Search clients..."
                            placeholderTextColor="#94a3b8"
                            style={tw`flex-1 text-white ml-3 font-medium`}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                    </View>
                    <TouchableOpacity
                        onPress={() => setShowFilterPanel(!showFilterPanel)}
                        style={tw`w-12 h-12 rounded-xl items-center justify-center border ${showFilterPanel || activeFilterCount > 0 ? `bg-[${COLORS.primary}]/15 border-[${COLORS.primary}]/30` : `bg-[${COLORS.backgroundLight}] border-white/5`}`}
                    >
                        <Filter size={20} color={activeFilterCount > 0 ? COLORS.primary : '#94a3b8'} />
                        {activeFilterCount > 0 && (
                            <View style={tw`absolute -top-1 -right-1 w-4.5 h-4.5 bg-[${COLORS.primary}] rounded-full items-center justify-center`}>
                                <Text style={tw`text-black text-[9px] font-black`}>{activeFilterCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Filter Panel */}
                {showFilterPanel && (
                    <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl border border-white/5 p-4 mb-4`}>
                        {/* Sort Section */}
                        <View style={tw`mb-4`}>
                            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2.5`}>Sort By</Text>
                            <View style={tw`flex-row gap-2`}>
                                {([
                                    { key: 'default', label: 'Default', icon: null },
                                    { key: 'a-z', label: 'A → Z', icon: ArrowDownAZ },
                                    { key: 'z-a', label: 'Z → A', icon: ArrowUpAZ },
                                ] as const).map(opt => {
                                    const isActive = sortOrder === opt.key;
                                    return (
                                        <TouchableOpacity
                                            key={opt.key}
                                            onPress={() => setSortOrder(opt.key)}
                                            style={tw`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl border ${isActive ? `bg-[${COLORS.primary}]/15 border-[${COLORS.primary}]/30` : 'bg-white/5 border-white/5'}`}
                                        >
                                            {opt.icon && <opt.icon size={13} color={isActive ? COLORS.primary : '#64748b'} />}
                                            <Text style={tw`text-xs font-bold ${isActive ? `text-[${COLORS.primary}]` : 'text-slate-400'}`}>{opt.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Filter Section */}
                        <View>
                            <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2.5`}>Filter</Text>
                            <View style={tw`flex-row flex-wrap gap-2`}>
                                {([
                                    { key: 'all', label: 'All Clients', color: COLORS.primary },
                                    { key: 'active', label: 'Active', color: '#22c55e' },
                                    { key: 'inactive', label: 'Inactive', color: '#ef4444' },
                                    { key: 'needs-review', label: 'Needs Review', color: '#f97316' },
                                ] as const).map(opt => {
                                    const isActive = filter === opt.key;
                                    return (
                                        <TouchableOpacity
                                            key={opt.key}
                                            onPress={() => setFilter(opt.key)}
                                            style={tw`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl border ${isActive ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5'}`}
                                        >
                                            <View style={[tw`w-2 h-2 rounded-full`, { backgroundColor: opt.color }]} />
                                            <Text style={tw`text-xs font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>{opt.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Clear All */}
                        {activeFilterCount > 0 && (
                            <TouchableOpacity
                                onPress={() => { setFilter('all'); setSortOrder('default'); }}
                                style={tw`flex-row items-center justify-center gap-1.5 mt-4 pt-3 border-t border-white/5`}
                            >
                                <X size={12} color="#ef4444" />
                                <Text style={tw`text-red-400 text-xs font-bold`}>Clear All Filters</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Error Banner */}
                {error && !loading && (
                    <View style={tw`mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex-row items-center justify-between`}>
                        <Text style={tw`text-red-400 text-sm flex-1`}>{error}</Text>
                        <TouchableOpacity onPress={() => { setError(null); fetchClients(); }} style={tw`ml-3 bg-red-500/20 px-3 py-2.5 rounded-lg`}>
                            <Text style={tw`text-red-400 text-xs font-bold`}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Client List */}
                <FlatList
                    data={filteredClients}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={10}
                    ListEmptyComponent={
                        !loading ? (
                            <View style={tw`items-center py-20`}>
                                <View style={tw`w-16 h-16 bg-white/5 rounded-full items-center justify-center mb-4`}>
                                    <Search size={32} color="#64748b" />
                                </View>
                                <Text style={tw`text-white font-bold text-lg mb-2`}>No clients found</Text>
                                <Text style={tw`text-slate-400 text-center px-10`}>
                                    {searchQuery ? `No matches for "${searchQuery}"` : "You haven't added any clients yet."}
                                </Text>
                            </View>
                        ) : null
                    }
                    renderItem={({ item: client }) => (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('ClientDetail', { client })}
                            style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-4 border border-white/5 mb-3`}
                        >
                            <View style={tw`flex-row items-center mb-3`}>
                                {/* Avatar */}
                                <View style={tw`w-12 h-12 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center mr-4`}>
                                    <Text style={tw`text-[${COLORS.primary}] font-bold text-lg`}>
                                        {client.name?.charAt(0) || 'C'}
                                    </Text>
                                </View>

                                {/* Main Info */}
                                <View style={tw`flex-1`}>
                                    <View style={tw`flex-row items-center gap-2`}>
                                        <Text style={tw`text-white font-bold text-base`}>{client.name}</Text>
                                        <View style={tw`w-2 h-2 rounded-full bg-[${getStatusColor(client.status)}]`} />
                                    </View>
                                    <Text numberOfLines={1} style={tw`text-slate-400 text-xs mt-0.5`}>{client.plan}</Text>
                                </View>

                                {/* Review Badge + Action */}
                                <View style={tw`items-end gap-1.5`}>
                                    {client.hasUnreviewedWorkout && (
                                        <View style={tw`flex-row items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20`}>
                                            <AlertCircle size={10} color="#f97316" />
                                            <Text style={tw`text-orange-400 text-[9px] font-bold`}>Review</Text>
                                        </View>
                                    )}
                                    <View style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}>
                                        <ChevronRight size={16} color="#64748b" />
                                    </View>
                                </View>
                            </View>

                            {/* Footer Stats - Only show if data exists (optional) */}
                            <View style={tw`flex-row justify-between items-center pt-3 border-t border-white/5`}>
                                <View style={tw`flex-row items-center gap-1.5`}>
                                    <Activity size={12} color={COLORS.primary} />
                                    <Text style={tw`text-slate-400 text-xs`}>
                                        Last: <Text style={tw`text-slate-200 font-medium`}>{client.lastSession}</Text>
                                    </Text>
                                </View>
                                <View style={tw`flex-row items-center gap-1.5`}>
                                    <Clock size={12} color="#94a3b8" />
                                    <Text style={tw`text-slate-500 text-xs`}>{client.lastActive}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            </View>
        </SafeAreaView>
    );
}
