/**
 * planRequest.ts
 * Utility for sending a "plan request" message from a client to their trainer.
 * The message is written to the Firestore chat subcollection; the existing
 * onMessageCreated Cloud Function handles unreadCount increment + push notification.
 */

import {
    collection, query, where, getDocs,
    addDoc, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type PlanRequestType = 'exercise' | 'meal' | 'both';

/**
 * Finds (or creates) the direct chat between the client and their trainer,
 * then sends a structured plan-request message.
 *
 * @param user       - The authenticated client (uid + displayName)
 * @param trainerId  - The trainer's Firebase Auth UID
 * @param requestType - What's missing: 'exercise', 'meal', or 'both'
 * @param day        - Human-readable day string, e.g. "Monday" or "Today"
 */
export async function sendPlanRequestMessage(
    user: { uid: string; displayName?: string | null },
    trainerId: string,
    requestType: PlanRequestType,
    day: string
): Promise<void> {
    if (!user?.uid || !trainerId) {
        throw new Error('User UID and trainer ID are required.');
    }

    // ------------------------------------------------------------------
    // 1. Find existing chat between client and trainer
    // ------------------------------------------------------------------
    const chatsQuery = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', user.uid)
    );
    const snapshot = await getDocs(chatsQuery);

    let chatId: string | null = null;
    for (const chatDoc of snapshot.docs) {
        const participants: string[] = chatDoc.data().participants || [];
        if (participants.includes(trainerId)) {
            chatId = chatDoc.id;
            break;
        }
    }

    // ------------------------------------------------------------------
    // 2. Create the chat room if it doesn't exist yet
    // ------------------------------------------------------------------
    if (!chatId) {
        const newChatRef = await addDoc(collection(db, 'chats'), {
            participants: [user.uid, trainerId],
            participantNames: {
                [user.uid]: user.displayName || 'Client',
                [trainerId]: 'Coach',
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: 'Chat started',
            unreadCount: { [user.uid]: 0, [trainerId]: 0 },
        });
        chatId = newChatRef.id;
    }

    // ------------------------------------------------------------------
    // 3. Build the message text
    // ------------------------------------------------------------------
    const typeLabel =
        requestType === 'both'
            ? 'workout or meal'
            : requestType === 'exercise'
                ? 'workout'
                : 'meal';

    const messageText = `🙋 I don't have a ${typeLabel} plan for ${day}. Could you create one for me?`;

    // ------------------------------------------------------------------
    // 4. Write the message to the messages sub-collection
    //    The Cloud Function (onMessageCreated) will:
    //    - Increment trainer's unreadCount by 1
    //    - Send the push notification
    // ------------------------------------------------------------------
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
        _id: Date.now().toString(),
        text: messageText,
        user: {
            _id: user.uid,
            name: user.displayName || 'Client',
        },
        createdAt: serverTimestamp(),
        metadata: {
            type: 'plan_request',
            requestType,
            clientId: user.uid,
            clientName: user.displayName || 'Client',
            day,
        },
    });

    // ------------------------------------------------------------------
    // 5. Update parent chat doc for instant UI feedback in chat lists.
    //    (unreadCount is handled by the Cloud Function — do NOT set it here)
    // ------------------------------------------------------------------
    await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: messageText,
        updatedAt: serverTimestamp(),
    });
}
