import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { Dumbbell, Calendar, BarChart3, MessageCircle, Home, Plus, Users } from 'lucide-react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

// Screens
import ClientDashboard from '../screens/ClientDashboard';
import ProgressScreen from '../screens/ProgressScreen';
import ChatListScreen from '../screens/ChatListScreen';
import LogWorkoutScreen from '../screens/LogWorkoutScreen';
import TrainerRequestsScreen from '../screens/TrainerRequestsScreen';

import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';

const Tab = createBottomTabNavigator();

export default function MemberTabs() {
    const navigation = useNavigation<any>();
    const { user, userRole } = useAuth();
    const { totalUnreadCount } = useChat();

    const handleSmartLogPress = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (!user) {
            navigation.navigate('Log');
            return;
        }

        try {
            // Fetch trainer's plan — same logic as ClientDashboard "Start Now"
            const planSnapshot = await getDocs(query(
                collection(db, 'plans'),
                where('clientId', '==', user.uid)
            ));
            const plans = planSnapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a: any, b: any) => ((b as any).createdAt?.seconds || 0) - ((a as any).createdAt?.seconds || 0));

            let activePlan: any = plans.length > 0 ? plans[0] : null;

            // Fallback: check client profile for daily routine
            if (!activePlan) {
                const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
                const profileDoc = await getDoc(doc(db, 'clientProfiles', user.uid));
                const todayRoutine = profileDoc.exists() ? profileDoc.data()?.exercisePlan?.[today] : null;

                if (todayRoutine && todayRoutine.length > 0) {
                    activePlan = {
                        id: 'routine-' + today,
                        name: `${today}'s Routine`,
                        exercises: todayRoutine.map((ex: any, eIdx: number) => ({
                            id: `routine-ex-${eIdx}`,
                            name: ex.name,
                            sets: Array.from({ length: ex.sets }, (_, sIdx) => ({
                                id: `routine-ex-${eIdx}-set-${sIdx}`,
                                weight: ex.weight,
                                reps: ex.reps.toString(),
                                completed: false,
                                targetReps: ex.reps.toString(),
                                targetWeight: ex.weight,
                                actualReps: '',
                                actualWeight: '',
                            })),
                        })),
                    };
                }
            }

            // Navigate directly to WorkoutView — same as "Start Now"
            if (activePlan) {
                navigation.navigate('WorkoutView', { workoutData: activePlan });
            } else {
                // No plan at all — open empty workout so client can add exercises
                navigation.navigate('WorkoutView', {
                    workoutData: {
                        id: Date.now().toString(),
                        title: `Workout ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                        duration: '0 min',
                        exercises: []
                    }
                });
            }
        } catch (error) {
            console.error("Error fetching plan for + button:", error);
            navigation.navigate('WorkoutView', {
                workoutData: {
                    id: Date.now().toString(),
                    title: `Workout ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                    duration: '0 min',
                    exercises: []
                }
            });
        }
    };

    return (
        <Tab.Navigator
                id="MemberTabs"
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        position: 'absolute',
                        backgroundColor: 'transparent',
                        borderTopWidth: 0,
                        elevation: 0,
                        height: Platform.OS === 'ios' ? 85 : 65,
                        paddingTop: 10,
                        paddingBottom: Platform.OS === 'ios' ? 25 : 10,
                    },
                    tabBarBackground: () => (
                        <BlurView
                            tint="dark"
                            intensity={85}
                            style={tw`absolute inset-0`}
                        />
                    ),
                    tabBarActiveTintColor: COLORS.primary,
                    tabBarInactiveTintColor: '#64748b',
                    tabBarLabelStyle: {
                        fontSize: 10,
                        fontWeight: '600',
                        marginTop: 2,
                    },
                }}
            >
                <Tab.Screen
                    name="Home"
                    component={ClientDashboard}
                    options={{
                        tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
                    }}
                />
                <Tab.Screen
                    name="Progress"
                    component={ProgressScreen}
                    options={{
                        tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />,
                    }}
                />
                <Tab.Screen
                    name="Log"
                    component={LogWorkoutScreen}
                    listeners={{
                        tabPress: (e: any) => {
                            e.preventDefault(); // Prevent default navigation
                            handleSmartLogPress();
                        },
                    }}
                    options={{
                        tabBarLabel: '',
                        tabBarIcon: ({ color }) => (
                            <View style={tw`w-14 h-14 bg-[${COLORS.primary}] rounded-full items-center justify-center -mt-6 border-4 border-[${COLORS.background}] shadow-lg`}>
                                <Plus size={28} color="black" strokeWidth={3} />
                            </View>
                        ),
                    }}
                />
                <Tab.Screen
                    name="Messages"
                    component={ChatListScreen}
                    options={{
                        tabBarIcon: ({ color, size }) => (
                            <View style={{ width: size + 16, height: size + 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                                {totalUnreadCount > 0 && (
                                    <View style={{
                                        position: 'absolute',
                                        top: 0,
                                        right: 0,
                                        backgroundColor: '#ef4444',
                                        borderRadius: 9,
                                        minWidth: 18,
                                        height: 18,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        paddingHorizontal: 3,
                                        zIndex: 10,
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                                            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                                        </Text>
                                    </View>
                                )}
                                <MessageCircle size={size} color={color} />
                            </View>
                        ),
                    }}
                />
                <Tab.Screen
                    name="Requests"
                    component={TrainerRequestsScreen}
                    options={{
                        tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
                    }}
                />
            </Tab.Navigator>
    );
}
