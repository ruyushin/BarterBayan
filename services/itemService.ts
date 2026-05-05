import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
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