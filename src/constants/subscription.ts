import { Platform } from 'react-native';

// RevenueCat public API keys (safe to embed in client code)
// Replace with real keys from RevenueCat dashboard after setup
export const REVENUECAT_API_KEY = Platform.select({
    ios: 'appl_YOUR_IOS_API_KEY_HERE',
    android: 'goog_otcECzaUMiHXxiCozuBxGMkRaFl',
}) as string;

// Entitlement identifier configured in RevenueCat dashboard
export const PRO_ENTITLEMENT_ID = 'pro';

// Client limits per tier
export const FREE_TIER_CLIENT_LIMIT = 2;
export const PRO_TIER_CLIENT_LIMIT = 10;
