import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ... your existing addItem and getItemsByCategory functions ...

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