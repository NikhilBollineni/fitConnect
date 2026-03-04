import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground, StatusBar } from 'react-native';
import tw from 'twrnc';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants/theme';
import { Zap, ArrowRight } from 'lucide-react-native';

export default function WelcomeScreen() {
    const navigation = useNavigation<any>();

    return (
        <View style={tw`flex-1 bg-[${COLORS.background}]`}>
            <StatusBar barStyle="light-content" />

            {/* Main Content */}
            <View style={tw`flex-1 items-center justify-center px-6`}>

                {/* Icon */}
                <View style={tw`w-24 h-24 rounded-3xl bg-[${COLORS.primary}] items-center justify-center mb-10 shadow-lg shadow-[${COLORS.primary}]/50`}>
                    <Zap size={48} color="black" fill="black" />
                </View>

                {/* Hero Text */}
                <Text style={tw`text-white text-5xl font-bold tracking-tight text-center mb-4`}>
                    XA
                </Text>
                <Text style={tw`text-slate-400 text-lg text-center leading-7 mb-12`}>
                    Where trainers build plans{'\n'}and clients crush goals.
                </Text>

                {/* Buttons */}
                <View style={tw`w-full gap-4`}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('SignUp')}
                        style={tw`bg-[${COLORS.primary}] w-full py-4 rounded-2xl items-center flex-row justify-center gap-2`}
                    >
                        <Text style={tw`text-black text-lg font-bold`}>Get Started</Text>
                        <ArrowRight size={20} color="black" strokeWidth={3} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Login')}
                        style={tw`bg-white/10 w-full py-4 rounded-2xl items-center border border-white/5`}>
                        <Text style={tw`text-white text-lg font-bold`}>Sign In</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Footer */}
            <View style={tw`pb-10 items-center`}>
                <Text style={tw`text-slate-600 text-xs font-medium`}>
                    v1.1  •  Powered by Firebase
                </Text>
            </View>
        </View>
    );
}
