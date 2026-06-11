import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

export const getItemsByCategory = async (category: string) => {
  const docRef = doc(db, "items", "LTJvXhFNMHkuVON8VNKX");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  } else {
    throw new Error("Document not found!");
  }
};

// FETCH ALL: filters out items that have been successfully traded or deleted
export const getAllItems = async () => {
  const querySnapshot = await getDocsFromServer(collection(db, "items"));

  const allItems = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  // PATCH: also filter soft-deleted items alongside traded ones
  const items = allItems.filter((item) => !item.isTraded && !item.isDeleted);

  const ownerIds = [...new Set(items.map((i) => i.ownerId).filter(Boolean))];

  const userMap: Record<string, { userName: string; userAvatar: string }> = {};

  await Promise.all(
    ownerIds.map(async (ownerId) => {
      try {
        const userSnap = await getDoc(doc(db, "users", ownerId as string));
        if (userSnap.exists()) {
          const data = userSnap.data();
          userMap[ownerId as string] = {
            userName: data.username ?? "Unknown User",
            userAvatar: data.avatarUrl ?? "",
          };
        }
      } catch {
        // user doc missing — item will show "Unknown User" gracefully
      }
    }),
  );

  return items.map((item) => ({
    ...item,
    userName:
      item.userName || userMap[item.ownerId]?.userName || "Unknown User",
    userAvatar: item.userAvatar || userMap[item.ownerId]?.userAvatar || "",
  }));
};

// SEARCH: also filters traded and deleted items
export const searchItems = async (searchQuery: string) => {
  if (!searchQuery.trim()) {
    return getAllItems();
  }

  const querySnapshot = await getDocsFromServer(collection(db, "items"));
  const searchLower = searchQuery.toLowerCase();

  return querySnapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter(
      (item: any) =>
        !item.isTraded &&
        !item.isDeleted && // PATCH: exclude deleted items from search
        ((item.title && item.title.toLowerCase().includes(searchLower)) ||
          (item.description &&
            item.description.toLowerCase().includes(searchLower))),
    );
};

export const getUserInfo = async (userId: string) => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    } else {
      throw new Error("User not found");
    }
  } catch (error) {
    console.error("Error getting user info:", error);
    throw error;
  }
};

export const getItemDetails = async (itemId: string) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);
    if (itemSnap.exists()) {
      const itemData = itemSnap.data();
      const ownerInfo = await getUserInfo(itemData.ownerId);
      return { id: itemSnap.id, ...itemData, owner: ownerInfo };
    } else {
      throw new Error("Item not found");
    }
  } catch (error) {
    console.error("Error getting item details:", error);
    throw error;
  }
};

/**
 * PATCH: deleteItem
 * Hard-deletes the item document so it disappears from home, explore, and
 * every other listing screen immediately.
 *
 * Also cancels every pending trade that references this item so no one is
 * left waiting on a ghost offer. We do the trade cancellation inline here
 * (without importing tradeService) to avoid a circular module dependency.
 *
 * If you prefer a soft-delete instead of hard-delete, swap the `deleteDoc`
 * call for `updateDoc(itemRef, { isDeleted: true })` — the getAllItems /
 * searchItems filters above already exclude `isDeleted: true` items.
 */
export const deleteItem = async (
  itemId: string,
  requestingUserId: string,
): Promise<void> => {
  const itemRef = doc(db, "items", itemId);
  const itemSnap = await getDoc(itemRef);

  if (!itemSnap.exists()) throw new Error("Item not found.");
  if (itemSnap.data()?.ownerId !== requestingUserId)
    throw new Error("You can only delete your own items.");

  // Cancel all pending trades that reference this item as requested or offered
  const now = new Date();
  const cancelFields = { status: "cancelled", updatedAt: now };

  const [snapReq, snapOff] = await Promise.all([
    getDocs(
      query(
        collection(db, "trades"),
        where("requestedItemId", "==", itemId),
        where("status", "==", "pending"),
      ),
    ),
    getDocs(
      query(
        collection(db, "trades"),
        where("offeredItemId", "==", itemId),
        where("status", "==", "pending"),
      ),
    ),
  ]);

  await Promise.all([
    ...snapReq.docs.map((d) => updateDoc(d.ref, cancelFields)),
    ...snapOff.docs.map((d) => updateDoc(d.ref, cancelFields)),
  ]).catch((e) =>
    console.warn(
      "Could not cancel pending trades for deleted item (non-fatal):",
      e,
    ),
  );

  // Hard-delete the item itself
  await deleteDoc(itemRef);
};

export const updateItemLikes = async (
  itemId: string,
  userId: string,
  isLiking: boolean,
) => {
  try {
    const itemRef = doc(db, "items", itemId);
    if (isLiking) {
      await updateDoc(itemRef, {
        likedBy: arrayUnion(userId),
        likes: (await getDoc(itemRef)).data()?.likes + 1 || 1,
      });
    } else {
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

export const initializeLikedBy = async (itemId: string) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);
    if (itemSnap.exists() && !itemSnap.data()?.likedBy) {
      await updateDoc(itemRef, { likedBy: [] });
    }
  } catch (error) {
    console.error("Error initializing likedBy:", error);
    throw error;
  }
};

