import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { BarChart3, List, CalendarDays } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

// Import the existing screens
import WorkoutHistoryScreen from './WorkoutHistoryScreen';
import AnalyticsScreen from './AnalyticsScreen';
import WorkoutCalendar from '../components/WorkoutCalendar';

export default function ProgressScreen() {
    const [activeTab, setActiveTab] = useState<'graph' | 'table' | 'calendar'>('graph');
    const { user } = useAuth();
    const userId = user?.uid ?? '';

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            {/* Header with Toggle */}
            <View style={tw`pt-14 px-6 pb-2 border-b border-white/5`}>
                <Text style={tw`text-white font-black text-2xl mb-4`}>Progress</Text>

                {/* Custom Tab Toggle */}
                <View style={tw`flex-row bg-black/40 p-1 rounded-xl mb-2`}>
                    <TouchableOpacity
                        onPress={() => setActiveTab('graph')}
                        style={[
                            tw`flex-1 flex-row items-center justify-center py-2.5 rounded-lg`,
                            activeTab === 'graph' ? tw`bg-[${COLORS.primary}]` : tw`bg-transparent`
                        ]}
                    >
                        <BarChart3 size={16} color={activeTab === 'graph' ? 'black' : '#94a3b8'} />
                        <Text style={[
                            tw`ml-2 font-bold text-sm`,
                            activeTab === 'graph' ? tw`text-black` : tw`text-slate-400`
                        ]}>Analytics</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setActiveTab('calendar')}
                        style={[
                            tw`flex-1 flex-row items-center justify-center py-2.5 rounded-lg`,
                            activeTab === 'calendar' ? tw`bg-[${COLORS.primary}]` : tw`bg-transparent`
                        ]}
                    >
                        <CalendarDays size={16} color={activeTab === 'calendar' ? 'black' : '#94a3b8'} />
                        <Text style={[
                            tw`ml-2 font-bold text-sm`,
                            activeTab === 'calendar' ? tw`text-black` : tw`text-slate-400`
                        ]}>Calendar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setActiveTab('table')}
                        style={[
                            tw`flex-1 flex-row items-center justify-center py-2.5 rounded-lg`,
                            activeTab === 'table' ? tw`bg-[${COLORS.primary}]` : tw`bg-transparent`
                        ]}
                    >
                        <List size={16} color={activeTab === 'table' ? 'black' : '#94a3b8'} />
                        <Text style={[
                            tw`ml-2 font-bold text-sm`,
                            activeTab === 'table' ? tw`text-black` : tw`text-slate-400`
                        ]}>History</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content Area */}
            <View style={tw`flex-1`}>
                {activeTab === 'graph' ? (
                    <AnalyticsScreen isNested={true} />
                ) : activeTab === 'calendar' ? (
                    <ScrollView
                        style={tw`flex-1`}
                        contentContainerStyle={tw`p-5 pb-20`}
                    >
                        <WorkoutCalendar clientId={userId} />
                    </ScrollView>
                ) : (
                    <WorkoutHistoryScreen isNested={true} />
                )}
            </View>
        </View>
    );
}
