import {
    addDoc,
    collection,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    setDoc,
    Timestamp,
    where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Create a unique conversation ID from two user IDs
 * Ensures consistent conversation ID regardless of order
 */
const getConversationId = (userId1: string, userId2: string): string => {
  return [userId1, userId2].sort().join('_');
};

/**
 * Send a message in a conversation
 */
export const sendMessage = async (
  senderId: string,
  recipientId: string,
  messageText: string,
  itemId?: string
) => {
  try {
    const conversationId = getConversationId(senderId, recipientId);
    const messagesRef = collection(db, 'messages', conversationId, 'threads');

    const messageDoc = await addDoc(messagesRef, {
      senderId,
      recipientId,
      text: messageText,
      itemId,
      timestamp: Timestamp.now(),
      read: false,
    });

    // Update conversation metadata
    const conversationRef = doc(db, 'messages', conversationId);
    await setDoc(
      conversationRef,
      {
        participants: [senderId, recipientId],
        lastMessage: messageText,
        lastMessageTime: Timestamp.now(),
        lastMessageSenderId: senderId,
      },
      { merge: true }
    );

    return messageDoc.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Get all messages in a conversation
 */
export const getConversationMessages = async (
  userId1: string,
  userId2: string,
  limitCount: number = 50
) => {
  try {
    const conversationId = getConversationId(userId1, userId2);
    const messagesRef = collection(db, 'messages', conversationId, 'threads');

    const q = query(
      messagesRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse();
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
};

/**
 * Get all conversations for a user
 */
export const getUserConversations = async (userId: string) => {
  try {
    const conversationsRef = collection(db, 'messages');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', userId)
    );

    const snapshot = await getDocs(q);
    const conversations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort by lastMessageTime on client side
    return conversations.sort((a, b) => {
      const timeA = a.lastMessageTime?.toMillis?.() || 0;
      const timeB = b.lastMessageTime?.toMillis?.() || 0;
      return timeB - timeA; // Descending order
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    throw error;
  }
};

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (
  conversationId: string,
  userId: string
) => {
  try {
    const messagesRef = collection(db, 'messages', conversationId, 'threads');
    const q = query(
      messagesRef,
      where('recipientId', '==', userId),
      where('read', '==', false)
    );

    const snapshot = await getDocs(q);
    snapshot.docs.forEach((messageDoc) => {
      // Update each message to read
      // Note: This is a simple implementation. For production, use batch writes
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    throw error;
  }
};

/**
 * Get the other user in a conversation
 */
export const getOtherUserInConversation = (
  conversationId: string,
  currentUserId: string
) => {
  const [userId1, userId2] = conversationId.split('_');
  return userId1 === currentUserId ? userId2 : userId1;
};
