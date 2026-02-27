import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import tw from 'twrnc';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import { Mail, Lock, LogIn } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { getFriendlyAuthError } from '../utils/firebaseErrors';

export default function LoginScreen() {
    const navigation = useNavigation<any>();
    const { signIn, signUp, signInWithGoogle } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) return Alert.alert('Error', 'Please fill in all fields');

        setLoading(true);
        try {
            await signIn(email, password);
        } catch (error: any) {
            Alert.alert('Login Failed', getFriendlyAuthError(error));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            await signInWithGoogle();
        } catch (error: any) {
            Alert.alert('Google Sign-In Error', 'Please ensure you have configured Google Sign-In correctly.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={tw`flex-1 bg-[${COLORS.background}]`}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={tw`flex-1 justify-center px-6`}
                keyboardShouldPersistTaps="handled"
                bounces={false}
            >
                <View style={tw`items-center mb-10`}>
                    <View style={tw`w-20 h-20 bg-[${COLORS.primary}] rounded-full items-center justify-center mb-4`}>
                        <LogIn size={40} color="black" />
                    </View>
                    <Text style={tw`text-white text-3xl font-bold`}>Welcome Back</Text>
                    <Text style={tw`text-slate-400 mt-2`}>Sign in to continue your fitness journey</Text>
                </View>

                {/* Email Input */}
                <View style={tw`mb-4`}>
                    <Text style={tw`text-slate-400 mb-2 font-bold text-xs uppercase tracking-wider`}>Email Address</Text>
                    <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10`}>
                        <Mail size={20} color="#94a3b8" />
                        <TextInput
                            style={tw`flex-1 text-white ml-3 font-semibold`}
                            placeholder="you@example.com"
                            placeholderTextColor="#555"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="next"
                            value={email}
                            onChangeText={setEmail}
                        />
                    </View>
                </View>

                {/* Password Input */}
                <View style={tw`mb-8`}>
                    <Text style={tw`text-slate-400 mb-2 font-bold text-xs uppercase tracking-wider`}>Password</Text>
                    <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10`}>
                        <Lock size={20} color="#94a3b8" />
                        <TextInput
                            style={tw`flex-1 text-white ml-3 font-semibold`}
                            placeholder="••••••••"
                            placeholderTextColor="#555"
                            secureTextEntry
                            returnKeyType="done"
                            onSubmitEditing={handleLogin}
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>
                </View>

                {/* Login Button */}
                <TouchableOpacity
                    onPress={handleLogin}
                    disabled={loading}
                    style={[tw`bg-[${COLORS.primary}] py-4 rounded-xl items-center mb-4`, loading && tw`opacity-60`]}
                >
                    {loading ? (
                        <ActivityIndicator color="black" />
                    ) : (
                        <Text style={tw`text-black font-bold text-lg`}>Sign In</Text>
                    )}
                </TouchableOpacity>

                {/* Google Button */}
                <TouchableOpacity
                    onPress={handleGoogleLogin}
                    disabled={loading}
                    style={[tw`bg-white py-4 rounded-xl items-center flex-row justify-center gap-3 mb-8 shadow-sm`, loading && tw`opacity-60`]}
                >
                    <View style={tw`w-6 h-6 items-center justify-center bg-transparent`}>
                        <Text style={tw`text-blue-600 font-bold text-lg`}>G</Text>
                    </View>
                    <Text style={tw`text-black font-bold text-lg`}>Continue with Google</Text>
                </TouchableOpacity>

                {/* Footer */}
                <View style={tw`flex-row justify-center`}>
                    <Text style={tw`text-slate-400`}>Don't have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                        <Text style={tw`text-[${COLORS.primary}] font-bold`}>Sign Up</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
