import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  Platform,
  Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../utils/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useAuth } from '../context/AuthContext';
import { db, auth, storage } from '../config/firebaseConfig';
import { collection, query, getDocs, doc, updateDoc, where, orderBy } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { format } from 'date-fns';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import ReactNativeZoomableView from '@dudigital/react-native-zoomable-view/src/ReactNativeZoomableView';
import * as Sharing from 'expo-sharing';
import type { StackNavigationProp } from '@react-navigation/stack';

// Type definitions
type Comment = {
  author: string;
  createdAt: string;
  text: string;
};

type Receipt = {
  id: string;
  imageUrl: string;
  status: 'pending' | 'approved' | 'rejected' | 'initiated';
  createdAt: string;
  createdBy?: string;
  userName?: string;
  userEmail?: string;
  company?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  comments?: Comment[];
  initiatedBy?: string | null;
  initiatedAt?: string | null;
};

type FinanceOfficerScreenProps = {
  navigation: StackNavigationProp<any>; // Replace 'any' with your stack param list if you have one
};

type SwipeableRef = {
  close: () => void;
};

export default function FinanceOfficerScreen({ navigation }: FinanceOfficerScreenProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<Receipt | null>(null);
  const [showImagePreview, setShowImagePreview] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [showCommentModal, setShowCommentModal] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'approve' | 'decline' | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isImageZoomed, setIsImageZoomed] = useState<boolean>(false);
  
  const { userData, logout } = useAuth();
  const swipeableRefs = useRef<{[key: string]: Swipeable | null}>({});

  useEffect(() => {
    fetchReceipts();
  }, [selectedFilter]);

  const fetchReceipts = async () => {
    if (!auth.currentUser) {
      Alert.alert("Error", "User not authenticated. Please log in again.");
      setIsLoading(false);
      setRefreshing(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const receiptsRef = collection(db, 'receipts');
      
      // Build the query based on the selected filter
      let q;
      
      if (selectedFilter === 'all') {
        q = query(receiptsRef, orderBy("createdAt", "desc"));
      } else {
        q = query(
          receiptsRef,
          where("status", "==", selectedFilter),
          orderBy("createdAt", "desc")
        );
      }
      
      const querySnapshot = await getDocs(q);
      const receiptsList: Receipt[] = [];
      console.log(querySnapshot)
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<Receipt, 'id'>;
        // Only push if company matches
        if (data.company && data.company === userData?.company) {
          receiptsList.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      console.log('Fetched receipts:', receiptsList);
      setReceipts(receiptsList);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      Alert.alert("Error", "Could not load receipts. Please try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchReceipts();
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'AuthLoading' }],
      });
    } catch (err) {
      console.error("Logout error:", err);
      Alert.alert("Error", "Failed to log out. Please try again.");
    }
  };

  const navigateToProfile = () => {
    navigation.navigate('Profile');
  };

  const handleFilterChange = (filter: string) => {
    setSelectedFilter(filter);
  };

  const viewReceiptDetails = (receipt: Receipt) => {
    setSelectedImage(receipt);
    setShowImagePreview(true);
  };

  const approveReceipt = async (receiptId: string, comment: string) => {
    if (!auth.currentUser || !userData) {
      Alert.alert("Error", "User not authenticated. Please log in again.");
      return;
    }

    try {
      setIsLoading(true);
      const receiptRef = doc(db, 'receipts', receiptId);
      
      const currentDate = new Date().toISOString();
      const newComment = {
        author: userData.name || auth.currentUser.email || 'Finance Officer',
        text: comment,
        createdAt: currentDate
      };
      
      const selectedReceipt = receipts.find(r => r.id === receiptId);
      const updatedComments = selectedReceipt?.comments ? [...selectedReceipt.comments, newComment] : [newComment];
      
      await updateDoc(receiptRef, {
        status: 'approved',
        approvedBy: userData.name || auth.currentUser.email,
        approvedAt: currentDate,
        comments: updatedComments
      });
      
      // Update local state
      setReceipts(prevReceipts => 
        prevReceipts.map(receipt => 
          receipt.id === receiptId 
            ? { 
                ...receipt, 
                status: 'approved', 
                approvedBy: userData.name || auth.currentUser.email,
                approvedAt: currentDate,
                comments: updatedComments
              } 
            : receipt
        )
      );
      
      Alert.alert("Success", "Receipt has been approved");
    } catch (error) {
      console.error("Error approving receipt:", error);
      Alert.alert("Error", "Failed to approve receipt. Please try again.");
    } finally {
      setIsLoading(false);
      setShowCommentModal(false);
      setCommentText('');
      setActionType(null);
    }
  };

  const rejectReceipt = async (receiptId: string, reason: string) => {
    if (!auth.currentUser || !userData) {
      Alert.alert("Error", "User not authenticated. Please log in again.");
      return;
    }

    try {
      setIsLoading(true);
      const receiptRef = doc(db, 'receipts', receiptId);
      
      const currentDate = new Date().toISOString();
      const newComment = {
        author: userData.name || auth.currentUser.email || 'Finance Officer',
        text: reason,
        createdAt: currentDate
      };
      
      const selectedReceipt = receipts.find(r => r.id === receiptId);
      const updatedComments = selectedReceipt?.comments ? [...selectedReceipt.comments, newComment] : [newComment];
      
      await updateDoc(receiptRef, {
        status: 'rejected',
        rejectedReason: reason,
        approvedBy: null,
        approvedAt: null,
        comments: updatedComments
      });
      
      // Update local state
      setReceipts(prevReceipts => 
        prevReceipts.map(receipt => 
          receipt.id === receiptId 
            ? { 
                ...receipt, 
                status: 'rejected', 
                rejectedReason: reason,
                approvedBy: null,
                approvedAt: null,
                comments: updatedComments
              } 
            : receipt
        )
      );
      
      Alert.alert("Success", "Receipt has been rejected");
    } catch (error) {
      console.error("Error rejecting receipt:", error);
      Alert.alert("Error", "Failed to reject receipt. Please try again.");
    } finally {
      setIsLoading(false);
      setShowCommentModal(false);
      setCommentText('');
      setActionType(null);
    }
  };

  const handleAction = (receipt: Receipt, type: 'approve' | 'decline') => {
    setSelectedImage(receipt);
    setActionType(type);
    setShowCommentModal(true);
  };

  const submitAction = () => {
    if (!selectedImage) return;
    
    if (actionType === 'approve') {
      approveReceipt(selectedImage.id, commentText);
    } else if (actionType === 'decline') {
      rejectReceipt(selectedImage.id, commentText);
    }
  };

  const downloadReceipt = async (imageUrl: string) => {
    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need permission to save images to your device');
        return;
      }

      setIsDownloading(true);
      setDownloadProgress(0);

      // Generate a filename
      const filename = `receipt-${Date.now()}.jpg`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Download the file
      const downloadResumable = FileSystem.createDownloadResumable(
        imageUrl,
        fileUri,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(progress * 100);
        }
      );

      const { uri } = await downloadResumable.downloadAsync();

      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('Receipts', asset, false);

      setIsDownloading(false);
      Alert.alert('Success', 'Receipt saved to your gallery');
    } catch (error) {
      console.error('Error downloading receipt:', error);
      setIsDownloading(false);
      Alert.alert('Error', 'Failed to download receipt');
    }
  };

  const shareReceipt = async (imageUrl: string) => {
    try {
      // First download the image
      const filename = `receipt-${Date.now()}.jpg`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        imageUrl,
        fileUri
      );
      
      const { uri } = await downloadResumable.downloadAsync();
      
      // Check if sharing is available
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing not available', 'Sharing is not available on this device');
        return;
      }
      
      // Share the file
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Error sharing receipt:', error);
      Alert.alert('Error', 'Failed to share receipt');
    }
  };

  const renderActionButtons = () => {
    if (!selectedImage) return null;
    
    return (
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => downloadReceipt(selectedImage.imageUrl)}
        >
          <MaterialCommunityIcons name="download" size={24} color="white" />
          <Text style={styles.actionButtonText}>Download</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => shareReceipt(selectedImage.imageUrl)}
        >
          <MaterialCommunityIcons name="share-variant" size={24} color="white" />
          <Text style={styles.actionButtonText}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSwipeActions = (
    receipt: Receipt, 
    dragX: Animated.AnimatedInterpolation<number>, 
    type: 'left' | 'right'
  ) => {
    const trans = dragX.interpolate({
      inputRange: [0, 50, 100, 101],
      outputRange: [-20, 0, 0, 1],
    });
    
    const isLeft = type === 'left';
    
    return (
      <TouchableOpacity
        style={[
          styles.swipeAction,
          isLeft ? styles.leftSwipeAction : styles.rightSwipeAction
        ]}
        onPress={() => {
          if (isLeft) {
            handleAction(receipt, 'decline');
          } else {
            handleAction(receipt, 'approve');
          }
          swipeableRefs.current[receipt.id]?.close();
        }}
      >
        <Animated.View style={{ transform: [{ translateX: trans }] }}>
          <MaterialCommunityIcons
            name={isLeft ? "close" : "check"}
            size={24}
            color="white"
          />
          <Text style={styles.swipeActionText}>
            {isLeft ? "Decline" : "Approve"}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderCommentModal = () => (
    <Modal
      visible={showCommentModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowCommentModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.commentModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {actionType === 'approve' ? 'Approve Receipt' : 'Decline Receipt'}
            </Text>
            <TouchableOpacity onPress={() => setShowCommentModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.commentLabel}>
            {actionType === 'approve' 
              ? 'Add a comment (optional)' 
              : 'Please provide a reason for declining'}
          </Text>
          
          <TextInput
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder={actionType === 'approve' 
              ? "Add your comment here..." 
              : "Reason for declining..."}
            multiline
            numberOfLines={4}
          />
          
          <TouchableOpacity 
            style={[
              styles.commentSubmitButton,
              actionType === 'decline' && !commentText.trim() 
                ? styles.disabledButton 
                : (actionType === 'approve' ? styles.approveButton : styles.declineButton)
            ]}
            disabled={actionType === 'decline' && !commentText.trim()}
            onPress={submitAction}
          >
            <Text style={styles.buttonText}>
              {actionType === 'approve' ? 'Approve' : 'Decline'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderImagePreviewModal = () => (
    <Modal
      visible={showImagePreview}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowImagePreview(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Receipt Details</Text>
            <TouchableOpacity onPress={() => setShowImagePreview(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          
          {selectedImage && (
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.imageZoomContainer}>
                <ReactNativeZoomableView
                  maxZoom={3}
                  minZoom={1}
                  zoomStep={0.5}
                  initialZoom={1}
                  bindToBorders={true}
                  onZoomAfter={() => setIsImageZoomed(true)}
                  onZoomBefore={() => setIsImageZoomed(false)}
                  style={styles.zoomableView}
                >
                  <Image 
                    source={{ uri: selectedImage.imageUrl }} 
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                </ReactNativeZoomableView>
              </View>
              
              {renderActionButtons()}
              
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <View style={[
                    styles.statusBadge,
                    selectedImage.status === 'approved' 
                      ? styles.approvedBadge 
                      : selectedImage.status === 'rejected' 
                        ? styles.rejectedBadge 
                        : styles.pendingBadge
                  ]}>
                    <Text style={styles.statusText}>{selectedImage.status}</Text>
                  </View>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Submitted by:</Text>
                  <Text style={styles.detailValue}>{selectedImage.userName || 'Unknown'}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Company:</Text>
                  <Text style={styles.detailValue}>{selectedImage.company || 'Unknown'}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Submitted:</Text>
                  <Text style={styles.detailValue}>
                    {format(new Date(selectedImage.createdAt), 'PPP p')}
                  </Text>
                </View>
                
                {selectedImage.initiatedBy && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Initiated by:</Text>
                    <Text style={styles.detailValue}>{selectedImage.initiatedBy}</Text>
                  </View>
                )}
                
                {selectedImage.initiatedAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Initiated on:</Text>
                    <Text style={styles.detailValue}>
                      {format(new Date(selectedImage.initiatedAt), 'PPP p')}
                    </Text>
                  </View>
                )}
                
                {selectedImage.rejectedReason && (
                  <View style={styles.commentBox}>
                    <Text style={styles.commentTitle}>Reason for Rejection:</Text>
                    <Text style={styles.commentText}>{selectedImage.rejectedReason}</Text>
                  </View>
                )}
                
                {selectedImage.comments && selectedImage.comments.length > 0 && (
                  <View style={styles.commentsSection}>
                    <Text style={styles.commentsSectionTitle}>Comments:</Text>
                    {selectedImage.comments.map((comment, index) => (
                      <View key={index} style={styles.commentBox}>
                        <View style={styles.commentHeader}>
                          <Text style={styles.commentAuthor}>{comment.author}</Text>
                          <Text style={styles.commentDate}>
                            {format(new Date(comment.createdAt), 'PPp')}
                          </Text>
                        </View>
                        <Text style={styles.commentText}>{comment.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                {selectedImage.status === 'pending' && (
                  <View style={styles.detailActionButtons}>
                    <TouchableOpacity
                      style={[styles.detailActionButton, styles.rejectButton]}
                      onPress={() => {
                        setShowImagePreview(false);
                        setTimeout(() => handleAction(selectedImage, 'decline'), 300);
                      }}
                    >
                      <MaterialCommunityIcons name="close" size={20} color="white" />
                      <Text style={styles.detailActionButtonText}>Decline</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.detailActionButton, styles.approveButton]}
                      onPress={() => {
                        setShowImagePreview(false);
                        setTimeout(() => handleAction(selectedImage, 'approve'), 300);
                      }}
                    >
                      <MaterialCommunityIcons name="check" size={20} color="white" />
                      <Text style={styles.detailActionButtonText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderDownloadProgress = () => (
    <Modal visible={isDownloading} transparent={true} animationType="fade">
      <View style={styles.progressModal}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressTitle}>Downloading Receipt...</Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${downloadProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(downloadProgress)}%</Text>
        </View>
      </View>
    </Modal>
  );

  const renderReceiptItem = (receipt: Receipt) => {
    return (
      <Swipeable
        ref={ref => {
          if (ref && receipt.id) {
            swipeableRefs.current[receipt.id] = ref;
          }
        }}
        renderLeftActions={(progress, dragX) => 
          receipt.status === 'pending' ? renderSwipeActions(receipt, dragX, 'left') : null
        }
        renderRightActions={(progress, dragX) => 
          receipt.status === 'pending' ? renderSwipeActions(receipt, dragX, 'right') : null
        }
        overshootLeft={false}
        overshootRight={false}
        key={receipt.id}
      >
        <TouchableOpacity 
          style={styles.receiptItem}
          onPress={() => viewReceiptDetails(receipt)}
        >
          <View style={styles.receiptContent}>
            <Image source={{ uri: receipt.imageUrl }} style={styles.receiptThumbnail} />
            <View style={styles.receiptInfo}>
              <Text style={styles.receiptDate}>
                {format(new Date(receipt.createdAt), 'PP')}
              </Text>
              <Text style={styles.receiptUser}>
                From: {receipt.userName || 'Unknown'}
              </Text>
              <Text style={styles.receiptCompany}>
                {receipt.company || 'Unknown'}
              </Text>
              <View style={[
                styles.statusBadge,
                receipt.status === 'approved' 
                  ? styles.approvedBadge 
                  : receipt.status === 'rejected' 
                    ? styles.rejectedBadge 
                    : styles.pendingBadge
              ]}>
                <Text style={styles.statusText}>{receipt.status}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Finance Officer</Text>
          <Text style={styles.subtitle}>{userData?.name || 'User'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('VoucherScreen')}>
            <MaterialCommunityIcons name="file-document" size={24} color={theme.colors.primary} />
            <Text style={styles.headerButtonText}>Voucher</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('ActivityScreen')}>
            <MaterialCommunityIcons name="history" size={24} color={theme.colors.primary} />
            <Text style={styles.headerButtonText}>Activity</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={navigateToProfile}>
            <MaterialCommunityIcons name="account" size={24} color={theme.colors.primary} />
            <Text style={styles.headerButtonText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={24} color={theme.colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>Filter by Status:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <TouchableOpacity 
            style={[styles.filterChip, selectedFilter === 'all' && styles.activeFilterChip]}
            onPress={() => handleFilterChange('all')}
          >
            <Text style={[styles.filterText, selectedFilter === 'all' && styles.activeFilterText]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, selectedFilter === 'pending' && styles.activeFilterChip]}
            onPress={() => handleFilterChange('pending')}
          >
            <Text style={[styles.filterText, selectedFilter === 'pending' && styles.activeFilterText]}>
              Pending
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, selectedFilter === 'approved' && styles.activeFilterChip]}
            onPress={() => handleFilterChange('approved')}
          >
            <Text style={[styles.filterText, selectedFilter === 'approved' && styles.activeFilterText]}>
              Approved
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, selectedFilter === 'rejected' && styles.activeFilterChip]}
            onPress={() => handleFilterChange('rejected')}
          >
            <Text style={[styles.filterText, selectedFilter === 'rejected' && styles.activeFilterText]}>
              Rejected
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading receipts...</Text>
        </View>
      ) : receipts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons 
            name="receipt" 
            size={64} 
            color={theme.colors.textLight} 
          />
          <Text style={styles.emptyText}>No receipts found</Text>
          <Text style={styles.emptySubtext}>
            {selectedFilter !== 'all' 
              ? `No ${selectedFilter} receipts at the moment` 
              : 'No receipts to display yet'}
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.receiptList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
        >
          {receipts.map(renderReceiptItem)}
        </ScrollView>
      )}

      {renderImagePreviewModal()}
      {renderCommentModal()}
      {renderDownloadProgress()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    marginLeft: theme.spacing.xs,
  },
  filterContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: theme.spacing.sm,
    color: theme.colors.text,
  },
  filters: {
    flexDirection: 'row',
    paddingRight: theme.spacing.lg,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeFilterChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  activeFilterText: {
    color: 'white',
    fontWeight: '500',
  },
  receiptList: {
    flex: 1,
    padding: theme.spacing.md,
  },
  receiptItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  receiptContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 4,
    marginRight: theme.spacing.md,
  },
  receiptInfo: {
    flex: 1,
  },
  receiptDate: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 2,
  },
  receiptUser: {
    fontSize: 13,
    color: theme.colors.textLight,
    marginBottom: 2,
  },
  receiptCompany: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: theme.colors.warning + '30',
  },
  approvedBadge: {
    backgroundColor: theme.colors.success + '30',
  },
  rejectedBadge: {
    backgroundColor: theme.colors.error + '30',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textLight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: 'white',
    width: '100%',
    maxHeight: '90%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  modalScrollContent: {
    padding: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  previewImage: {
    width: '100%',
    height: 350,
    borderRadius: 8,
  },
  imageZoomContainer: {
    width: '100%',
    height: 350,
    marginBottom: theme.spacing.lg,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  zoomableView: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    marginTop: theme.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textLight,
  },
  detailValue: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
    textAlign: 'right',
  },
  commentsSection: {
    marginTop: theme.spacing.lg,
  },
  commentsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
    color: theme.colors.text,
  },
  commentBox: {
    backgroundColor: theme.colors.backgroundLight,
    padding: theme.spacing.md,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  commentTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
    color: theme.colors.text,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  commentDate: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  commentText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  detailActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  detailActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: 8,
    flex: 0.48,
  },
  rejectButton: {
    backgroundColor: theme.colors.error,
  },
  approveButton: {
    backgroundColor: theme.colors.success,
  },
  detailActionButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: theme.spacing.xs,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
  },
  leftSwipeAction: {
    backgroundColor: theme.colors.error,
  },
  rightSwipeAction: {
    backgroundColor: theme.colors.success,
  },
  swipeActionText: {
    color: 'white',
    fontWeight: '500',
    marginTop: 4,
  },
  commentModalContent: {
    backgroundColor: 'white',
    width: '100%',
    padding: theme.spacing.lg,
    borderRadius: 8,
  },
  commentLabel: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing.md,
    height: 120,
    textAlignVertical: 'top',
    fontSize: 16,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.backgroundLight,
  },
  commentSubmitButton: {
    padding: theme.spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: theme.colors.border,
  },
  declineButton: {
    backgroundColor: theme.colors.error,
  },
  buttonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 16,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    flex: 0.48,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: theme.spacing.xs,
  },
  progressModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    backgroundColor: 'white',
    padding: theme.spacing.lg,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: theme.spacing.md,
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: 5,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  progressText: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
  },
  headerButtonText: {
    marginLeft: 4,
    color: theme.colors.primary,
    fontWeight: '500',
    fontSize: 14,
  },
});