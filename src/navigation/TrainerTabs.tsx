import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Platform } from 'react-native';
import { Home, Users, Search, Bell, MessageSquare } from 'lucide-react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { BlurView } from 'expo-blur';
import { useChat } from '../context/ChatContext';

// Screens
import TrainerDashboard from '../screens/TrainerDashboard';
import TrainerClientsScreen from '../screens/TrainerClientsScreen';
import FindClientsScreen from '../screens/FindClientsScreen';
import TrainerRequestsScreen from '../screens/TrainerRequestsScreen';
import ChatListScreen from '../screens/ChatListScreen';

const Tab = createBottomTabNavigator();

export default function TrainerTabs() {
    const { totalUnreadCount } = useChat();

    return (
        <Tab.Navigator
            id="TrainerTabs"
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
                component={TrainerDashboard}
                options={{
                    tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
                }}
            />
            <Tab.Screen
                name="Clients"
                component={TrainerClientsScreen}
                options={{
                    tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
                }}
            />
            <Tab.Screen
                name="Discover"
                component={FindClientsScreen}
                options={{
                    tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
                }}
            />
            <Tab.Screen
                name="Requests"
                component={TrainerRequestsScreen}
                options={{
                    tabBarIcon: ({ color, size }) => <Bell size={size} color={color} />,
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
                            <MessageSquare size={size} color={color} />
                        </View>
                    ),
                }}
            />
        </Tab.Navigator>
    );
}
