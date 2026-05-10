import { collection, getDocs, limit, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';
import {
    getPersonalizedSuggestions,
    getTrendingItems,
    TrendingItem,
} from '../services/trendingService';

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
  views?: number;
  viewedBy?: string[];
  createdAt?: any;
  trendingScore?: number;
}

export const useItems = (type: 'trending' | 'all' | 'personalized' = 'all') => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        console.log("📡 BarterBayan: Attempting to connect to Firestore...");
        let fetchedItems: TrendingItem[] = [];

        if (type === 'trending') {
          // Fetch trending items using the new algorithm
          fetchedItems = await getTrendingItems(10);
        } else if (type === 'personalized') {
          // Fetch personalized suggestions for logged-in user
          const currentUser = auth.currentUser;
          if (currentUser) {
            fetchedItems = await getPersonalizedSuggestions(currentUser.uid, 10);
          } else {
            // Fallback to trending if not logged in
            fetchedItems = await getTrendingItems(10);
          }
        } else {
          // Fetch all items
          const itemsRef = collection(db, 'items');
          const q = query(itemsRef, limit(10));
          const snapshot = await getDocs(q);

          fetchedItems = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title,
              category: data.category,
              images: data.images || (data.image ? [data.image] : []),
              image: data.image,
              ownerId: data.ownerId,
              likes: data.likes || 0,
              likedBy: data.likedBy || [],
              description: data.description,
              views: data.views || 0,
              viewedBy: data.viewedBy || [],
              createdAt: data.createdAt,
            };
          });
        }

        console.log("✅ Connection Successful! Documents found:", fetchedItems.length);

        if (fetchedItems.length === 0) {
          console.warn("⚠️ Connected, but no items found.");
        }

        const formattedItems = fetchedItems.map(item => ({
          id: item.id,
          title: item.title,
          category: item.category,
          image: item.image,
          images: item.images,
          isTrending: type === 'trending',
          ownerId: item.ownerId,
          likes: item.likes || 0,
          likedBy: item.likedBy || [],
          description: item.description,
          views: item.views || 0,
          viewedBy: item.viewedBy || [],
          createdAt: item.createdAt,
          trendingScore: item.trendingScore,
        } as Item));

        setItems(formattedItems);
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