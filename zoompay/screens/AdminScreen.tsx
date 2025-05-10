import React, { useState, useEffect } from 'react';
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
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../utils/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { CustomInput } from '../components/CustomInput';
import { useAuth } from '../context/AuthContext';
import { db, auth, storage } from '../config/firebaseConfig';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { format } from 'date-fns';
import type { StackNavigationProp } from '@react-navigation/stack';

type Comment = {
  author: string;
  createdAt: string;
  text: string;
};

// Update your Receipt type definition to include the real fields from your database
type Receipt = {
  id: string;
  imageUrl: string;
  status: 'pending' | 'approved' | 'rejected' | 'voucher_created';
  createdAt: string;
  createdBy: string;
  userName: string;
  userEmail: string;
  company: string;
  approvedBy?: string;
  approvedAt?: string;
  processedBy?: string;
  processedAt?: string;
  processedByName?: string;
  rejectedReason?: string | null;
  comments?: Comment[];
  voucherId?: string;
};

// Update Voucher type to match your actual data structure
type Voucher = {
  id: string;
  receiptId: string;
  voucherUrl: string;
  imageUrl: string;
  status: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  description: string;
  amount: number;
  ticketNumber: string;
  company: string;
  checkedAt?: string;
  checkedBy?: string;
  checkedByName?: string;
  initiatedAt?: string;
  initiatedBy?: string;
  initiatedByName?: string;
  releasedAt?: string;
  releasedBy?: string;
  releasedByName?: string;
  proofOfPaymentUrl?: string;
  proofOfPaymentUploadedAt?: string;
  proofOfPaymentUploadedBy?: string;
  proofOfPaymentUploadedByName?: string;
  comments?: Comment[];
};

type AdminScreenProps = {
  navigation: StackNavigationProp<any>; // Replace 'any' with your stack param list if you have one
};

// Add this function to get a combined status that shows the actual workflow state
const getCombinedStatus = (receipt: Receipt, voucher: Voucher | null) => {
  if (!voucher) {
    return {
      status: receipt.status,
      color: receipt.status === 'approved' ? theme.colors.success : 
             receipt.status === 'rejected' ? theme.colors.error :
             receipt.status === 'voucher_created' ? theme.colors.primary :
             theme.colors.warning,
      displayText: receipt.status === 'voucher_created' ? 'Voucher Created' : receipt.status
    };
  }
  
  // If we have a voucher, show the voucher status instead
  switch(voucher.status) {
    case 'voucher_created':
      return { status: 'voucher_created', color: theme.colors.warning, displayText: 'Voucher Created' };
    case 'checked':
      return { status: 'checked', color: theme.colors.info, displayText: 'Checked' };
    case 'initiated':
      return { status: 'initiated', color: theme.colors.primary, displayText: 'Initiated' };
    case 'payment_released':
      return { status: 'payment_released', color: theme.colors.success, displayText: 'Payment Released' };
    case 'payment_completed':
      return { status: 'payment_completed', color: theme.colors.success, displayText: 'Payment Completed ✓' };
    case 'rejected':
      return { status: 'rejected', color: theme.colors.error, displayText: 'Rejected' };
    default:
      return { status: voucher.status, color: theme.colors.text, displayText: voucher.status };
  }
};

