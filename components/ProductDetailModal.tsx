import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { LongPressGestureHandler, State } from 'react-native-gesture-handler';
import { auth } from '../firebaseConfig';
import { getUserInfo, updateItemLikes } from '../services/itemService';

interface ProductDetailModalProps {
  visible: boolean;
  item: any;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  visible,
  item,
  onClose,
}) => {
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUser] = useState(auth.currentUser?.uid);

  // Get images array - support both single image and multiple images
  const images = Array.isArray(item?.images) ? item.images : item?.image ? [item.image] : [];

  useEffect(() => {
    if (visible && item?.ownerId) {
      loadOwnerInfo();
      checkIfLiked();
    }
  }, [visible, item]);

  const loadOwnerInfo = async () => {
    try {
      const info = await getUserInfo(item.ownerId);
      setOwnerInfo(info);
    } catch (error) {
      console.error('Error loading owner info:', error);
    }
  };

  const checkIfLiked = () => {
    if (currentUser && item?.likedBy?.includes(currentUser)) {
      setIsLiked(true);
    } else {
      setIsLiked(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert('Please log in', 'You must be logged in to like items');
      return;
    }

    try {
      setLoading(true);
      await updateItemLikes(item.id, currentUser, !isLiked);
      setIsLiked(!isLiked);
    } catch (error) {
      Alert.alert('Error', 'Failed to update like status');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImage = async () => {
    try {
      const currentImage = images[currentImageIndex];
      if (!currentImage) return;

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Camera roll permission is required');
        return;
      }

      const filename = `BarterBayan_${Date.now()}.jpg`;
      const result = await FileSystem.downloadAsync(
        currentImage,
        FileSystem.documentDirectory + filename
      );

      await MediaLibrary.saveToLibraryAsync(result.uri);
      Alert.alert('Success', 'Image saved to your gallery');
    } catch (error) {
      Alert.alert('Error', 'Failed to save image');
      console.error('Error saving image:', error);
    }
  };

  const handleSendMessage = () => {
    router.push({
      pathname: '/chat',
      params: {
        ownerUserId: item.ownerId,
        itemId: item.id,
        itemTitle: item.title,
        fromModal: 'true',
      },
    });
    onClose();
  };

  const handleImageLongPress = (nativeEvent: any) => {
    if (nativeEvent.state === State.ACTIVE) {
      handleSaveImage();
    }
  };

  const renderImageCarousel = () => (
    <View style={styles.carouselContainer}>
      <FlatList
        ref={(ref) => {
          // Auto-scroll to current image if needed
        }}
        horizontal
        pagingEnabled
        scrollEnabled={images.length > 1}
        showsHorizontalScrollIndicator={false}
        data={images}
        keyExtractor={(_, index) => `image-${index}`}
        renderItem={({ item: imageUrl }) => (
          <LongPressGestureHandler
            onHandlerStateChange={({ nativeEvent }) => handleImageLongPress(nativeEvent)}
            minDurationMs={500}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.imageWrapper}
              onPress={() => setIsFullscreen(true)}
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.carouselImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </LongPressGestureHandler>
        )}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(
            event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width
          );
          setCurrentImageIndex(index);
        }}
      />
      {images.length > 1 && (
        <View style={styles.pagination}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.paginationDot,
                index === currentImageIndex && styles.paginationDotActive,
              ]}
            />
          ))}
          <Text style={styles.paginationText}>
            {currentImageIndex + 1} / {images.length}
          </Text>
        </View>
      )}
      <Text style={styles.holdToSave}>Hold image to save</Text>
    </View>
  );

  const modalContent = (
    <View style={styles.container}>
      {/* Header with close button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#2e2d7c" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        <TouchableOpacity
          onPress={() => setIsFullscreen(!isFullscreen)}
          style={styles.expandButton}
        >
          <Ionicons
            name={isFullscreen ? 'contract' : 'expand'}
            size={24}
            color="#2e2d7c"
          />
        </TouchableOpacity>
      </View>

      {/* Image Carousel */}
      {renderImageCarousel()}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Product Info */}
        <View style={styles.productInfo}>
          <Text style={styles.title}>{item?.title}</Text>
          <Text style={styles.category}>{item?.category}</Text>

          {item?.description && (
            <Text style={styles.description}>{item.description}</Text>
          )}
        </View>

        {/* Owner Info */}
        {ownerInfo && (
          <View style={styles.ownerCard}>
            <View style={styles.ownerHeader}>
              <Image
                source={{ uri: ownerInfo.avatarUrl }}
                style={styles.ownerAvatar}
              />
              <View style={styles.ownerDetails}>
                <Text style={styles.ownerName}>{ownerInfo.username}</Text>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={14} color="#FFB800" />
                  <Text style={styles.rating}>{ownerInfo.rating?.toFixed(1) || 'N/A'}</Text>
                  <Text style={styles.tradeCount}>
                    ({ownerInfo.tradeCount || 0} trades)
                  </Text>
                </View>
              </View>
            </View>
            {ownerInfo.bio && <Text style={styles.bio}>{ownerInfo.bio}</Text>}
          </View>
        )}

        {/* Like Button */}
        <TouchableOpacity
          style={[styles.likeButton, isLiked && styles.likeButtonActive]}
          onPress={handleLike}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={20}
                color={isLiked ? '#fff' : '#2e2d7c'}
              />
              <Text
                style={[
                  styles.likeButtonText,
                  isLiked && styles.likeButtonTextActive,
                ]}
              >
                {item?.likes || 0} Likes
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Message Button */}
        <TouchableOpacity
          style={styles.messageButton}
          onPress={handleSendMessage}
        >
          <Ionicons name="send" size={20} color="#fff" />
          <Text style={styles.messageButtonText}>Send Owner a Message</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (isFullscreen) {
    return (
      <Modal
        visible={visible && isFullscreen}
        transparent={false}
        animationType="fade"
      >
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity
            style={styles.fullscreenCloseButton}
            onPress={() => setIsFullscreen(false)}
          >
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          {renderImageCarousel()}
          <View style={styles.fullscreenBottom}>
            <TouchableOpacity
              style={styles.fullscreenMessageButton}
              onPress={handleSendMessage}
            >
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.fullscreenMessageText}>Message Owner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>{modalContent}</View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 50,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  } as ViewStyle,
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2e2d7c',
  } as TextStyle,
  closeButton: {
    padding: 8,
  } as ViewStyle,
  expandButton: {
    padding: 8,
  } as ViewStyle,
  carouselContainer: {
    height: 300,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  } as ViewStyle,
  imageWrapper: {
    width: '100%',
    height: '100%',
  } as ViewStyle,
  carouselImage: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  } as ViewStyle,
  paginationDotActive: {
    backgroundColor: '#fff',
    width: 24,
  } as ViewStyle,
  paginationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  } as TextStyle,
  holdToSave: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,
  content: {
    flex: 1,
  } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  } as ViewStyle,
  productInfo: {
    gap: 8,
  } as ViewStyle,
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  } as TextStyle,
  category: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  } as TextStyle,
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginTop: 8,
  } as TextStyle,
  ownerCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  } as ViewStyle,
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  ownerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  } as ImageStyle,
  ownerDetails: {
    flex: 1,
  } as ViewStyle,
  ownerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  } as TextStyle,
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  } as ViewStyle,
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFB800',
  } as TextStyle,
  tradeCount: {
    fontSize: 13,
    color: '#6B7280',
  } as TextStyle,
  bio: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  } as TextStyle,
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  } as ViewStyle,
  likeButtonActive: {
    backgroundColor: '#2e2d7c',
  } as ViewStyle,
  likeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e2d7c',
  } as TextStyle,
  likeButtonTextActive: {
    color: '#fff',
  } as TextStyle,
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2e2d7c',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 20,
  } as ViewStyle,
  messageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  } as TextStyle,
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  fullscreenCloseButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    padding: 8,
  } as ViewStyle,
  fullscreenBottom: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  } as ViewStyle,
  fullscreenMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2e2d7c',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  } as ViewStyle,
  fullscreenMessageText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  } as TextStyle,
});
