/**
 * journeyDate.ts
 * Utility for sending journey-date proposal / update messages between
 * trainer and client. Follows the same chat pattern as planRequest.ts.
 */

import {
    collection, query, where, getDocs,
    addDoc, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';

/**
 * Sends a journey-date chat message between trainer ↔ client.
 *
 * @param sender       - The authenticated user sending the proposal (uid + displayName)
 * @param recipientId  - The recipient's Firebase Auth UID
 * @param proposedDate - The proposed journey start date
 * @param clientId     - The client's UID (used in metadata)
 * @param clientName   - The client's display name (used in metadata)
 * @param senderRole   - Whether the sender is 'trainer' or 'client'
 */
export async function sendJourneyDateMessage(
    sender: { uid: string; displayName?: string | null },
    recipientId: string,
    proposedDate: Date,
    clientId: string,
    clientName: string,
    senderRole: 'trainer' | 'client'
): Promise<void> {
    if (!sender?.uid || !recipientId) {
        throw new Error('Sender UID and recipient ID are required.');
    }

    // ------------------------------------------------------------------
    // 1. Find existing chat between the two users
    // ------------------------------------------------------------------
    const chatsQuery = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', sender.uid)
    );
    const snapshot = await getDocs(chatsQuery);

    let chatId: string | null = null;
    for (const chatDoc of snapshot.docs) {
        const participants: string[] = chatDoc.data().participants || [];
        if (participants.includes(recipientId)) {
            chatId = chatDoc.id;
            break;
        }
    }

    // ------------------------------------------------------------------
    // 2. Create chat room if it doesn't exist
    // ------------------------------------------------------------------
    if (!chatId) {
        const senderName = sender.displayName || (senderRole === 'trainer' ? 'Coach' : 'Client');
        const recipientName = senderRole === 'trainer' ? clientName : 'Coach';

        const newChatRef = await addDoc(collection(db, 'chats'), {
            participants: [sender.uid, recipientId],
            participantNames: {
                [sender.uid]: senderName,
                [recipientId]: recipientName,
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: 'Chat started',
            unreadCount: { [sender.uid]: 0, [recipientId]: 0 },
        });
        chatId = newChatRef.id;
    }

    // ------------------------------------------------------------------
    // 3. Build message text
    // ------------------------------------------------------------------
    const formattedDate = format(proposedDate, 'MMMM d, yyyy');
    const messageText = senderRole === 'trainer'
        ? `📅 I've set your journey start date to ${formattedDate}. Please confirm or suggest a different date!`
        : `📅 I've updated my journey start date to ${formattedDate}.`;

    // ------------------------------------------------------------------
    // 4. Write message to chat subcollection
    // ------------------------------------------------------------------
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
        _id: Date.now().toString(),
        text: messageText,
        user: {
            _id: sender.uid,
            name: sender.displayName || (senderRole === 'trainer' ? 'Coach' : 'Client'),
        },
        createdAt: serverTimestamp(),
        metadata: {
            type: 'journey_date_proposal',
            proposedDate: proposedDate.toISOString(),
            proposedBy: sender.uid,
            proposedByRole: senderRole,
            clientId,
            clientName,
        },
    });

    // ------------------------------------------------------------------
    // 5. Update parent chat doc for UI feedback
    // ------------------------------------------------------------------
    await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: messageText,
        updatedAt: serverTimestamp(),
    });
}
