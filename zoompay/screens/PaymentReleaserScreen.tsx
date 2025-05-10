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
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';

// Define types
interface Voucher {
  id: string;
  imageUrl: string;
  voucherUrl?: string;
  proofOfPaymentUrl?: string;
  status: string;
  createdAt: string | Timestamp;
  createdBy: string;
  createdByName: string;
  userName?: string;
  userEmail?: string;
  company?: string;
  bankName?: string;
  accountNumber?: string;
  accountTitle?: string;
  description?: string;
  amount?: number;
  ticketNumber?: string;
  checkedBy?: string;
  checkedByName?: string;
  checkedAt?: string | Timestamp;
  initiatedBy?: string;
  initiatedByName?: string;
  initiatedAt?: string | Timestamp;
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

export default function PaymentReleaserScreen({ navigation }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [filteredVouchers, setFilteredVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [comment, setComment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'release' | 'reject' | null>(null);
  const [index, setIndex] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const { userData, logout } = useAuth();
  
  // Define tabs
  const [routes] = useState([
    { key: 'pending', title: 'Pending Release' },
    { key: 'released', title: 'Released' },
    { key: 'all', title: 'All Vouchers' },
  ]);

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    setIsLoading(true);
    try {
      // Query vouchers that have been initiated and need payment release
      const vouchersRef = collection(db, 'vouchers');
      const q = query(
        vouchersRef,
        // Include vouchers that are initiated (pending release) or already released
        where('status', 'in', ['initiated', 'payment_released', 'rejected', 'payment_closed']),
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
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      Alert.alert('Error', 'Failed to load vouchers. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (vouchers.length > 0) {
      applyFilters();
    }
  }, [vouchers, index, searchQuery]);

  const applyFilters = () => {
    let filtered = [...vouchers];
    
    // Apply status filter based on tab index
    if (index === 0) { // Pending Release
      filtered = filtered.filter(voucher => voucher.status === 'initiated');
    } else if (index === 1) { // Released
      filtered = filtered.filter(voucher => voucher.status === 'payment_released');
    }
    // index === 2 is "All Vouchers", no status filtering
    
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
  
  const handleViewVoucherDetails = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowDetailModal(true);
  };

  const handleReleasePayment = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setActionType('release');
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
        role: 'payment'
      };
      
      // Prepare the update data
      const updateData: any = {
        comments: [...(selectedVoucher.comments || []), newComment],
      };
      
      // Update status based on action
      if (actionType === 'release') {
        updateData.status = 'payment_released';
        updateData.releasedBy = auth.currentUser?.uid || '';
        updateData.releasedByName = userData?.name || 'Unknown User';
        updateData.releasedAt = new Date().toISOString();
      } else if (actionType === 'reject') {
        updateData.status = 'rejected';
        updateData.rejectedReason = comment;
        updateData.rejectedBy = auth.currentUser?.uid || '';
        updateData.rejectedByName = userData?.name || 'Unknown User';
        updateData.rejectedAt = new Date().toISOString();
      }
      
      // Update the document
      await updateDoc(doc(db, 'vouchers', selectedVoucher.id), updateData);

      // Close the modal
      setShowActionModal(false);
      
      // Show success message
      const successAction = actionType === 'release' ? 'released' : 'rejected';
      Alert.alert('Success', `Payment has been ${successAction} successfully.`);
      
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
        role: 'payment'
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

  // Using Linking instead of WebBrowser
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

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '$0.00';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderVoucherItem = ({ item }: { item: Voucher }) => {
    const isActionable = item.status === 'initiated';
    
    const formattedDate = typeof item.createdAt === 'string'
      ? format(new Date(item.createdAt), 'dd MMM yyyy, hh:mm a')
      : format((item.createdAt as Timestamp).toDate(), 'dd MMM yyyy, hh:mm a');

    const statusColors = {
      initiated: theme.colors.warning,
      payment_released: theme.colors.success,
      payment_closed: theme.colors.primary,
      rejected: theme.colors.error,
    };

    const statusText = {
      initiated: 'Ready for Payment',
      payment_released: 'Payment Released',
      payment_closed: 'Payment Completed',
      rejected: 'Rejected',
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderContent}>
            <Text style={styles.cardTitle}>
              {item.ticketNumber || `Voucher #${item.id.substring(0, 6)}`}
            </Text>
            <Text style={styles.cardSubtitle}>
              {item.company || 'Unknown Company'}
            </Text>
          </View>
          <View style={[
            styles.statusBadge, 
            { backgroundColor: `${statusColors[item.status as keyof typeof statusColors] || theme.colors.textLight}20` }
          ]}>
            <Text style={[
              styles.statusText, 
              { color: statusColors[item.status as keyof typeof statusColors] || theme.colors.textLight }
            ]}>
              {statusText[item.status as keyof typeof statusText] || item.status}
            </Text>
          </View>
        </View>
        
        <View style={styles.cardContent}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Amount:</Text>
            <Text style={styles.infoValueHighlight}>{formatCurrency(item.amount)}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bank:</Text>
            <Text style={styles.infoValue}>{item.bankName || 'Not specified'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account:</Text>
            <Text style={styles.infoValue}>
              {item.accountTitle ? `${item.accountTitle} (${item.accountNumber || ''})` : 'Not specified'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Initiated:</Text>
            <Text style={styles.infoValue}>
              {item.initiatedByName ? `By ${item.initiatedByName} on ${
                typeof item.initiatedAt === 'string'
                  ? format(new Date(item.initiatedAt), 'dd MMM yyyy')
                  : item.initiatedAt 
                    ? format((item.initiatedAt as Timestamp).toDate(), 'dd MMM yyyy')
                    : 'Unknown date'
              }` : 'Pending'}
            </Text>
          </View>
          
          {/* Add image buttons row */}
          <View style={styles.imageButtonsContainer}>
            {item.imageUrl && (
              <TouchableOpacity
                style={styles.imageButton}
                onPress={() => viewImage(item.imageUrl)}
              >
                <MaterialCommunityIcons name="image" size={16} color={theme.colors.primary} />
                <Text style={styles.imageButtonText}>View Receipt</Text>
              </TouchableOpacity>
            )}
            
            {item.voucherUrl && (
              <TouchableOpacity
                style={styles.imageButton}
                onPress={() => viewImage(item.voucherUrl)}
              >
                <MaterialCommunityIcons name="file-document-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.imageButtonText}>View Voucher</Text>
              </TouchableOpacity>
            )}
            
            {item.proofOfPaymentUrl && (
              <TouchableOpacity
                style={styles.imageButton}
                onPress={() => viewImage(item.proofOfPaymentUrl)}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={theme.colors.success} />
                <Text style={styles.imageButtonText}>View Payment Proof</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {item.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionLabel}>Description:</Text>
              <Text style={styles.descriptionText}>{item.description}</Text>
            </View>
          )}

          {item.comments && item.comments.length > 0 && (
            <TouchableOpacity 
              style={styles.commentsButton}
              onPress={() => handleViewComments(item)}
            >
              <MaterialCommunityIcons name="comment-multiple-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.commentsButtonText}>
                {item.comments.length} {item.comments.length === 1 ? 'Comment' : 'Comments'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.cardActions}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleViewVoucherDetails(item)}
          >
            <MaterialCommunityIcons name="eye-outline" size={20} color="white" />
            <Text style={styles.actionButtonText}>View Details</Text>
          </TouchableOpacity>
          
          {isActionable && (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.colors.success }]}
              onPress={() => handleReleasePayment(item)}
            >
              <MaterialCommunityIcons name="cash-multiple" size={20} color="white" />
              <Text style={styles.actionButtonText}>Release Payment</Text>
            </TouchableOpacity>
          )}
          
          {isActionable && (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
              onPress={() => handleRejectVoucher(item)}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={20} color="white" />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderScene = SceneMap({
    pending: () => (
      <FlatList
        data={filteredVouchers}
        renderItem={renderVoucherItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="cash-multiple" size={64} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No vouchers pending payment</Text>
            <Text style={styles.emptySubText}>
              Vouchers ready for payment release will appear here
            </Text>
          </View>
        }
      />
    ),
    released: () => (
      <FlatList
        data={filteredVouchers}
        renderItem={renderVoucherItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-circle-outline" size={64} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No released payments</Text>
            <Text style={styles.emptySubText}>
              Payments you have released will appear here
            </Text>
          </View>
        }
      />
    ),
    all: () => (
      <FlatList
        data={filteredVouchers}
        renderItem={renderVoucherItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="file-document-outline" size={64} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No vouchers found</Text>
            <Text style={styles.emptySubText}>
              Vouchers will appear here as they are processed
            </Text>
          </View>
        }
      />
    ),
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Payment Releaser</Text>
          <Text style={styles.subtitle}>{userData?.name || 'ZoomPay Employee'}</Text>
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

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading vouchers...</Text>
        </View>
      ) : (
        <TabView
          navigationState={{ index, routes }}
          renderScene={renderScene}
          onIndexChange={setIndex}
          initialLayout={{ width: Dimensions.get('window').width }}
          renderTabBar={props => (
            <TabBar
              {...props}
              style={styles.tabBar}
              indicatorStyle={styles.tabIndicator}
              labelStyle={styles.tabLabel}
              activeColor={theme.colors.primary}
              inactiveColor={theme.colors.textLight}
            />
          )}
        />
      )}

      {/* Image Preview Modal */}
      <Modal
        visible={showImageModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Document Preview</Text>
              <TouchableOpacity onPress={() => setShowImageModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.previewContainer}>
              {selectedImage && selectedImage.toLowerCase().endsWith('.pdf') ? (
                <View style={styles.pdfPreviewContainer}>
                  <MaterialCommunityIcons name="file-pdf-box" size={80} color={theme.colors.error} />
                  <Text style={styles.pdfText}>PDF Document</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: selectedImage || '' }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              )}
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalActionButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => {
                  if (selectedImage) {
                    const filename = `zoompay_document_${Date.now()}.${selectedImage.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg'}`;
                    downloadFile(selectedImage, filename);
                  }
                }}
              >
                <MaterialCommunityIcons name="download" size={20} color="white" />
                <Text style={styles.modalActionButtonText}>Download</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalActionButton, { backgroundColor: theme.colors.secondary }]}
                onPress={() => {
                  if (selectedImage) {
                    openURL(selectedImage);
                  }
                }}
              >
                <MaterialCommunityIcons name="open-in-new" size={20} color="white" />
                <Text style={styles.modalActionButtonText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Comments Modal */}
      <Modal
        visible={showCommentModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCommentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setShowCommentModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={selectedVoucher?.comments || []}
              keyExtractor={(item, index) => `comment-${index}`}
              style={styles.commentsList}
              contentContainerStyle={
                selectedVoucher?.comments?.length === 0 ? { flex: 1, justifyContent: 'center', alignItems: 'center' } : {}
              }
              ListEmptyComponent={
                <Text style={styles.emptyComments}>No comments yet</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {item.createdByName}
                      <Text style={styles.commentRole}> ({item.role})</Text>
                    </Text>
                    <Text style={styles.commentDate}>
                      {typeof item.createdAt === 'string'
                        ? format(new Date(item.createdAt), 'dd MMM yyyy, h:mm a')
                        : format((item.createdAt as Timestamp).toDate(), 'dd MMM yyyy, h:mm a')}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
              )}
            />
            
            <View style={styles.commentInputContainer}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={2}
              />
              <TouchableOpacity
                style={[styles.sendButton, !comment.trim() && styles.disabledButton]}
                onPress={addComment}
                disabled={!comment.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialCommunityIcons name="send" size={20} color="white" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Modal */}
      <Modal
        visible={showActionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowActionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.actionModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {actionType === 'release' ? 'Release Payment' : 'Reject Voucher'}
              </Text>
              <TouchableOpacity onPress={() => setShowActionModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.actionModalBody}>
              <Text style={styles.actionModalText}>
                {actionType === 'release' 
                  ? 'Please confirm that you are releasing payment for this voucher. Enter any relevant payment details below:'
                  : 'Please provide a reason for rejecting this voucher:'}
              </Text>
              
              {selectedVoucher && (
                <View style={styles.voucherSummary}>
                  <Text style={styles.voucherSummaryTitle}>Voucher Summary</Text>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Amount:</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(selectedVoucher.amount)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Bank:</Text>
                    <Text style={styles.summaryValue}>{selectedVoucher.bankName}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Account:</Text>
                    <Text style={styles.summaryValue}>
                      {selectedVoucher.accountTitle} ({selectedVoucher.accountNumber})
                    </Text>
                  </View>
                </View>
              )}
              
              <TextInput
                style={styles.actionComment}
                placeholder={actionType === 'release' ? "Payment details..." : "Reason for rejection..."}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => setShowActionModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.actionButton, 
                    actionType === 'release' ? styles.releaseButton : styles.rejectButton,
                    !comment.trim() && styles.disabledButton
                  ]}
                  onPress={submitAction}
                  disabled={!comment.trim() || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <MaterialCommunityIcons 
                        name={actionType === 'release' ? "cash-multiple" : "close-circle"} 
                        size={20} 
                        color="white" 
                      />
                      <Text style={styles.actionButtonText}>
                        {actionType === 'release' ? 'Release Payment' : 'Reject Voucher'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Voucher Details Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Voucher Details</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.detailScrollView}>
              {selectedVoucher && (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>General Information</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Ticket Number:</Text>
                      <Text style={styles.detailValue}>{selectedVoucher.ticketNumber || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Company:</Text>
                      <Text style={styles.detailValue}>{selectedVoucher.company || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Amount:</Text>
                      <Text style={styles.detailValueHighlight}>{formatCurrency(selectedVoucher.amount)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Description:</Text>
                      <Text style={styles.detailValue}>{selectedVoucher.description || '-'}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Bank Details</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Bank Name:</Text>
                      <Text style={styles.detailValue}>{selectedVoucher.bankName || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Account Title:</Text>
                      <Text style={styles.detailValue}>{selectedVoucher.accountTitle || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Account Number:</Text>
                      <Text style={styles.detailValue}>{selectedVoucher.accountNumber || '-'}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Workflow</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Created By:</Text>
                      <Text style={styles.detailValue}>
                        {selectedVoucher.createdByName || '-'} on {
                          typeof selectedVoucher.createdAt === 'string'
                            ? format(new Date(selectedVoucher.createdAt), 'dd MMM yyyy')
                            : format((selectedVoucher.createdAt as Timestamp).toDate(), 'dd MMM yyyy')
                        }
                      </Text>
                    </View>
                    {selectedVoucher.checkedByName && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Checked By:</Text>
                        <Text style={styles.detailValue}>
                          {selectedVoucher.checkedByName} on {
                            typeof selectedVoucher.checkedAt === 'string'
                              ? format(new Date(selectedVoucher.checkedAt), 'dd MMM yyyy')
                              : selectedVoucher.checkedAt
                                ? format((selectedVoucher.checkedAt as Timestamp).toDate(), 'dd MMM yyyy')
                                : '-'
                          }
                        </Text>
                      </View>
                    )}
                    {selectedVoucher.initiatedByName && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Initiated By:</Text>
                        <Text style={styles.detailValue}>
                          {selectedVoucher.initiatedByName} on {
                            typeof selectedVoucher.initiatedAt === 'string'
                              ? format(new Date(selectedVoucher.initiatedAt), 'dd MMM yyyy')
                              : selectedVoucher.initiatedAt
                                ? format((selectedVoucher.initiatedAt as Timestamp).toDate(), 'dd MMM yyyy')
                                : '-'
                          }
                        </Text>
                      </View>
                    )}
                    {selectedVoucher.releasedByName && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Released By:</Text>
                        <Text style={styles.detailValue}>
                          {selectedVoucher.releasedByName} on {
                            typeof selectedVoucher.releasedAt === 'string'
                              ? format(new Date(selectedVoucher.releasedAt), 'dd MMM yyyy')
                              : selectedVoucher.releasedAt
                                ? format((selectedVoucher.releasedAt as Timestamp).toDate(), 'dd MMM yyyy')
                                : '-'
                          }
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status:</Text>
                      <Text style={[
                        styles.detailStatus,
                        {
                          color: 
                            selectedVoucher.status === 'initiated' ? theme.colors.warning :
                            selectedVoucher.status === 'payment_released' ? theme.colors.success :
                            selectedVoucher.status === 'payment_closed' ? theme.colors.primary :
                            selectedVoucher.status === 'rejected' ? theme.colors.error :
                            theme.colors.text
                        }
                      ]}>
                        {selectedVoucher.status === 'initiated' ? 'Ready for Payment' :
                         selectedVoucher.status === 'payment_released' ? 'Payment Released' :
                         selectedVoucher.status === 'payment_closed' ? 'Payment Completed' :
                         selectedVoucher.status === 'rejected' ? 'Rejected' :
                         selectedVoucher.status}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Documents</Text>
                    
                    {selectedVoucher.imageUrl && (
                      <View style={styles.documentItem}>
                        <Text style={styles.documentLabel}>Receipt Image:</Text>
                        <TouchableOpacity 
                          style={styles.documentButton}
                          onPress={() => viewImage(selectedVoucher.imageUrl)}
                        >
                          <MaterialCommunityIcons name="image" size={24} color={theme.colors.primary} />
                          <Text style={styles.documentButtonText}>View Receipt</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {selectedVoucher.voucherUrl && (
                      <View style={styles.documentItem}>
                        <Text style={styles.documentLabel}>Voucher Document:</Text>
                        <TouchableOpacity 
                          style={styles.documentButton}
                          onPress={() => viewImage(selectedVoucher.voucherUrl)}
                        >
                          <MaterialCommunityIcons name="file-document-outline" size={24} color={theme.colors.primary} />
                          <Text style={styles.documentButtonText}>View Voucher</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {selectedVoucher.proofOfPaymentUrl && (
                      <View style={styles.documentItem}>
                        <Text style={styles.documentLabel}>Payment Proof:</Text>
                        <TouchableOpacity 
                          style={styles.documentButton}
                          onPress={() => viewImage(selectedVoucher.proofOfPaymentUrl)}
                        >
                          <MaterialCommunityIcons name="check-circle-outline" size={24} color={theme.colors.success} />
                          <Text style={styles.documentButtonText}>View Payment Proof</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {!selectedVoucher.imageUrl && !selectedVoucher.voucherUrl && !selectedVoucher.proofOfPaymentUrl && (
                      <Text style={styles.noDocumentsText}>No documents available</Text>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowDetailModal(false)}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    paddingVertical: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
  },
  tabBar: {
    backgroundColor: 'white',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabIndicator: {
    backgroundColor: theme.colors.primary,
    height: 3,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'none',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textLight,
    fontSize: 16,
  },
  listContent: {
    padding: theme.spacing.md,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cardHeaderContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: theme.colors.textLight,
    flex: 2,
  },
  infoValue: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 3,
    textAlign: 'right',
  },
  infoValueHighlight: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    flex: 3,
    textAlign: 'right',
  },
  descriptionContainer: {
    marginTop: 8,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: 8,
  },
  descriptionLabel: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  commentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  commentsButtonText: {
    fontSize: 12,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 4,
    flex: 1,
    margin: 4,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: 4,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.textLight,
    marginTop: theme.spacing.md,
  },
  emptySubText: {
    fontSize: 14,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
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
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  previewContainer: {
    maxHeight: 400,
  },
  previewImage: {
    width: '100%',
    height: 400,
    resizeMode: 'contain',
  },
  pdfPreviewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 300,
    padding: theme.spacing.lg,
  },
  pdfText: {
    fontSize: 16,
    marginTop: theme.spacing.md,
    color: theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 4,
  },
  modalActionButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: 8,
  },
  commentsList: {
    maxHeight: 300,
    padding: theme.spacing.md,
  },
  commentItem: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: 8,
    marginBottom: theme.spacing.sm,
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
    fontSize: 12,
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
  emptyComments: {
    color: theme.colors.textLight,
    textAlign: 'center',
    fontSize: 14,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionModalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 12,
  },
  actionModalBody: {
    padding: theme.spacing.lg,
  },
  actionModalText: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  voucherSummary: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  voucherSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  summaryValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  actionComment: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.md,
    height: 120,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  cancelButton: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  releaseButton: {
    backgroundColor: theme.colors.success,
    flex: 2,
    borderRadius: 8,
  },
  rejectButton: {
    backgroundColor: theme.colors.error,
    flex: 2,
    borderRadius: 8,
  },
  imageButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  imageButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    marginLeft: 4,
  },
  detailScrollView: {
    maxHeight: 500,
  },
  detailSection: {
    marginBottom: theme.spacing.lg,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: theme.spacing.md,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    width: 120,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  detailStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  documentLabel: {
    fontSize: 14,
    color: theme.colors.text,
  },
  documentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  documentButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    marginLeft: 6,
  },
  noDocumentsText: {
    color: theme.colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  modalCloseButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
});