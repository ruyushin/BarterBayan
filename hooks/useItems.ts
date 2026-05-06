import { collection, getDocs, limit, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebaseConfig'; // Adjust path if needed

// Define the shape of your data
export interface Item {
  id: string;
  title: string;
  category: string;
  image?: string; // Single image (for backward compatibility)
  images?: string[]; // Multiple images
  isTrending?: boolean;
  ownerId: string;
  likes?: number;
  likedBy?: string[]; // Array of user IDs who liked this item
  description?: string;
}

export const useItems = (type: 'trending' | 'all' = 'all') => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const fetchItems = async () => {
    try {
      console.log("📡 BarterBayan: Attempting to connect to Firestore...");
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, limit(10));

      const snapshot = await getDocs(q);
      
      // THIS IS THE CHECK:
      console.log("✅ Connection Successful! Documents found:", snapshot.size);
      
      if (snapshot.empty) {
        console.warn("⚠️ Connected, but the 'items' collection is empty.");
      }

      const fetchedItems = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          category: data.category,
          image: data.image, // Keep for backward compatibility
          images: data.images || (data.image ? [data.image] : []), // Convert single to array
          isTrending: data.isTrending,
          ownerId: data.ownerId,
          likes: data.likes || 0,
          likedBy: data.likedBy || [],
          description: data.description,
        } as Item;
      });

      setItems(fetchedItems);
    } catch (error) {
      // If this runs, there is a connection or permission error
      console.error("❌ Firebase Connection Failed:", error);
    } finally {
      setLoading(false);
    }
  };

  fetchItems();
}, [type]);

  return { items, loading };
};