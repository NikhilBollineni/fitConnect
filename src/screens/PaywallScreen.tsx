import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Crown, Users, Zap, CheckCircle2, Shield } from 'lucide-react-native';
import { useSubscription } from '../context/SubscriptionContext';
import { FREE_TIER_CLIENT_LIMIT, PRO_TIER_CLIENT_LIMIT } from '../constants/subscription';

export default function PaywallScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { currentOffering, purchasePro, restorePurchases } = useSubscription();
    const [purchasing, setPurchasing] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const handlePurchase = async () => {
        setPurchasing(true);
        try {
            const success = await purchasePro();
            if (success) {
                Alert.alert(
                    'Welcome to Pro!',
                    `You can now manage up to ${PRO_TIER_CLIENT_LIMIT} clients.`,
                    [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
            }
        } catch {
            Alert.alert('Purchase Failed', 'Something went wrong. Please try again.');
        } finally {
            setPurchasing(false);
        }
    };

    const handleRestore = async () => {
        setRestoring(true);
        try {
            const success = await restorePurchases();
            if (success) {
                Alert.alert('Restored!', 'Your Pro subscription has been restored.', [
                    { text: 'OK', onPress: () => navigation.goBack() },
                ]);
            } else {
                Alert.alert('No Subscription Found', 'We could not find an active subscription for your account.');
            }
        } finally {
            setRestoring(false);
        }
    };

    const priceString = currentOffering?.product.priceString || '';

    const features = [
        { icon: Users, text: `Up to ${PRO_TIER_CLIENT_LIMIT} active clients`, sub: `Free plan: ${FREE_TIER_CLIENT_LIMIT} clients` },
        { icon: Zap, text: 'Priority support', sub: 'Direct help when you need it' },
        { icon: Shield, text: 'Cancel anytime', sub: 'Managed through your app store' },
    ];

    return (
        <View style={[tw`flex-1 bg-[${COLORS.background}]`, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={tw`px-5 py-3 flex-row items-center`}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={tw`w-10 h-10 items-center justify-center rounded-full bg-white/5`}
                >
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={tw`px-6 pb-10`}>
                {/* Hero */}
                <View style={tw`items-center mb-8 mt-4`}>
                    <View style={tw`w-20 h-20 rounded-full bg-[${COLORS.primary}]/15 items-center justify-center mb-4`}>
                        <Crown size={40} color={COLORS.primary} />
                    </View>
                    <Text style={tw`text-white text-2xl font-bold text-center mb-2`}>
                        Upgrade to Pro
                    </Text>
                    <Text style={tw`text-slate-400 text-center text-sm px-8`}>
                        Grow your coaching business with more client slots.
                    </Text>
                </View>

                {/* Features */}
                <View style={tw`bg-[${COLORS.backgroundLight}] rounded-2xl p-5 border border-white/5 mb-8`}>
                    <Text style={tw`text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-4`}>
                        What you get
                    </Text>

                    {features.map((feature, i) => (
                        <View key={i} style={tw`flex-row items-start gap-3 ${i > 0 ? 'mt-4 pt-4 border-t border-white/5' : ''}`}>
                            <View style={tw`w-10 h-10 rounded-full bg-[${COLORS.primary}]/10 items-center justify-center`}>
                                <feature.icon size={20} color={COLORS.primary} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-white font-bold text-sm`}>{feature.text}</Text>
                                <Text style={tw`text-slate-400 text-xs mt-0.5`}>{feature.sub}</Text>
                            </View>
                            <CheckCircle2 size={18} color={COLORS.primary} />
                        </View>
                    ))}
                </View>

                {/* Price + CTA */}
                {priceString ? (
                    <View style={tw`items-center mb-6`}>
                        <Text style={tw`text-white text-3xl font-bold`}>{priceString}</Text>
                        <Text style={tw`text-slate-400 text-sm mt-1`}>per month</Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    onPress={handlePurchase}
                    disabled={purchasing || !currentOffering}
                    style={tw`bg-[${COLORS.primary}] py-4 rounded-2xl items-center mb-4 ${purchasing || !currentOffering ? 'opacity-50' : ''}`}
                >
                    {purchasing ? (
                        <ActivityIndicator color="black" />
                    ) : (
                        <Text style={tw`text-black font-bold text-lg`}>Subscribe to Pro</Text>
                    )}
                </TouchableOpacity>

                {/* Restore */}
                <TouchableOpacity
                    onPress={handleRestore}
                    disabled={restoring}
                    style={tw`py-3 items-center`}
                >
                    <Text style={tw`text-slate-400 text-sm ${restoring ? 'opacity-50' : ''}`}>
                        {restoring ? 'Restoring...' : 'Restore Purchase'}
                    </Text>
                </TouchableOpacity>

                {/* Legal footnote */}
                <Text style={tw`text-slate-600 text-[10px] text-center mt-6 px-4`}>
                    Payment will be charged to your App Store or Google Play account.
                    Subscription automatically renews unless canceled at least 24 hours
                    before the current period ends.
                </Text>
            </ScrollView>
        </View>
    );
}
