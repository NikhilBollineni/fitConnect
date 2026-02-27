import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Configure notification behavior when app is foregrounded
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync(userId: string, collectionName: 'clientProfiles' | 'trainerProfiles') {
    try {
        if (Platform.OS === 'android') {
            // Default channel for general notifications
            await Notifications.setNotificationChannelAsync('default', {
                name: 'General',
                importance: Notifications.AndroidImportance.DEFAULT,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
            // Dedicated high-priority channel for chat messages (like WhatsApp)
            await Notifications.setNotificationChannelAsync('chat-messages', {
                name: 'Chat Messages',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 100, 200, 300],
                lightColor: '#A8FF57',
                sound: 'default',
                enableLights: true,
                enableVibrate: true,
                showBadge: true,
            });
        }

        if (!Device.isDevice) {
            // Can't get token on Simulator
            console.log('Must use physical device for Push Notifications');
            return null;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            alert('Failed to get push token for push notification!');
            return null;
        }

        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId) {
            // console.log('Project ID not found in app config');
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId,
        });
        const token = tokenData.data;
        console.log('Expo Push Token:', token);

        // Save token to Firestore profile
        if (userId) {
            const userRef = doc(db, collectionName, userId);
            await setDoc(userRef, { pushToken: token }, { merge: true });
        }

        return token;
    } catch (e) {
        console.log('Error checking/registering for push notifications (graceful fail for Expo Go):', e);
        return null; // Don't crash the app
    }
}

/**
 * Listens for push token changes and updates Firestore automatically.
 * Call once at app startup after the user is authenticated.
 */
export function addPushTokenRefreshListener(userId: string, collectionName: 'clientProfiles' | 'trainerProfiles') {
    return Notifications.addPushTokenListener(async (tokenEvent) => {
        try {
            const token = tokenEvent.data;
            if (userId && token) {
                const userRef = doc(db, collectionName, userId);
                await setDoc(userRef, { pushToken: token }, { merge: true });
            }
        } catch (e) {
            console.error('Error refreshing push token:', e);
        }
    });
}

// Function to send a push notification via Expo's Push API
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data: any = {}) {
    const message = {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data,
    };

    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}
