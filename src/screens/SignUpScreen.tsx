import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import tw from 'twrnc';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import { Mail, Lock, User, ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { getFriendlyAuthError } from '../utils/firebaseErrors';

export default function SignUpScreen() {
    const navigation = useNavigation<any>();
    const { signUp, signInWithGoogle } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [loading, setLoading] = useState(false);

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

    const handleSignUp = async () => {
        if (!name || !email || !password || !confirmPass) {
            return Alert.alert('Error', 'Please fill in all fields');
        }
        if (password !== confirmPass) {
            return Alert.alert('Error', 'Passwords do not match');
        }

        setLoading(true);
        try {
            await signUp(email, password, name);
        } catch (error: any) {
            Alert.alert('Sign Up Failed', getFriendlyAuthError(error));
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
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`absolute top-12 left-0 z-10 p-2 bg-white/5 rounded-full`}>
                    <ArrowLeft size={24} color="white" />
                </TouchableOpacity>

                <View style={tw`items-center mb-8`}>
                    <Text style={tw`text-white text-3xl font-bold`}>Create Account</Text>
                    <Text style={tw`text-slate-400 mt-2`}>Join FitConnect today</Text>
                </View>

                {/* Name Input */}
                <View style={tw`mb-4`}>
                    <Text style={tw`text-slate-400 mb-2 font-bold text-xs uppercase tracking-wider`}>Full Name</Text>
                    <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10`}>
                        <User size={20} color="#94a3b8" />
                        <TextInput
                            style={tw`flex-1 text-white ml-3 font-semibold`}
                            placeholder="John Doe"
                            placeholderTextColor="#555"
                            returnKeyType="next"
                            value={name}
                            onChangeText={setName}
                        />
                    </View>
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
                <View style={tw`mb-4`}>
                    <Text style={tw`text-slate-400 mb-2 font-bold text-xs uppercase tracking-wider`}>Password</Text>
                    <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10`}>
                        <Lock size={20} color="#94a3b8" />
                        <TextInput
                            style={tw`flex-1 text-white ml-3 font-semibold`}
                            placeholder="••••••••"
                            placeholderTextColor="#555"
                            secureTextEntry
                            returnKeyType="next"
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>
                </View>

                {/* Confirm Password Input */}
                <View style={tw`mb-8`}>
                    <Text style={tw`text-slate-400 mb-2 font-bold text-xs uppercase tracking-wider`}>Confirm Password</Text>
                    <View style={tw`flex-row items-center bg-white/5 rounded-xl px-4 py-3 border border-white/10`}>
                        <Lock size={20} color="#94a3b8" />
                        <TextInput
                            style={tw`flex-1 text-white ml-3 font-semibold`}
                            placeholder="••••••••"
                            placeholderTextColor="#555"
                            secureTextEntry
                            returnKeyType="done"
                            onSubmitEditing={handleSignUp}
                            value={confirmPass}
                            onChangeText={setConfirmPass}
                        />
                    </View>
                </View>

                {/* Sign Up Button */}
                <TouchableOpacity
                    onPress={handleSignUp}
                    disabled={loading}
                    style={[tw`bg-[${COLORS.primary}] py-4 rounded-xl items-center mb-8`, loading && tw`opacity-60`]}
                >
                    {loading ? (
                        <ActivityIndicator color="black" />
                    ) : (
                        <Text style={tw`text-black font-bold text-lg`}>Create Account</Text>
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
                    <Text style={tw`text-slate-400`}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                        <Text style={tw`text-[${COLORS.primary}] font-bold`}>Sign In</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