export default function AdminScreen({ navigation }: AdminScreenProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Receipt | null>(null);
  const [voucherData, setVoucherData] = useState<Voucher | null>(null);
  const { userData, logout } = useAuth();

  useEffect(() => {
    fetchReceipts();
  }, []);

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
      const q = query(
        receiptsRef, 
        where("createdBy", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const receiptsList: Receipt[] = [];
      
      querySnapshot.forEach((doc) => {
        receiptsList.push({
          id: doc.id,
          ...doc.data()
        } as Receipt);
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

  const pickImage = async () => {
    console.log('pickImage called');
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need permission to access your photos');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      console.log('ImagePicker result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        console.log('Selected image URI:', uri);
        if (uri) {
          uploadReceipt(uri);
        } else {
          Alert.alert("Error", "Selected image is not a valid file.");
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to select image. Please try again.");
    }
  };

  const uploadReceipt = async (uri: string) => {
    console.log('uploadReceipt called with URI:', uri);
    console.log('auth.currentUser:', auth.currentUser);
    if (!auth.currentUser) {
      Alert.alert("Error", "User not authenticated. Please log in again.");
      setIsUploading(false);
      setUploadProgress(0);
      return;
    }
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // Convert URI to blob
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Only extract extension if it's a file URI
      let extension = 'jpg';
      if (uri.startsWith('file://')) {
        const match = uri.match(/\.(\w+)$/);
        if (match) extension = match[1];
      }
      
      const fileName = `receipts/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${extension}`;
      
      console.log("Uploading to path:", fileName);
      
      // Create a storage reference
      const storageRef = ref(storage, fileName);
      
      // Add metadata with user ID
      const metadata = {
        contentType: 'image/jpeg',
        customMetadata: {
          createdBy: auth.currentUser.uid
        }
      };
      
      // Use uploadBytes with metadata
      try {
        const snapshot = await uploadBytes(storageRef, blob, metadata);
        console.log("Upload successful!");
        
        // Get download URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("File available at:", downloadURL);
        
        // Save receipt info to Firestore
        const receiptRef = await addDoc(collection(db, 'receipts'), {
          imageUrl: downloadURL,
          status: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser.uid,
          userName: userData?.name || 'Unknown',
          userEmail: userData?.email || 'Unknown',
          company: userData?.company || 'Unknown',
          approvedBy: null,
          approvedAt: null,
          rejectedReason: null,
          comments: []
        });
        
        // Update local state
        const newReceipt = {
          id: receiptRef.id,
          imageUrl: downloadURL,
          status: 'pending',
          createdAt: new Date().toISOString(),
          userName: userData?.name || 'Unknown',
          userEmail: userData?.email || 'Unknown'
        } as Receipt;
        
        setReceipts([newReceipt, ...receipts]);
        Alert.alert("Success", "Receipt uploaded successfully!");
      } catch (uploadError) {
        console.error("Upload error details:", uploadError);
        Alert.alert("Upload Error", "Could not upload the image. Please try again.");
      }
    } catch (error) {
      console.error("Error in upload process:", error);
      Alert.alert("Error", "Failed to process the image. Please try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteReceipt = async (id: string) => {
    try {
      Alert.alert(
        "Confirm Delete",
        "Are you sure you want to delete this receipt?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Delete", 
            style: "destructive",
            onPress: async () => {
              setIsLoading(true);
              await deleteDoc(doc(db, 'receipts', id));
              setReceipts(receipts.filter(receipt => receipt.id !== id));
              Alert.alert("Success", "Receipt deleted successfully");
              setIsLoading(false);
            }
          }
        ]
      );
    } catch (error) {
      console.error("Error deleting receipt:", error);
      Alert.alert("Error", "Failed to delete receipt");
      setIsLoading(false);
    }
  };

  const viewReceiptDetails = async (receipt: Receipt) => {
    setSelectedImage(receipt);
    setVoucherData(null); // Reset voucher data
    
    // Check if receipt has a voucher associated with it
    if (receipt.voucherId) {
      try {
        const voucherRef = doc(db, 'vouchers', receipt.voucherId);
        const voucherSnap = await getDoc(voucherRef);
        
        if (voucherSnap.exists()) {
          const voucher = {
            id: voucherSnap.id,
            ...voucherSnap.data()
          } as Voucher;
          
          setVoucherData(voucher);
          console.log("Found voucher data:", voucher);
        }
      } catch (error) {
        console.error("Error fetching voucher data:", error);
      }
    }
    
    setShowImagePreview(true);
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

  const getVoucherStatusColor = (status: string) => {
    switch (status) {
      case 'voucher_created': return theme.colors.warning;
      case 'checked': return theme.colors.success;
      case 'initiated': return theme.colors.primary;
      case 'payment_released': return theme.colors.success;
      case 'payment_completed': return theme.colors.success;
      case 'rejected': return theme.colors.error;
      default: return theme.colors.text;
    }
  };

  const formatVoucherStatus = (status: string) => {
    switch (status) {
      case 'voucher_created': return 'Pending Review';
      case 'checked': return 'Checked';
      case 'initiated': return 'Initiated';
      case 'payment_released': return 'Payment Released';
      case 'payment_completed': return 'Payment Completed';
      case 'rejected': return 'Rejected';
      default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
    }
  };

  const viewVoucherDocument = (url: string) => {
    Linking.openURL(url).catch(err => {
      console.error('Error opening URL:', err);
      Alert.alert('Error', 'Could not open voucher document');
    });
  };

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
            <Text style={styles.modalTitle}>
              {voucherData ? `Voucher #${voucherData.ticketNumber}` : 'Receipt Details'}
            </Text>
            <TouchableOpacity onPress={() => setShowImagePreview(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          
          {selectedImage && (
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              {/* Always show receipt image at the top */}
              <Image 
                source={{ uri: selectedImage.imageUrl }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
              
              <View style={styles.detailsContainer}>
                {/* Show combined status with appropriate colors */}
                {voucherData ? (
                  <View style={[
                    styles.statusContainer,
                    {
                      backgroundColor: 
                        voucherData.status === 'payment_completed' ? `${theme.colors.success}20` :
                        voucherData.status === 'payment_released' ? `${theme.colors.success}20` :
                        voucherData.status === 'initiated' ? `${theme.colors.primary}20` :
                        voucherData.status === 'checked' ? `${theme.colors.info}20` :
                        voucherData.status === 'rejected' ? `${theme.colors.error}20` :
                        `${theme.colors.warning}20`
                    }
                  ]}>
                    <MaterialCommunityIcons 
                      name={
                        voucherData.status === 'payment_completed' ? 'check-circle' :
                        voucherData.status === 'payment_released' ? 'cash-check' :
                        voucherData.status === 'initiated' ? 'file-send' :
                        voucherData.status === 'checked' ? 'check' :
                        voucherData.status === 'rejected' ? 'close-circle' :
                        'file-document'
                      } 
                      size={24} 
                      color={
                        voucherData.status === 'payment_completed' ? theme.colors.success :
                        voucherData.status === 'payment_released' ? theme.colors.success :
                        voucherData.status === 'initiated' ? theme.colors.primary :
                        voucherData.status === 'checked' ? theme.colors.info :
                        voucherData.status === 'rejected' ? theme.colors.error :
                        theme.colors.warning
                      } 
                    />
                    <View style={styles.statusTextContainer}>
                      <Text style={styles.statusTitle}>
                        {voucherData.status === 'payment_completed' ? 'Payment Completed' :
                         voucherData.status === 'payment_released' ? 'Payment Released' :
                         voucherData.status === 'initiated' ? 'Payment Initiated' :
                         voucherData.status === 'checked' ? 'Checked' :
                         voucherData.status === 'rejected' ? 'Rejected' :
                         'Voucher Created'}
                      </Text>
                      <Text style={styles.statusDate}>
                        {voucherData.status === 'payment_completed' && voucherData.proofOfPaymentUploadedAt 
                          ? format(new Date(voucherData.proofOfPaymentUploadedAt), 'PPP p')
                          : voucherData.status === 'payment_released' && voucherData.releasedAt
                          ? format(new Date(voucherData.releasedAt), 'PPP p') 
                          : voucherData.status === 'initiated' && voucherData.initiatedAt
                          ? format(new Date(voucherData.initiatedAt), 'PPP p')
                          : voucherData.status === 'checked' && voucherData.checkedAt
                          ? format(new Date(voucherData.checkedAt), 'PPP p')
                          : format(new Date(voucherData.createdAt), 'PPP p')}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={[
                    styles.statusContainer,
                    { backgroundColor: `${
                      selectedImage.status === 'approved' ? theme.colors.success :
                      selectedImage.status === 'rejected' ? theme.colors.error :
                      selectedImage.status === 'voucher_created' ? theme.colors.primary :
                      theme.colors.warning
                    }20` }
                  ]}>
                    <MaterialCommunityIcons 
                      name={
                        selectedImage.status === 'approved' ? 'check-circle' :
                        selectedImage.status === 'rejected' ? 'close-circle' :
                        selectedImage.status === 'voucher_created' ? 'file-document' :
                        'clock-outline'
                      } 
                      size={24} 
                      color={
                        selectedImage.status === 'approved' ? theme.colors.success :
                        selectedImage.status === 'rejected' ? theme.colors.error :
                        selectedImage.status === 'voucher_created' ? theme.colors.primary :
                        theme.colors.warning
                      } 
                    />
                    <View style={styles.statusTextContainer}>
                      <Text style={styles.statusTitle}>
                        {selectedImage.status === 'voucher_created' ? 'Voucher Created' : selectedImage.status}
                      </Text>
                      <Text style={styles.statusDate}>
                        {selectedImage.status === 'approved' && selectedImage.approvedAt
                          ? format(new Date(selectedImage.approvedAt), 'PPP p')
                          : selectedImage.status === 'voucher_created' && selectedImage.processedAt
                          ? format(new Date(selectedImage.processedAt), 'PPP p')
                          : format(new Date(selectedImage.createdAt), 'PPP p')}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.timelineContainer}>
                  <Text style={styles.timelineTitle}>Workflow Timeline</Text>
                  
                  {/* Receipt creation */}
                  <View style={styles.timelineItem}>
                    <View style={styles.timelineBullet}>
                      <MaterialCommunityIcons name="receipt" size={20} color={theme.colors.primary} />
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineEventTitle}>Receipt Created</Text>
                      <Text style={styles.timelineDate}>
                        {format(new Date(selectedImage.createdAt), 'PPP p')}
                      </Text>
                      <Text style={styles.timelineUser}>{selectedImage.userName}</Text>
                    </View>
                  </View>
                  
                  {/* Receipt approval */}
                  {selectedImage.approvedAt && (
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineBullet}>
                        <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.success} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineEventTitle}>Receipt Approved</Text>
                        <Text style={styles.timelineDate}>
                          {format(new Date(selectedImage.approvedAt), 'PPP p')}
                        </Text>
                        <Text style={styles.timelineUser}>{selectedImage.approvedBy}</Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Voucher creation */}
                  {selectedImage.processedAt && (
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineBullet}>
                        <MaterialCommunityIcons name="file-document-outline" size={20} color={theme.colors.primary} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineEventTitle}>Voucher Created</Text>
                        <Text style={styles.timelineDate}>
                          {format(new Date(selectedImage.processedAt), 'PPP p')}
                        </Text>
                        <Text style={styles.timelineUser}>{selectedImage.processedByName}</Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Voucher events if voucher exists */}
                  {voucherData && voucherData.checkedAt && (
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineBullet}>
                        <MaterialCommunityIcons name="check" size={20} color={theme.colors.info} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineEventTitle}>Voucher Checked</Text>
                        <Text style={styles.timelineDate}>
                          {format(new Date(voucherData.checkedAt), 'PPP p')}
                        </Text>
                        <Text style={styles.timelineUser}>{voucherData.checkedByName}</Text>
                      </View>
                    </View>
                  )}
                  
                  {voucherData && voucherData.initiatedAt && (
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineBullet}>
                        <MaterialCommunityIcons name="file-send" size={20} color={theme.colors.primary} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineEventTitle}>Payment Initiated</Text>
                        <Text style={styles.timelineDate}>
                          {format(new Date(voucherData.initiatedAt), 'PPP p')}
                        </Text>
                        <Text style={styles.timelineUser}>{voucherData.initiatedByName}</Text>
                      </View>
                    </View>
                  )}
                  
                  {voucherData && voucherData.releasedAt && (
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineBullet}>
                        <MaterialCommunityIcons name="cash-check" size={20} color={theme.colors.success} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineEventTitle}>Payment Released</Text>
                        <Text style={styles.timelineDate}>
                          {format(new Date(voucherData.releasedAt), 'PPP p')}
                        </Text>
                        <Text style={styles.timelineUser}>{voucherData.releasedByName}</Text>
                      </View>
                    </View>
                  )}
                  
                  {voucherData && voucherData.proofOfPaymentUploadedAt && (
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineBullet}>
                        <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.success} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineEventTitle}>Payment Completed</Text>
                        <Text style={styles.timelineDate}>
                          {format(new Date(voucherData.proofOfPaymentUploadedAt), 'PPP p')}
                        </Text>
                        <Text style={styles.timelineUser}>{voucherData.proofOfPaymentUploadedByName}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Voucher Details Section */}
                {voucherData && (
                  <View style={styles.voucherSection}>
                    <Text style={styles.voucherSectionTitle}>Voucher Information</Text>
                    
                    <View style={styles.voucherDetail}>
                      <Text style={styles.voucherLabel}>Voucher #:</Text>
                      <Text style={styles.voucherValue}>{voucherData.ticketNumber}</Text>
                    </View>
                    
                    <View style={styles.voucherDetail}>
                      <Text style={styles.voucherLabel}>Amount:</Text>
                      <Text style={styles.voucherValueHighlight}>
                        ${voucherData.amount.toLocaleString()}
                      </Text>
                    </View>
                    
                    <View style={styles.voucherDetail}>
                      <Text style={styles.voucherLabel}>Bank:</Text>
                      <Text style={styles.voucherValue}>{voucherData.bankName}</Text>
                    </View>
                    
                    <View style={styles.voucherDetail}>
                      <Text style={styles.voucherLabel}>Account:</Text>
                      <Text style={styles.voucherValue}>
                        {voucherData.accountTitle} ({voucherData.accountNumber})
                      </Text>
                    </View>
                    
                    <View style={styles.descriptionContainer}>
                      <Text style={styles.descriptionLabel}>Description:</Text>
                      <Text style={styles.descriptionText}>{voucherData.description}</Text>
                    </View>
                    
                    <View style={styles.documentButtons}>
                      <TouchableOpacity 
                        style={styles.viewVoucherButton}
                        onPress={() => viewVoucherDocument(voucherData.voucherUrl)}
                      >
                        <MaterialCommunityIcons name="file-document-outline" size={20} color="white" />
                        <Text style={styles.viewVoucherButtonText}>View Voucher</Text>
                      </TouchableOpacity>
                      
                      {voucherData.proofOfPaymentUrl && (
                        <TouchableOpacity 
                          style={[styles.viewVoucherButton, styles.viewProofButton]}
                          onPress={() => viewVoucherDocument(voucherData.proofOfPaymentUrl!)}
                        >
                          <MaterialCommunityIcons name="check-circle-outline" size={20} color="white" />
                          <Text style={styles.viewVoucherButtonText}>View Proof</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
                
                {/* Comments section */}
                {((selectedImage.comments && selectedImage.comments.length > 0) || 
                  (voucherData && voucherData.comments && voucherData.comments.length > 0)) && (
                  <View style={styles.commentsSection}>
                    <Text style={styles.commentsSectionTitle}>Comments:</Text>
                    
                    {/* Receipt comments */}
                    {selectedImage.comments && selectedImage.comments.map((comment, index) => (
                      <View key={`receipt-${index}`} style={styles.commentBox}>
                        <View style={styles.commentHeader}>
                          <Text style={styles.commentAuthor}>{comment.author}</Text>
                          <Text style={styles.commentDate}>
                            {format(new Date(comment.createdAt), 'PPp')}
                          </Text>
                        </View>
                        <Text style={styles.commentText}>{comment.text}</Text>
                      </View>
                    ))}
                    
                    {/* Voucher comments */}
                    {voucherData && voucherData.comments && voucherData.comments.map((comment, index) => (
                      <View key={`voucher-${index}`} style={styles.commentBox}>
                        <View style={styles.commentHeader}>
                          <View style={styles.commentAuthorContainer}>
                            <Text style={styles.commentAuthor}>{comment.createdByName}</Text>
                            <View style={styles.roleBadge}>
                              <Text style={styles.roleText}>{comment.role}</Text>
                            </View>
                          </View>
                          <Text style={styles.commentDate}>
                            {format(new Date(comment.createdAt), 'PPp')}
                          </Text>
                        </View>
                        <Text style={styles.commentText}>{comment.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Rejection reason */}
                {selectedImage.rejectedReason && (
                  <View style={styles.commentBox}>
                    <Text style={styles.commentTitle}>Reason for Rejection:</Text>
                    <Text style={styles.commentText}>{selectedImage.rejectedReason}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderUploadProgress = () => (
    <Modal visible={isUploading} transparent={true} animationType="fade">
      <View style={styles.progressModal}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressTitle}>Uploading Receipt...</Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
        </View>
      </View>
    </Modal>
  );

  // Update the renderReceiptItem function to use our combined status
  const renderReceiptItem = (receipt: Receipt) => {
    const isPending = receipt.status === 'pending';
    const hasVoucher = receipt.status === 'voucher_created' || !!receipt.voucherId;
    
    return (
      <TouchableOpacity 
        key={receipt.id}
        style={styles.receiptItem}
        onPress={() => viewReceiptDetails(receipt)}
      >
        <View style={styles.receiptContent}>
          <Image source={{ uri: receipt.imageUrl }} style={styles.receiptThumbnail} />
          <View style={styles.receiptInfo}>
            <Text style={styles.receiptDate}>
              {format(new Date(receipt.createdAt), 'PP')}
            </Text>
            <View style={[
              styles.statusBadge,
              hasVoucher && styles.voucherBadge,
              receipt.status === 'approved' && styles.approvedBadge,
              receipt.status === 'rejected' && styles.rejectedBadge,
              receipt.status === 'pending' && styles.pendingBadge,
            ]}>
              <Text style={styles.statusText}>
                {receipt.status === 'voucher_created' ? 'Voucher Created' : receipt.status}
              </Text>
            </View>
            
            {hasVoucher && (
              <View style={styles.voucherIndicator}>
                <MaterialCommunityIcons name="file-document-outline" size={14} color={theme.colors.primary} />
                <Text style={styles.voucherIndicatorText}>
                  View Voucher Details
                </Text>
              </View>
            )}
          </View>
        </View>
        
        {isPending && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteReceipt(receipt.id)}
          >
            <MaterialCommunityIcons name="delete" size={22} color={theme.colors.error} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Receipt Management</Text>
          <Text style={styles.subtitle}>{userData?.name || 'Admin'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.uploadButton} 
            onPress={pickImage}
            disabled={isLoading || isUploading}
          >
            <MaterialCommunityIcons name="upload" size={24} color="white" />
            <Text style={styles.uploadButtonText}>Upload</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.iconButton} onPress={navigateToProfile}>
            <MaterialCommunityIcons name="account" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={24} color={theme.colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>Filter by Status:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <TouchableOpacity style={[styles.filterChip, styles.activeFilterChip]}>
            <Text style={[styles.filterText, styles.activeFilterText]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Pending</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Approved</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Rejected</Text>
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
            Upload your first receipt by tapping the upload button
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
      {renderUploadProgress()}
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
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.sm,
    borderRadius: 8,
    marginRight: theme.spacing.sm,
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: theme.spacing.xs,
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
    borderRadius: 10,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: theme.spacing.md,
  },
  receiptInfo: {
    flex: 1,
  },
  receiptDate: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pendingBadge: {
    backgroundColor: theme.colors.primary + '30',
  },
  approvedBadge: {
    backgroundColor: theme.colors.success + '30',
  },
  rejectedBadge: {
    backgroundColor: theme.colors.error + '30',
  },
  voucherBadge: {
    backgroundColor: theme.colors.primary + '30',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
    color: theme.colors.text,
  },
  voucherIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  voucherIndicatorText: {
    fontSize: 12,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  deleteButton: {
    padding: theme.spacing.sm,
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
    color: theme.colors.textLight,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
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
  modalScrollContent: {
    padding: theme.spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: theme.spacing.lg,
  },
  detailsContainer: {
    marginTop: theme.spacing.md,
  },
  statusContainer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  statusTextContainer: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  statusDate: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  timelineContainer: {
    marginBottom: theme.spacing.lg,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  timelineBullet: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  timelineContent: {
    flex: 1,
    padding: theme.spacing.xs,
    paddingLeft: theme.spacing.sm,
  },
  timelineEventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  timelineDate: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  timelineUser: {
    fontSize: 12,
    fontStyle: 'italic',
    color: theme.colors.textLight,
  },
  voucherSection: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  voucherSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: theme.spacing.md,
  },
  voucherDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  voucherLabel: {
    fontSize: 14,
    color: theme.colors.textLight,
    flex: 1,
  },
  voucherValue: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 2,
    textAlign: 'right',
  },
  voucherValueHighlight: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
    flex: 2,
    textAlign: 'right',
  },
  descriptionContainer: {
    marginTop: 12,
    marginBottom: 12,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  documentButtons: {
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    justifyContent: 'space-between',
  },
  viewVoucherButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  viewProofButton: {
    backgroundColor: theme.colors.success,
  },
  viewVoucherButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
    marginLeft: 8,
  },
  commentsSection: {
    marginTop: theme.spacing.md,
  },
  commentsSectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  commentBox: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  commentAuthorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  roleBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  roleText: {
    fontSize: 10,
    color: theme.colors.text,
    textTransform: 'uppercase',
  },
  commentDate: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  commentText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  commentTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.error,
    marginBottom: theme.spacing.xs,
  },
  progressModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: theme.spacing.lg,
    width: '80%',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: theme.colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  progressText: {
    marginTop: theme.spacing.md,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
});