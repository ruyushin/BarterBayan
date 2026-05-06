import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

// TEST FUNCTION: Fetch the specific item from image_9b1520.png
export const getItemsByCategory = async (category: string) => {
  const docRef = doc(db, 'items', 'LTJvXhFNMHkuVON8VNKX'); // Verbatim ID from image
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  } else {
    throw new Error("Document not found!");
  }
};

// FETCH ALL: For your index.tsx feed
export const getAllItems = async () => {
  const querySnapshot = await getDocs(collection(db, 'items'));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

// SEARCH: Search items by title or name
export const searchItems = async (searchQuery: string) => {
  if (!searchQuery.trim()) {
    return getAllItems();
  }

  const querySnapshot = await getDocs(collection(db, 'items'));
  const searchLower = searchQuery.toLowerCase();
  
  return querySnapshot.docs
    .map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    .filter((item: any) => 
      (item.title && item.title.toLowerCase().includes(searchLower)) ||
      (item.description && item.description.toLowerCase().includes(searchLower))
    );
};

/**
 * Get user information by userId
 */
export const getUserInfo = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return {
        id: userSnap.id,
        ...userSnap.data(),
      };
    } else {
      throw new Error('User not found');
    }
  } catch (error) {
    console.error('Error getting user info:', error);
    throw error;
  }
};

/**
 * Get item details with owner information
 */
export const getItemDetails = async (itemId: string) => {
  try {
    const itemRef = doc(db, 'items', itemId);
    const itemSnap = await getDoc(itemRef);

    if (itemSnap.exists()) {
      const itemData = itemSnap.data();
      const ownerInfo = await getUserInfo(itemData.ownerId);

      return {
        id: itemSnap.id,
        ...itemData,
        owner: ownerInfo,
      };
    } else {
      throw new Error('Item not found');
    }
  } catch (error) {
    console.error('Error getting item details:', error);
    throw error;
  }
};

/**
 * Update item likes
 * @param itemId - Item document ID
 * @param userId - User ID who is liking/unliking
 * @param isLiking - true to like, false to unlike
 */
export const updateItemLikes = async (
  itemId: string,
  userId: string,
  isLiking: boolean
) => {
  try {
    const itemRef = doc(db, 'items', itemId);

    if (isLiking) {
      // Add user to likedBy array and increment likes count
      await updateDoc(itemRef, {
        likedBy: arrayUnion(userId),
        likes: (await getDoc(itemRef)).data()?.likes + 1 || 1,
      });
    } else {
      // Remove user from likedBy array and decrement likes count
      const itemSnap = await getDoc(itemRef);
      const currentLikes = itemSnap.data()?.likes || 0;

      await updateDoc(itemRef, {
        likedBy: arrayRemove(userId),
        likes: Math.max(currentLikes - 1, 0),
      });
    }
  } catch (error) {
    console.error('Error updating likes:', error);
    throw error;
  }
};

/**
 * Initialize likedBy array if it doesn't exist
 * Run this once during item creation or migration
 */
export const initializeLikedBy = async (itemId: string) => {
  try {
    const itemRef = doc(db, 'items', itemId);
    const itemSnap = await getDoc(itemRef);

    if (itemSnap.exists() && !itemSnap.data()?.likedBy) {
      await updateDoc(itemRef, {
        likedBy: [],
      });
    }
  } catch (error) {
    console.error('Error initializing likedBy:', error);
    throw error;
  }
};

/**
 * Add a new item to Firebase
 * @param itemData - The item data to add
 */
export const addItem = async (itemData: {
  title: string;
  description: string;
  category: string;
  condition: string;
  images: string[]; // Array of image URLs from Cloudinary
  ownerId: string;
  likes?: number;
  likedBy?: string[];
  createdAt?: any;
}) => {
  try {
    const docRef = await addDoc(collection(db, 'items'), {
      ...itemData,
      likes: itemData.likes || 0,
      likedBy: itemData.likedBy || [],
      createdAt: itemData.createdAt || new Date(),
    });
    return { id: docRef.id, ...itemData };
  } catch (error) {
    console.error('Error adding item:', error);
    throw error;
  }
};