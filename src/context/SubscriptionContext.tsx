import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Purchases, { PurchasesPackage, CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import { useAuth } from './AuthContext';
import {
    REVENUECAT_API_KEY,
    PRO_ENTITLEMENT_ID,
    FREE_TIER_CLIENT_LIMIT,
    PRO_TIER_CLIENT_LIMIT,
} from '../constants/subscription';

interface SubscriptionContextType {
    isProSubscriber: boolean;
    clientLimit: number;
    loading: boolean;
    currentOffering: PurchasesPackage | null;
    purchasePro: () => Promise<boolean>;
    restorePurchases: () => Promise<boolean>;
    refreshSubscriptionStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
    isProSubscriber: false,
    clientLimit: FREE_TIER_CLIENT_LIMIT,
    loading: true,
    currentOffering: null,
    purchasePro: async () => false,
    restorePurchases: async () => false,
    refreshSubscriptionStatus: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

const updateFromCustomerInfo = (info: CustomerInfo): boolean => {
    return info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
};

export const SubscriptionProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, userRole } = useAuth();
    const [isProSubscriber, setIsProSubscriber] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentOffering, setCurrentOffering] = useState<PurchasesPackage | null>(null);

    useEffect(() => {
        if (!user || userRole !== 'trainer') {
            setIsProSubscriber(false);
            setLoading(false);
            return;
        }

        let listenerRemoved = false;

        const init = async () => {
            try {
                Purchases.configure({
                    apiKey: REVENUECAT_API_KEY,
                    appUserID: user.uid,
                });

                if (__DEV__) {
                    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
                }

                // Check current entitlements
                const customerInfo = await Purchases.getCustomerInfo();
                setIsProSubscriber(updateFromCustomerInfo(customerInfo));

                // Fetch available offerings for paywall
                const offerings = await Purchases.getOfferings();
                if (offerings.current?.availablePackages.length) {
                    const monthly = offerings.current.availablePackages.find(
                        pkg => pkg.packageType === 'MONTHLY'
                    ) || offerings.current.availablePackages[0];
                    setCurrentOffering(monthly);
                }

                // Listen for status changes
                Purchases.addCustomerInfoUpdateListener((info) => {
                    if (!listenerRemoved) {
                        setIsProSubscriber(updateFromCustomerInfo(info));
                    }
                });
            } catch (error) {
                console.error('RevenueCat init error:', error);
            } finally {
                setLoading(false);
            }
        };

        init();

        return () => {
            listenerRemoved = true;
        };
    }, [user?.uid, userRole]);

    const refreshSubscriptionStatus = useCallback(async () => {
        try {
            const customerInfo = await Purchases.getCustomerInfo();
            setIsProSubscriber(updateFromCustomerInfo(customerInfo));
        } catch (error) {
            console.error('Error refreshing subscription:', error);
        }
    }, []);

    const purchasePro = useCallback(async (): Promise<boolean> => {
        if (!currentOffering) return false;
        try {
            const { customerInfo } = await Purchases.purchasePackage(currentOffering);
            const isPro = updateFromCustomerInfo(customerInfo);
            setIsProSubscriber(isPro);
            return isPro;
        } catch (error: any) {
            if (!error.userCancelled) {
                console.error('Purchase error:', error);
            }
            return false;
        }
    }, [currentOffering]);

    const restorePurchases = useCallback(async (): Promise<boolean> => {
        try {
            const customerInfo = await Purchases.restorePurchases();
            const isPro = updateFromCustomerInfo(customerInfo);
            setIsProSubscriber(isPro);
            return isPro;
        } catch (error) {
            console.error('Restore error:', error);
            return false;
        }
    }, []);

    const clientLimit = isProSubscriber ? PRO_TIER_CLIENT_LIMIT : FREE_TIER_CLIENT_LIMIT;

    return (
        <SubscriptionContext.Provider value={{
            isProSubscriber,
            clientLimit,
            loading,
            currentOffering,
            purchasePro,
            restorePurchases,
            refreshSubscriptionStatus,
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
};
