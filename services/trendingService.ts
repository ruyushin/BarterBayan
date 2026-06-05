import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface TrendingItem {
  id: string;
  title: string;
  category: string;
  condition?: string;
  description?: string;
  images?: string[];
  image?: string;
  ownerId: string;
  likes: number;
  likedBy: string[];
  createdAt?: any;
  views?: number;
  viewedBy?: string[];
  trendingScore?: number;
}

export interface UserActivity {
  userId: string;
  likedItems: string[];
  viewedItems: string[];
  categoryPreferences: { [key: string]: number };
  lastViewedCategories: string[];
}

/**
 * Calculate trending score for an item based on multiple factors
 */
export const calculateTrendingScore = (item: TrendingItem): number => {
  let score = 0;

  // Likes (weighted: 40%)
  const likesScore = (item.likes || 0) * 40;
  score += likesScore;

  // Recency (weighted: 30%)
  const createdAt = item.createdAt?.toDate?.() || new Date(item.createdAt);
  const daysSinceCreation = Math.max(
    0,
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const recencyScore = Math.max(0, 30 - daysSinceCreation * 1.5);
  score += recencyScore;

  // Views (weighted: 20%)
  const viewsScore = (item.views || 0) * 5;
  score += viewsScore;

  // Popularity multiplier
  const engagementRate = (item.likes || 0) + (item.views || 0) / 100;
  if (engagementRate > 10) {
    score *= 1.2;
  }

  return Math.round(score);
};

/**
 * Get trending items sorted by trending score
 */
export const getTrendingItems = async (limit_: number = 20): Promise<TrendingItem[]> => {
  try {
    const itemsRef = collection(db, 'items');
    const snapshot = await getDocs(itemsRef);

    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        category: data.category,
        condition: data.condition,
        description: data.description,
        images: data.images,
        image: data.image,
        ownerId: data.ownerId,
        likes: data.likes || 0,
        likedBy: data.likedBy || [],
        createdAt: data.createdAt,
        views: data.views || 0,
        viewedBy: data.viewedBy || [],
      } as TrendingItem;
    });

    const itemsWithScores = items.map(item => ({
      ...item,
      trendingScore: calculateTrendingScore(item),
    }));

    return itemsWithScores
      .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
      .slice(0, limit_);
  } catch (error) {
    console.error('Error fetching trending items:', error);
    throw error;
  }
};

/**
 * Track item view by user
 */
export const trackItemView = async (
  itemId: string,
  userId: string
): Promise<void> => {
  try {
    const itemRef = doc(db, 'items', itemId);
    const itemSnap = await getDoc(itemRef);

    if (itemSnap.exists()) {
      const data = itemSnap.data();
      const viewedBy = data.viewedBy || [];
      const views = data.views || 0;

      if (!viewedBy.includes(userId)) {
        await updateDoc(itemRef, {
          viewedBy: arrayUnion(userId),
          views: views + 1,
        });
      }

      await trackUserActivity(userId, 'view', itemId, data.category);
    }
  } catch (error) {
    console.error('Error tracking item view:', error);
  }
};

/**
 * Track user activity (views, likes, searches)
 */
export const trackUserActivity = async (
  userId: string,
  activityType: 'view' | 'like' | 'search',
  itemId?: string,
  category?: string
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);

    if (activityType === 'view' && itemId) {
      await updateDoc(userRef, {
        viewedItems: arrayUnion(itemId),
        lastViewedAt: new Date(),
      });

      if (category) {
        await updateDoc(userRef, {
          [`categoryPreferences.${category}`]: (await getDoc(userRef)).data()
            ?.categoryPreferences?.[category] + 1 || 1,
        });
      }
    } else if (activityType === 'like' && itemId) {
      await updateDoc(userRef, {
        likedItems: arrayUnion(itemId),
        lastLikedAt: new Date(),
      });
    }
  } catch (error) {
    console.error('Error tracking user activity:', error);
  }
};

/**
 * Get personalized suggestions based on user activity
 */
export const getPersonalizedSuggestions = async (
  userId: string,
  limit_: number = 10
): Promise<TrendingItem[]> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return getTrendingItems(limit_);
    }

    const userData = userSnap.data();
    const likedItems = userData.likedItems || [];
    const viewedItems = userData.viewedItems || [];
    const categoryPreferences = userData.categoryPreferences || {};

    const itemsRef = collection(db, 'items');
    const snapshot = await getDocs(itemsRef);

    const allItems = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        category: data.category,
        condition: data.condition,
        description: data.description,
        images: data.images,
        image: data.image,
        ownerId: data.ownerId,
        likes: data.likes || 0,
        likedBy: data.likedBy || [],
        createdAt: data.createdAt,
        views: data.views || 0,
        viewedBy: data.viewedBy || [],
      } as TrendingItem;
    });

    const unseenItems = allItems.filter(
      item => !likedItems.includes(item.id) && !viewedItems.includes(item.id)
    );

    const scoredItems = unseenItems.map(item => {
      let personalScore = calculateTrendingScore(item);

      const categoryBoost = (categoryPreferences[item.category] || 0) * 5;
      personalScore += categoryBoost;

      const topCategories = Object.entries(categoryPreferences)
        .sort((a, b) => (b as any)[1] - (a as any)[1])
        .slice(0, 3)
        .map(([cat]) => cat);

      if (topCategories.includes(item.category)) {
        personalScore *= 1.3;
      }

      return {
        ...item,
        trendingScore: personalScore,
      };
    });

    return scoredItems
      .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
      .slice(0, limit_);
  } catch (error) {
    console.error('Error getting personalized suggestions:', error);
    return getTrendingItems(limit_);
  }
};

/**
 * Get similar items based on a specific item
 */
export const getSimilarItems = async (
  itemId: string,
  limit_: number = 5
): Promise<TrendingItem[]> => {
  try {
    const itemRef = doc(db, 'items', itemId);
    const itemSnap = await getDoc(itemRef);

    if (!itemSnap.exists()) {
      return [];
    }

    const baseItem = itemSnap.data();
    const baseCategory = baseItem.category;

    const itemsRef = collection(db, 'items');
    const snapshot = await getDocs(itemsRef);

    const similarItems = snapshot.docs
      .filter(doc => {
        const data = doc.data();
        return data.category === baseCategory && doc.id !== itemId;
      })
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          category: data.category,
          condition: data.condition,
          description: data.description,
          images: data.images,
          image: data.image,
          ownerId: data.ownerId,
          likes: data.likes || 0,
          likedBy: data.likedBy || [],
          createdAt: data.createdAt,
          views: data.views || 0,
          viewedBy: data.viewedBy || [],
          trendingScore: calculateTrendingScore({
            id: doc.id,
            title: data.title,
            category: data.category,
            likes: data.likes || 0,
            likedBy: data.likedBy || [],
            views: data.views || 0,
            viewedBy: data.viewedBy || [],
            createdAt: data.createdAt,
          } as TrendingItem),
        };
      });

    return similarItems
      .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
      .slice(0, limit_);
  } catch (error) {
    console.error('Error getting similar items:', error);
    return [];
  }
};