export const addItem = async (itemData: {
  title: string;
  description: string;
  category: string;
  condition: string;
  images: string[];
  ownerId: string;
  likes?: number;
  likedBy?: string[];
  createdAt?: any;
}) => {
  try {
    const docRef = await addDoc(collection(db, "items"), {
      ...itemData,
      likes: itemData.likes || 0,
      likedBy: itemData.likedBy || [],
      isTraded: false,
      isDeleted: false, // PATCH: explicit default so filter works correctly
      createdAt: itemData.createdAt || new Date(),
    });
    return { id: docRef.id, ...itemData };
  } catch (error) {
    console.error("Error adding item:", error);
    throw error;
  }
};

export const addComment = async (
  itemId: string,
  userId: string,
  text: string,
  userName: string,
  userAvatar: string,
) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const comment = {
      id: Date.now().toString(),
      userId,
      userName,
      userAvatar,
      text,
      likedBy: [],
      likes: 0,
      replies: [],
      createdAt: new Date(),
    };
    await updateDoc(itemRef, { comments: arrayUnion(comment) });
    return comment;
  } catch (error) {
    console.error("Error adding comment:", error);
    throw error;
  }
};

export const deleteComment = async (itemId: string, commentId: string) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);
    const comments = itemSnap.data()?.comments || [];
    const updatedComments = comments.filter((c: any) => c.id !== commentId);
    await updateDoc(itemRef, { comments: updatedComments });
  } catch (error) {
    console.error("Error deleting comment:", error);
    throw error;
  }
};

export const updateCommentLike = async (
  itemId: string,
  commentId: string,
  userId: string,
  isLiking: boolean,
) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);
    const comments = itemSnap.data()?.comments || [];
    const updatedComments = comments.map((comment: any) => {
      if (comment.id === commentId) {
        if (isLiking) {
          return {
            ...comment,
            likedBy: [...(comment.likedBy || []), userId],
            likes: (comment.likes || 0) + 1,
          };
        } else {
          const likedBy = (comment.likedBy || []).filter(
            (id: string) => id !== userId,
          );
          return {
            ...comment,
            likedBy,
            likes: Math.max((comment.likes || 0) - 1, 0),
          };
        }
      }
      return comment;
    });
    await updateDoc(itemRef, { comments: updatedComments });
  } catch (error) {
    console.error("Error updating comment like:", error);
    throw error;
  }
};

export const addCommentReply = async (
  itemId: string,
  commentId: string,
  userId: string,
  text: string,
  userName: string,
  userAvatar: string,
) => {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);
    const comments = itemSnap.data()?.comments || [];
    const updatedComments = comments.map((comment: any) => {
      if (comment.id === commentId) {
        return {
          ...comment,
          replies: [
            ...(comment.replies || []),
            {
              id: Date.now().toString(),
              userId,
              userName,
              userAvatar,
              text,
              createdAt: new Date(),
            },
          ],
        };
      }
      return comment;
    });
    await updateDoc(itemRef, { comments: updatedComments });
  } catch (error) {
    console.error("Error adding comment reply:", error);
    throw error;
  }
};

export const updateItemSave = async (
  itemId: string,
  userId: string,
  isSaving: boolean,
) => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("User not found");
    const currentSavedCount = userSnap.data()?.savedCount || 0;
    const newSavedCount = isSaving
      ? currentSavedCount + 1
      : Math.max(0, currentSavedCount - 1);
    if (isSaving) {
      await updateDoc(userRef, {
        savedItems: arrayUnion(itemId),
        savedCount: newSavedCount,
      });
    } else {
      await updateDoc(userRef, {
        savedItems: arrayRemove(itemId),
        savedCount: newSavedCount,
      });
    }
  } catch (error) {
    console.error("Error updating save:", error);
    throw error;
  }
};

export const getUserSavedItems = async (userId: string) => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const savedItemIds = userSnap.data()?.savedItems || [];
      if (savedItemIds.length === 0) return [];
      const items = await getAllItems();
      return items.filter((item) => savedItemIds.includes(item.id));
    }
    return [];
  } catch (error) {
    console.error("Error getting saved items:", error);
    throw error;
  }
};

export const getUserPostedItems = async (userId: string) => {
  try {
    const querySnapshot = await getDocsFromServer(collection(db, "items"));
    // Intentionally includes traded items so the owner sees their full history.
    // Excludes hard-deleted items — those are gone everywhere.
    const userItems = querySnapshot.docs
      .filter((doc) => doc.data().ownerId === userId && !doc.data().isDeleted)
      .map((doc) => ({ id: doc.id, ...doc.data() }));
    return userItems;
  } catch (error) {
    console.error("Error getting user's posted items:", error);
    throw error;
  }
};
