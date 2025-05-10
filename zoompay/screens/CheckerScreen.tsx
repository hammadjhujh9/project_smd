import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, 
  FlatList, Modal, TextInput, Image, Dimensions, RefreshControl, ScrollView, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db, auth, storage } from '../config/firebaseConfig';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  orderBy, addDoc, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { theme } from '../utils/theme';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

// Define types
interface Voucher {
  id: string;
  imageUrl: string;
  voucherUrl?: string;
  status: string;
  createdAt: string | Timestamp;
  userName?: string;
  userEmail?: string;
  company?: string;
  bankName?: string;
  accountNumber?: string;
  accountTitle?: string;
  description?: string;
  amount?: number;
  ticketNumber?: string;
  processedBy?: string;
  processedAt?: string;
  comments?: Comment[];
  rejectedReason?: string;
}

interface Comment {
  text: string;
  createdAt: string | Timestamp;
  createdBy: string;
  createdByName: string;
  role: string;
}

export default function CheckerScreen({ navigation }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [filteredVouchers, setFilteredVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [comment, setComment] = useState('');
  const [activeFilter, setActiveFilter] = useState('voucher_created');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'check' | 'reject' | null>(null);
  const { userData, logout } = useAuth();
  
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  
  // Status filters
  const filters = [
    { label: 'Pending Review', value: 'voucher_created' },
    { label: 'Checked', value: 'checked' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'All', value: 'all' }
  ];

  const statusColors = {
    voucher_created: theme.colors.warning,
    checked: theme.colors.success,
    rejected: theme.colors.error,
  };

  const statusText = {
    voucher_created: 'Pending Review',
    checked: 'Checked',
    rejected: 'Rejected',
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  useEffect(() => {
    if (vouchers.length > 0) {
      applyFilters();
    }
  }, [vouchers, activeFilter, searchQuery]);

  const fetchVouchers = async () => {
    setIsLoading(true);
    try {
      // Query vouchers that have been created by voucher creators and need checking
      const vouchersRef = collection(db, 'vouchers');
      
      // Get vouchers with status 'in_progress' (newly created, waiting for checker)
      const q = query(
        vouchersRef,
        where('status', 'in', ['voucher_created', 'checked', 'rejected']),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const voucherList: Voucher[] = [];
      
      snapshot.forEach(docSnapshot => {
        voucherList.push({
          id: docSnapshot.id,
          ...docSnapshot.data() as Omit<Voucher, 'id'>
        });
      });
      
      setVouchers(voucherList);
      
      // Apply initial filters
      applyFilters(voucherList);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      Alert.alert('Error', 'Failed to load vouchers. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = (voucherList = vouchers) => {
    let filtered = [...voucherList];
    
    // Apply status filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(voucher => voucher.status === activeFilter);
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        voucher => 
          (voucher.createdByName && voucher.createdByName.toLowerCase().includes(query)) ||
          (voucher.ticketNumber && voucher.ticketNumber.toLowerCase().includes(query)) ||
          (voucher.description && voucher.description.toLowerCase().includes(query)) ||
          (voucher.company && voucher.company.toLowerCase().includes(query)) ||
          (voucher.amount && voucher.amount.toString().includes(query)) ||
          (voucher.bankName && voucher.bankName.toLowerCase().includes(query))
      );
    }
    
    setFilteredVouchers(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchVouchers();
  };
  
  const handleSelectVoucher = (voucher: Voucher) => {
    navigation.navigate('VoucherDetail', { 
      voucherId: voucher.id,
      voucherData: voucher
    });
  };

  const closeSwipeables = (excludeId?: string) => {
    swipeableRefs.current.forEach((ref, id) => {
      if (id !== excludeId && ref) {
        ref.close();
      }
    });
  };

  const handleApproveVoucher = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setActionType('check');
    setComment('');
    setShowActionModal(true);
  };

  const handleRejectVoucher = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setActionType('reject');
    setComment('');
    setShowActionModal(true);
  };

  const submitAction = async () => {
    if (!selectedVoucher) return;
    if (!comment.trim()) {
      Alert.alert('Comment Required', 'Please enter a comment for this action');
      return;
    }

    try {
      setIsLoading(true);
      
      // Create a comment
      const newComment = {
        text: comment,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || '',
        createdByName: userData?.name || 'Unknown User',
        role: 'checker'
      };
      
      // Prepare the update data
      const updateData: any = {
        comments: [...(selectedVoucher.comments || []), newComment],
        checkedBy: auth.currentUser?.uid || '',
        checkedByName: userData?.name || 'Unknown User',
        checkedAt: new Date().toISOString(),
      };
      
      // Update status based on action
      if (actionType === 'check') {
        updateData.status = 'checked';
      } else if (actionType === 'reject') {
        updateData.status = 'rejected';
        updateData.rejectedReason = comment;
        updateData.rejectedBy = auth.currentUser?.uid || '';
        updateData.rejectedByName = userData?.name || 'Unknown User';
        updateData.rejectedAt = new Date().toISOString();
      }
      
      // Update the document in the vouchers collection
      await updateDoc(doc(db, 'vouchers', selectedVoucher.id), updateData);

      // Close the modal
      setShowActionModal(false);
      
      // Show success message
      const successAction = actionType === 'check' ? 'approved' : 'rejected';
      Alert.alert('Success', `Voucher has been ${successAction} successfully.`);
      
      // Refresh vouchers list
      fetchVouchers();
    } catch (error) {
      console.error('Error updating voucher:', error);
      Alert.alert('Error', 'Failed to update voucher. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const viewImage = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setShowImageModal(true);
  };

  const addComment = async () => {
    if (!selectedVoucher) return;
    if (!comment.trim()) {
      Alert.alert('Empty Comment', 'Please enter a comment');
      return;
    }

    try {
      setIsLoading(true);
      
      const newComment = {
        text: comment,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || '',
        createdByName: userData?.name || 'Unknown User',
        role: 'checker'
      };
      
      await updateDoc(doc(db, 'vouchers', selectedVoucher.id), {
        comments: [...(selectedVoucher.comments || []), newComment]
      });
      
      setComment('');
      setShowCommentModal(false);
      fetchVouchers();
      Alert.alert('Success', 'Comment added successfully');
    } catch (error) {
      console.error('Error adding comment:', error);
      Alert.alert('Error', 'Failed to add comment');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
      
      if (downloadResult.status === 200) {
        Alert.alert(
          'Download Complete',
          `File saved to: ${fileUri}`,
          [
            { text: 'Close' },
            { 
              text: 'Share', 
              onPress: () => shareFile(fileUri)
            },
            {
              text: 'Open',
              onPress: () => openURL(url)
            }
          ]
        );
      } else {
        Alert.alert('Download Failed', 'Could not download the file');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert('Error', 'Failed to download file');
    }
  };

  const shareFile = async (fileUri: string) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing not available', 'Sharing is not available on this device');
        return;
      }
      
      await Sharing.shareAsync(fileUri);
    } catch (error) {
      console.error('Error sharing file:', error);
      Alert.alert('Error', 'Failed to share file');
    }
  };

  // Replacement for WebBrowser.openBrowserAsync
  const openURL = (url: string) => {
    Linking.canOpenURL(url)
      .then(supported => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert("Error", "Cannot open this URL");
        }
      })
      .catch(err => {
        console.error('Error opening URL:', err);
        Alert.alert("Error", "Failed to open file");
      });
  };

  const handleViewComments = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowCommentModal(true);
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

  const renderItem = ({ item }: { item: Voucher }) => {
    const isActionable = item.status === 'voucher_created';
    const formattedDate = typeof item.createdAt === 'string'
      ? format(new Date(item.createdAt), 'dd MMM yyyy, hh:mm a')
      : format((item.createdAt as Timestamp).toDate(), 'dd MMM yyyy, hh:mm a');

    return (
      <Swipeable
        ref={ref => {
          if (ref && isActionable) {
            swipeableRefs.current.set(item.id, ref);
          } else if (!ref && swipeableRefs.current.has(item.id)) {
            swipeableRefs.current.delete(item.id);
          }
        }}
        renderRightActions={() => isActionable && (
          <View style={styles.swipeActions}>
            <TouchableOpacity 
              style={[styles.swipeAction, { backgroundColor: theme.colors.success }]}
              onPress={() => handleApproveVoucher(item)}
            >
              <MaterialCommunityIcons name="check" size={24} color="white" />
              <Text style={styles.swipeActionText}>Check</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.swipeAction, { backgroundColor: theme.colors.error }]}
              onPress={() => handleRejectVoucher(item)}
            >
              <MaterialCommunityIcons name="close" size={24} color="white" />
              <Text style={styles.swipeActionText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
        onSwipeableOpen={() => closeSwipeables(item.id)}
        enabled={isActionable}
      >
        <TouchableOpacity 
          style={styles.voucherCard}
          onPress={() => handleSelectVoucher(item)}
        >
          <View style={styles.voucherHeader}>
            <View style={styles.voucherInfo}>
              <Text style={styles.voucherTitle}>
                {item.ticketNumber || `Voucher #${item.id.substring(0, 6)}`}
              </Text>
              <Text style={styles.voucherCompany}>
                {item.company || 'Unknown Company'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColors[item.status]}20` }]}>
              <Text style={[styles.statusText, { color: statusColors[item.status] }]}>
                {statusText[item.status] || item.status}
              </Text>
            </View>
          </View>
          
          <View style={styles.voucherDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount:</Text>
              <Text style={styles.detailValueHighlight}>
                ${item.amount ? item.amount.toLocaleString() : '0'}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank:</Text>
              <Text style={styles.detailValue}>{item.bankName || 'Not specified'}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account:</Text>
              <Text style={styles.detailValue}>
                {item.accountTitle ? `${item.accountTitle} (${item.accountNumber || 'No account #'})` : 'Not specified'}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Created:</Text>
              <Text style={styles.detailValue}>
                {formattedDate} by {item.createdByName || 'Unknown'}
              </Text>
            </View>
            
            {item.description && (
              <View style={styles.description}>
                <Text style={styles.descriptionLabel}>Description:</Text>
                <Text style={styles.descriptionText}>{item.description}</Text>
              </View>
            )}

            {item.comments && item.comments.length > 0 && (
              <View style={styles.commentsPreview}>
                <TouchableOpacity 
                  style={styles.commentsButton}
                  onPress={() => handleViewComments(item)}
                >
                  <MaterialCommunityIcons name="comment-multiple-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.commentsButtonText}>
                    {item.comments.length} {item.comments.length === 1 ? 'Comment' : 'Comments'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          <View style={styles.voucherActions}>
            {isActionable ? (
              <>
                <TouchableOpacity 
                  style={[styles.actionButton, { backgroundColor: theme.colors.success }]}
                  onPress={() => handleApproveVoucher(item)}
                >
                  <MaterialCommunityIcons name="check" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Check</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
                  onPress={() => handleRejectVoucher(item)}
                >
                  <MaterialCommunityIcons name="close" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Reject</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity 
                style={styles.viewDetailsButton}
                onPress={() => handleSelectVoucher(item)}
              >
                <Text style={styles.viewDetailsText}>View Details</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          
          {item.rejectedReason && (
            <View style={styles.rejectionContainer}>
              <Text style={styles.rejectionLabel}>Reason for rejection:</Text>
              <Text style={styles.rejectionText}>{item.rejectedReason}</Text>
            </View>
          )}
          
          <View style={styles.viewFilesSection}>
            {item.imageUrl && (
              <TouchableOpacity 
                style={styles.fileButton}
                onPress={() => viewImage(item.imageUrl)}
              >
                <MaterialCommunityIcons name="file-image-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.fileButtonText}>View Receipt</Text>
              </TouchableOpacity>
            )}
            
            {item.voucherUrl && (
              <TouchableOpacity 
                style={styles.fileButton}
                onPress={() => viewImage(item.voucherUrl!)}
              >
                <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.fileButtonText}>View Voucher</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderFilterTabs = () => (
    <View style={styles.filtersContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.filtersScrollContent}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterTab,
              activeFilter === filter.value && styles.activeFilterTab
            ]}
            onPress={() => setActiveFilter(filter.value)}
          >
            <Text style={[
              styles.filterTabText,
              activeFilter === filter.value && styles.activeFilterTabText
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Voucher Checker</Text>
          <Text style={styles.subtitle}>{userData?.name || 'Bank Officer'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <MaterialCommunityIcons name="account" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleLogout}
          >
            <MaterialCommunityIcons name="logout" size={24} color={theme.colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search vouchers..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      
      {/* Filters */}
      {renderFilterTabs()}

      {/* Voucher List */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading vouchers...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredVouchers}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="receipt-text-outline" size={64} color={theme.colors.textLight} />
              <Text style={styles.emptyText}>No vouchers found</Text>
              <Text style={styles.emptySubtext}>
                {searchQuery 
                  ? 'Try adjusting your search criteria' 
                  : activeFilter !== 'all'
                    ? `No ${activeFilter} vouchers available`
                    : 'There are no vouchers to review at the moment'}
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Image Preview Modal */}
      <Modal
        visible={showImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
            <View style={styles.imageModalHeader}>
              <Text style={styles.imageModalTitle}>Document Preview</Text>
              <TouchableOpacity onPress={() => setShowImageModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            {selectedImage && (
              <Image
                source={{ uri: selectedImage }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
            
            <View style={styles.imageModalActions}>
              <TouchableOpacity
                style={[styles.imageModalButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => {
                  if (selectedImage) {
                    const filename = `zoompay_document_${Date.now()}.jpg`;
                    downloadFile(selectedImage, filename);
                  }
                }}
              >
                <MaterialCommunityIcons name="download" size={20} color="white" />
                <Text style={styles.imageModalButtonText}>Download</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.imageModalButton, { backgroundColor: theme.colors.secondary }]}
                onPress={() => {
                  if (selectedImage) {
                    openURL(selectedImage);
                  }
                }}
              >
                <MaterialCommunityIcons name="open-in-new" size={20} color="white" />
                <Text style={styles.imageModalButtonText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Comments Modal */}
      <Modal
        visible={showCommentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCommentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.commentModalContent}>
            <View style={styles.commentModalHeader}>
              <Text style={styles.commentModalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setShowCommentModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={selectedVoucher?.comments || []}
              keyExtractor={(item, index) => `comment-${index}`}
              style={styles.commentsList}
              ListEmptyComponent={
                <Text style={styles.noCommentsText}>No comments yet</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {item.createdByName} <Text style={styles.commentRole}>({item.role})</Text>
                    </Text>
                    <Text style={styles.commentDate}>
                      {typeof item.createdAt === 'string'
                        ? format(new Date(item.createdAt), 'MMM d, yyyy h:mm a')
                        : format((item.createdAt as Timestamp).toDate(), 'MMM d, yyyy h:mm a')}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
              )}
            />
            
            <View style={styles.addCommentContainer}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={comment}
                onChangeText={setComment}
                multiline
              />
              <TouchableOpacity
                style={[styles.addCommentButton, !comment.trim() && styles.disabledButton]}
                onPress={addComment}
                disabled={!comment.trim()}
              >
                <MaterialCommunityIcons name="send" size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Modal (Approve/Reject) */}
      <Modal
        visible={showActionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.actionModalContent}>
            <View style={styles.actionModalHeader}>
              <Text style={styles.actionModalTitle}>
                {actionType === 'check' ? 'Approve Voucher' : 'Reject Voucher'}
              </Text>
              <TouchableOpacity onPress={() => setShowActionModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.actionModalSubtitle}>
              {actionType === 'check' 
                ? 'Please provide a comment for approval'
                : 'Please provide a reason for rejection'}
            </Text>
            
            <TextInput
              style={styles.actionComment}
              placeholder={actionType === 'check' ? "Comment..." : "Reason for rejection..."}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
            />
            
            <View style={styles.actionModalButtons}>
              <TouchableOpacity
                style={[styles.actionModalButton, { backgroundColor: theme.colors.border }]}
                onPress={() => setShowActionModal(false)}
              >
                <Text style={styles.actionModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.actionModalButton, 
                  { 
                    backgroundColor: actionType === 'check' 
                      ? theme.colors.success 
                      : theme.colors.error 
                  },
                  !comment.trim() && styles.disabledButton
                ]}
                onPress={submitAction}
                disabled={!comment.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.actionModalButtonText}>
                    {actionType === 'check' ? 'Approve' : 'Reject'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'white',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
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
    marginLeft: theme.spacing.sm,
  },
  searchContainer: {
    padding: theme.spacing.md,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
  },
  filtersContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filtersScrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  filterTab: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 16,
    marginRight: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  activeFilterTab: {
    backgroundColor: theme.colors.primary,
  },
  filterTabText: {
    color: theme.colors.textLight,
    fontSize: 14,
  },
  activeFilterTabText: {
    color: 'white',
    fontWeight: '500',
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
  listContainer: {
    padding: theme.spacing.sm,
    paddingBottom: 100, // Extra padding at bottom for better scrolling
  },
  voucherCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    // Shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  voucherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  voucherInfo: {
    flex: 1,
  },
  voucherTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  voucherCompany: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: theme.spacing.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  voucherDetails: {
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    width: 70,
    fontSize: 14,
    color: theme.colors.textLight,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  detailValueHighlight: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  description: {
    marginTop: theme.spacing.sm,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textLight,
  },
  descriptionText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  commentsPreview: {
    marginTop: theme.spacing.xs,
  },
  commentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentsButtonText: {
    fontSize: 12,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  voucherActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 4,
    flex: 1,
    marginHorizontal: 4,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: 4,
    fontSize: 14,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  viewDetailsText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginRight: 4,
  },
  rejectionContainer: {
    backgroundColor: theme.colors.error + '10',
    borderRadius: 4,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.error,
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  viewFilesSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.xs,
  },
  fileButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    marginTop: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.textLight,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  swipeActions: {
    width: 150,
    flexDirection: 'row',
  },
  swipeAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeActionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  separator: {
    height: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  imageModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  previewImage: {
    width: '100%',
    height: 400,
  },
  imageModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  imageModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 4,
  },
  imageModalButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: 8,
  },
  commentModalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  commentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  commentModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  commentsList: {
    maxHeight: 300,
    padding: theme.spacing.md,
  },
  commentItem: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  commentRole: {
    fontWeight: 'normal',
    color: theme.colors.textLight,
  },
  commentDate: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  commentText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  addCommentContainer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  addCommentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  noCommentsText: {
    textAlign: 'center',
    color: theme.colors.textLight,
    padding: theme.spacing.lg,
  },
  actionModalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: theme.spacing.lg,
  },
  actionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  actionModalSubtitle: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.md,
  },
  actionComment: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.lg,
  },
  actionModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionModalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: theme.spacing.xs,
  },
  actionModalButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
  },
});