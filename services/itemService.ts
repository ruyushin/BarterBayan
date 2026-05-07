import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

// TEST FUNCTION: Fetch the specific item from image_9b1520.png
export const getItemsByCategory = async (category: string) => {
  const docRef = doc(db, "items", "LTJvXhFNMHkuVON8VNKX"); // Verbatim ID from image
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  } else {
    throw new Error("Document not found!");
  }
};

// FETCH ALL: For your index.tsx feed
export const getAllItems = async () => {
  const querySnapshot = await getDocs(collection(db, "items"));
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

// SEARCH: Search items by title or name
export const searchItems = async (searchQuery: string) => {
  if (!searchQuery.trim()) {
    return getAllItems();
  }

  const querySnapshot = await getDocs(collection(db, "items"));
  const searchLower = searchQuery.toLowerCase();

  return querySnapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter(
      (item: any) =>
        (item.title && item.title.toLowerCase().includes(searchLower)) ||
        (item.description &&
          item.description.toLowerCase().includes(searchLower)),
    );
};

/**
 * Get user information by userId
 */
export const getUserInfo = async (userId: string) => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return {
        id: userSnap.id,
        ...userSnap.data(),
      };
    } else {
      throw new Error("User not found");
    }
  } catch (error) {
    console.error("Error getting user info:", error);
    throw error;
  }
};

/**
 * Get item details with owner information
 */
export const getItemDetails = async (itemId: string) => {
  try {
    const itemRef = doc(db, "items", itemId);
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
      throw new Error("Item not found");
    }
  } catch (error) {
    console.error("Error getting item details:", error);
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
  isLiking: boolean,
) => {
  try {
    const itemRef = doc(db, "items", itemId);

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
    console.error("Error updating likes:", error);
    throw error;
  }
};

/**
 * Initialize likedBy array if it doesn't exist
 * Run this once during item creation or migration
 */
export const initializeLikedBy = async (itemId: string) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);

    if (itemSnap.exists() && !itemSnap.data()?.likedBy) {
      await updateDoc(itemRef, {
        likedBy: [],
      });
    }
  } catch (error) {
    console.error("Error initializing likedBy:", error);
    throw error;
  }
};

/**
 * Save/bookmark an item for the user
 * @param itemId - Item document ID
 * @param userId - User ID who is saving the item
 * @param isSaving - true to save, false to unsave
 */
export const updateItemSaves = async (
  itemId: string,
  userId: string,
  isSaving: boolean,
) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const userRef = doc(db, "users", userId);

    if (isSaving) {
      // Add to savedBy array on item and add to savedItems array on user
      await updateDoc(itemRef, {
        savedBy: arrayUnion(userId),
      });
      await updateDoc(userRef, {
        savedItems: arrayUnion(itemId),
        savedCount: (await getDoc(userRef)).data()?.savedCount + 1 || 1,
      });
    } else {
      // Remove from savedBy array on item and remove from savedItems array on user
      const userSnap = await getDoc(userRef);
      const currentSaved = userSnap.data()?.savedCount || 0;

      await updateDoc(itemRef, {
        savedBy: arrayRemove(userId),
      });
      await updateDoc(userRef, {
        savedItems: arrayRemove(itemId),
        savedCount: Math.max(currentSaved - 1, 0),
      });
    }
  } catch (error) {
    console.error("Error updating saves:", error);
    throw error;
  }
};

/**
 * Get all saved items for a user
 * @param userId - User ID to fetch saved items for
 */
export const getSavedItems = async (userId: string) => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error("User not found");
    }

    const savedItemIds = userSnap.data()?.savedItems || [];

    if (savedItemIds.length === 0) {
      return [];
    }

    // Fetch all saved items
    const itemsPromises = savedItemIds.map((itemId: string) =>
      getItemDetails(itemId).catch(() => null),
    );

    const items = await Promise.all(itemsPromises);
    return items.filter((item): item is any => item !== null);
  } catch (error) {
    console.error("Error fetching saved items:", error);
    throw error;
  }
};

/**
 * Check if an item is saved by the user
 * @param itemId - Item document ID
 * @param userId - User ID to check
 */
export const isItemSaved = async (itemId: string, userId: string) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);

    if (!itemSnap.exists()) {
      return false;
    }

    const savedBy = itemSnap.data()?.savedBy || [];
    return savedBy.includes(userId);
  } catch (error) {
    console.error("Error checking if item is saved:", error);
    return false;
  }
};
