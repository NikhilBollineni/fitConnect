import "./global.css";
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator } from 'react-native';
import { useFonts, Lexend_300Light, Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold } from '@expo-google-fonts/lexend';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ChatProvider } from './src/context/ChatContext';
import { COLORS } from './src/constants/theme';

// Screens
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import ClientDashboard from './src/screens/ClientDashboard';
import TrainerDashboard from './src/screens/TrainerDashboard';
import WorkoutView from './src/screens/WorkoutView';
import LogWorkoutScreen from './src/screens/LogWorkoutScreen';
import WorkoutHistoryScreen from './src/screens/WorkoutHistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import AddClientScreen from './src/screens/AddClientScreen';
import ClientProfileScreen from './src/screens/ClientProfileScreen';
import ClientDetailScreen from './src/screens/ClientDetailScreen';
import FindClientsScreen from './src/screens/FindClientsScreen';
import TrainerRequestsScreen from './src/screens/TrainerRequestsScreen';
import MemberSetupScreen from './src/screens/MemberSetupScreen';
import TrainerProfileScreen from './src/screens/TrainerProfileScreen';
import TrainerReviewsScreen from './src/screens/TrainerReviewsScreen';
import MemberTabs from './src/navigation/MemberTabs';
import TrainerTabs from './src/navigation/TrainerTabs';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import WorkoutSummaryScreen from './src/screens/SmartLog/WorkoutSummaryScreen';
import ProgramScreen from './src/screens/ProgramScreen';
import AIGeneratorView from './src/screens/SmartLog/AIGeneratorView'; // AI Generator
import EditPlanScreen from './src/screens/EditPlanScreen';

import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { user, userRole, loading } = useAuth();
  const navigation = useNavigation();

  React.useEffect(() => {
    // Handle notification taps — deep-link into the correct chat room
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.chatId && user) {
        // Both chatId and title are required by ChatScreen
        navigation.navigate('Chat', {
          chatId: data.chatId,
          title: data.title || 'Chat',
        });
      }
    });
    return () => subscription.remove();
  }, [user, navigation]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      {/* ... rest of the navigators ... */}
      {!user ? (
        // ─── Unauthenticated: Login / Signup Flow ───
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
        </>
      ) : !userRole ? (
        // ─── Authenticated but no role: Role Selection ───
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      ) : userRole === 'trainer' ? (
        // ─── Trainer Flow ───
        <>
          <Stack.Screen name="TrainerHome" component={TrainerTabs} />
          <Stack.Screen name="AddClient" component={AddClientScreen} />
          <Stack.Screen name="ClientDetail" component={ClientDetailScreen} />
          <Stack.Screen name="EditPlan" component={EditPlanScreen} />
          <Stack.Screen name="WorkoutView" component={WorkoutView} />
          <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
          <Stack.Screen name="TrainerProfile" component={TrainerProfileScreen} />
          <Stack.Screen name="TrainerReviews" component={TrainerReviewsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
        </>
      ) : (
        // ─── Member / Client Flow ───
        <>
          <Stack.Screen name="MemberTabs" component={MemberTabs} />
          <Stack.Screen name="WorkoutView" component={WorkoutView} />
          <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
          <Stack.Screen name="MemberSetup" component={MemberSetupScreen} />
          <Stack.Screen name="ChatList" component={ChatListScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
          <Stack.Screen name="Program" component={ProgramScreen} />
          <Stack.Screen name="AIGenerator" component={AIGeneratorView} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  let [fontsLoaded] = useFonts({
    Lexend_300Light,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: 'white' }}>Loading Fonts...</Text></View>;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </ChatProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
