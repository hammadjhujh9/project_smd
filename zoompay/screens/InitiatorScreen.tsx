import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, 
  FlatList, Modal, TextInput, Image, Dimensions, RefreshControl, ScrollView, Linking, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db, auth, storage } from '../config/firebaseConfig';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  orderBy, addDoc, serverTimestamp, Timestamp, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { theme } from '../utils/theme';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';

// Define types
interface Voucher {
  id: string;
  receiptId: string;
  imageUrl: string;
  voucherUrl: string;
  paymentProofUrl?: string;
  proofOfPaymentUrl?: string;
  status: string;
  createdAt: string | Timestamp;
  createdBy: string;
  createdByName: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  description: string;
  amount: number;
  ticketNumber: string;
  company: string;
  checkedBy?: string;
  checkedByName?: string;
  checkedAt?: string;
  initiatedBy?: string;
  initiatedByName?: string;
  initiatedAt?: string;
  paymentReleasedBy?: string;
  paymentReleasedByName?: string;
  paymentReleasedAt?: string;
  paymentClosedBy?: string;
  paymentClosedByName?: string;
  paymentClosedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  proofOfPaymentUploadedAt?: string | Timestamp;
  proofOfPaymentUploadedByName?: string;
  comments?: Comment[];
}

interface Comment {
  text: string;
  createdAt: string | Timestamp;
  createdBy: string;
  createdByName: string;
  role: string;
}

export default function InitiatorScreen({ navigation }) {
  // Tab state
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'initiate', title: 'To Initiate' },
    { key: 'proof', title: 'Upload Proof' },
    { key: 'all', title: 'All Vouchers' },
  ]);

  // Vouchers state
  const [checkedVouchers, setCheckedVouchers] = useState<Voucher[]>([]);
  const [releasedVouchers, setReleasedVouchers] = useState<Voucher[]>([]);
  const [allVouchers, setAllVouchers] = useState<Voucher[]>([]);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showVoucherDetailModal, setShowVoucherDetailModal] = useState(false);
  const [comment, setComment] = useState('');
  const [initiationNotes, setInitiationNotes] = useState('');
  const [proofFile, setProofFile] = useState<any>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [filteredCheckedVouchers, setFilteredCheckedVouchers] = useState<Voucher[]>([]);
  const [filteredReleasedVouchers, setFilteredReleasedVouchers] = useState<Voucher[]>([]);
  const [filteredAllVouchers, setFilteredAllVouchers] = useState<Voucher[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // References
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  
  const { userData, logout } = useAuth();

  useEffect(() => {
    fetchVouchers();
  }, []);

  useEffect(() => {
    filterCheckedVouchers();
  }, [checkedVouchers, searchQuery]);

  useEffect(() => {
    filterReleasedVouchers();
  }, [releasedVouchers, searchQuery]);

  useEffect(() => {
    filterAllVouchers();
  }, [allVouchers, searchQuery]);

  useEffect(() => {
    console.log("Tab changed to", index);
    
    // Refresh data when tab changes - use Promise.all for better loading state handling
    const refreshCurrentTab = async () => {
      setIsLoading(true);
      try {
        if (index === 0) { // To Initiate tab
          console.log("Refreshing checked vouchers");
          await fetchCheckedVouchers();
        } 
        else if (index === 1) { // Upload Proof tab
          console.log("Refreshing released vouchers");
          await fetchReleasedVouchers();
        }
        else if (index === 2) { // All Vouchers tab
          console.log("Refreshing all vouchers");
          await fetchVouchers();
        }
      } catch (error) {
        console.error("Error refreshing tab data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    refreshCurrentTab();
  }, [index]);

  const fetchVouchers = useCallback(async () => {
    try {
      console.log("Fetching all vouchers...");
      const vouchersRef = collection(db, 'vouchers');
      const q = query(
        vouchersRef,
        where('createdBy', '==', auth.currentUser?.uid || ''),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      console.log(`Found ${snapshot.size} total vouchers`);
      
      const voucherList: Voucher[] = [];
      snapshot.forEach(docSnapshot => {
        voucherList.push({
          id: docSnapshot.id,
          ...docSnapshot.data() as Omit<Voucher, 'id'>
        });
      });
      
      setAllVouchers(voucherList);
      filterAllVouchers();
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      Alert.alert('Error', 'Failed to load vouchers. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [auth.currentUser?.uid]);

  const fetchCheckedVouchers = useCallback(async () => {
    try {
      // Get vouchers with "checked" status waiting to be initiated
      const vouchersRef = collection(db, 'vouchers');
      const q = query(
        vouchersRef,
        where('status', '==', 'checked'),
        orderBy('checkedAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const voucherList: Voucher[] = [];
      
      snapshot.forEach(docSnapshot => {
        voucherList.push({
          id: docSnapshot.id,
          ...docSnapshot.data() as Omit<Voucher, 'id'>
        });
      });
      
      setCheckedVouchers(voucherList);
    } catch (error) {
      console.error('Error fetching checked vouchers:', error);
      throw error;
    }
  }, []);

  const fetchReleasedVouchers = useCallback(async () => {
    try {
      console.log("Fetching released vouchers...");
      setIsLoading(true);
      const vouchersRef = collection(db, 'vouchers');
      
      // FIXED QUERY - Remove the createdBy filter to make sure we get all vouchers
      const q = query(
        vouchersRef,
        where('status', '==', 'payment_released'),
        // The issue might be here - vouchers could be created by someone else
        // but still assigned to the current user for uploading proof
        // where('createdBy', '==', auth.currentUser?.uid || ''),
        orderBy('releasedAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      console.log(`Found ${snapshot.size} released vouchers`);
      
      const voucherList: Voucher[] = [];
      snapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();
        console.log(`Voucher ${docSnapshot.id}: status=${data.status}`);
        voucherList.push({
          id: docSnapshot.id,
          ...data as Omit<Voucher, 'id'>
        });
      });
      
      console.log("Setting released vouchers:", voucherList.length);
      setReleasedVouchers(voucherList);
      setFilteredReleasedVouchers(voucherList);
    } catch (error) {
      console.error('Error fetching released vouchers:', error);
      Alert.alert('Error', 'Failed to load released vouchers');
    } finally {
      setIsLoading(false);
    }
  }, [auth.currentUser?.uid]);

  const refreshAllData = async () => {
    setIsLoading(true);
    try {
      console.log("Performing full data refresh...");
      
      // Fetch all types of voucher data
      await Promise.all([
        fetchVouchers(),
        fetchCheckedVouchers(),
        fetchReleasedVouchers()
      ]);
      
      console.log("All data refreshed successfully");
    } catch (error) {
      console.error("Error during complete refresh:", error);
      Alert.alert("Error", "Failed to refresh voucher data");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const filterCheckedVouchers = () => {
    if (!searchQuery.trim()) {
      setFilteredCheckedVouchers(checkedVouchers);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = checkedVouchers.filter(voucher => 
      (voucher.ticketNumber && voucher.ticketNumber.toLowerCase().includes(query)) ||
      (voucher.company && voucher.company.toLowerCase().includes(query)) ||
      (voucher.description && voucher.description.toLowerCase().includes(query)) ||
      (voucher.bankName && voucher.bankName.toLowerCase().includes(query)) ||
      (voucher.accountTitle && voucher.accountTitle.toLowerCase().includes(query)) ||
      (voucher.amount && voucher.amount.toString().includes(query))
    );

    setFilteredCheckedVouchers(filtered);
  };

  const filterReleasedVouchers = () => {
    if (!searchQuery.trim()) {
      setFilteredReleasedVouchers(releasedVouchers);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = releasedVouchers.filter(voucher => 
      (voucher.ticketNumber && voucher.ticketNumber.toLowerCase().includes(query)) ||
      (voucher.company && voucher.company.toLowerCase().includes(query)) ||
      (voucher.description && voucher.description.toLowerCase().includes(query)) ||
      (voucher.bankName && voucher.bankName.toLowerCase().includes(query)) ||
      (voucher.accountTitle && voucher.accountTitle.toLowerCase().includes(query)) ||
      (voucher.amount && voucher.amount.toString().includes(query))
    );

    setFilteredReleasedVouchers(filtered);
  };

  const filterAllVouchers = () => {
    if (!searchQuery.trim()) {
      setFilteredAllVouchers(allVouchers);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = allVouchers.filter(voucher => 
      (voucher.ticketNumber && voucher.ticketNumber.toLowerCase().includes(query)) ||
      (voucher.company && voucher.company.toLowerCase().includes(query)) ||
      (voucher.description && voucher.description.toLowerCase().includes(query)) ||
      (voucher.bankName && voucher.bankName.toLowerCase().includes(query)) ||
      (voucher.accountTitle && voucher.accountTitle.toLowerCase().includes(query)) ||
      (voucher.status && voucher.status.toLowerCase().includes(query)) ||
      (voucher.amount && voucher.amount.toString().includes(query))
    );

    setFilteredAllVouchers(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    refreshAllData();
  };

  const viewImage = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setShowImageModal(true);
  };

  const handleInitiateVoucher = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setInitiationNotes('');
    setShowInitiateModal(true);
    closeSwipeables();
  };

  const handleUploadProof = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setProofFile(null);
    setComment('');
    setShowProofModal(true);
    closeSwipeables();
  };

  const handleViewDetails = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowVoucherDetailModal(true);
  };

  const handleViewComments = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowCommentModal(true);
    setComment('');
  };

  const closeSwipeables = (excludeId?: string) => {
    swipeableRefs.current.forEach((ref, id) => {
      if (id !== excludeId && ref) {
        ref.close();
      }
    });
  };

  const initiatePayment = async () => {
    if (!selectedVoucher) return;
    
    try {
      setIsLoading(true);
      
      // Create a comment if notes are provided
      const comments = [...(selectedVoucher.comments || [])];
      
      if (initiationNotes.trim()) {
        const newComment = {
          text: initiationNotes,
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.uid || '',
          createdByName: userData?.name || 'Unknown User',
          role: 'initiator'
        };
        comments.push(newComment);
      }
      
      // Update the voucher
      const voucherRef = doc(db, 'vouchers', selectedVoucher.id);
      await updateDoc(voucherRef, {
        status: 'initiated',
        initiatedBy: auth.currentUser?.uid || '',
        initiatedByName: userData?.name || 'Unknown User',
        initiatedAt: new Date().toISOString(),
        comments
      });
      
      Alert.alert('Success', 'Payment has been initiated successfully.');
      setShowInitiateModal(false);
      fetchVouchers();
    } catch (error) {
      console.error('Error initiating payment:', error);
      Alert.alert('Error', 'Failed to initiate payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const pickProofDocument = async () => {
    try {
      // Check permissions first (especially important for iOS)
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your media library');
        return;
      }

      console.log("Opening document picker...");
      
      // Use document picker for all file types
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true
      });
      
      console.log("Document picker result:", result);
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        console.log("Document picking was canceled");
        return;
      }
      
      const asset = result.assets[0];
      console.log("Selected document:", asset);
      
      // Set the selected file
      setProofFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
      });
      
      // Clear any previous errors
      setUploadError(null);
      
    } catch (error) {
      console.error('Error picking document:', error);
      setUploadError('Failed to select document');
      Alert.alert('Error', 'Failed to select document');
    }
  };

  const uploadProofOfPayment = async () => {
    if (!selectedVoucher || !proofFile) {
      Alert.alert('Error', 'Please select a proof of payment document first');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // Reference to the file
      const { uri, name } = proofFile;
      
      // Generate a clean file name without special characters or encodings
      const timestamp = Date.now();
      const fileExtension = name.split('.').pop() || 'jpg';
      // Use a very simple filename pattern to avoid any encoding issues
      const cleanFileName = `proof_${selectedVoucher.id}_${timestamp}.${fileExtension}`;
      
      console.log(`Attempting to upload proof: ${uri}`);
      console.log(`Target storage path: ${cleanFileName}`);
      
      // Approach 1: Use FileSystem to read file as base64
      try {
        console.log("Reading file with FileSystem...");
        const fileContent = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64
        });
        
        console.log(`File read successful, size: ${fileContent.length} chars`);
        
        // Convert base64 to bytes
        const bytes = base64ToBytes(fileContent);
        console.log(`Converted to bytes array, length: ${bytes.length}`);
        
        // Create storage reference
        const storageRef = ref(storage, `payment_proofs/${cleanFileName}`);
        
        // Upload bytes directly
        console.log("Starting upload...");
        const uploadTask = await uploadBytes(storageRef, bytes);
        
        console.log("Upload completed successfully");
        
        // Get download URL
        const downloadURL = await getDownloadURL(uploadTask.ref);
        console.log('Download URL:', downloadURL);
        
        // Update voucher document
        await updateVoucherWithProof(downloadURL);

        // Close modal and reset state BEFORE showing alert
        setShowProofModal(false);
        setProofFile(null);

        // Show success message
        Alert.alert(
          'Success',
          'Proof of payment has been uploaded successfully',
          [{ text: 'OK' }]
        );

        // Force a refresh regardless of alert response
        setTimeout(() => {
          refreshAllData();
        }, 300);
        
      } catch (error) {
        console.error('Error with FileSystem approach:', error);
        
        // Fallback to Fetch API method
        try {
          console.log("Trying alternative fetch method...");
          const response = await fetch(uri);
          const blob = await response.blob();
          
          console.log(`Blob created, size: ${blob.size} bytes, type: ${blob.type}`);
          
          // Create storage reference
          const storageRef = ref(storage, `payment_proofs/${cleanFileName}`);
          
          // Upload blob
          console.log("Starting upload with blob...");
          const uploadTask = await uploadBytes(storageRef, blob);
          
          console.log("Upload completed successfully");
          
          // Get download URL
          const downloadURL = await getDownloadURL(uploadTask.ref);
          console.log('Download URL:', downloadURL);
          
          // Update voucher document
          await updateVoucherWithProof(downloadURL);
          
          // Close modal and reset state BEFORE showing alert
          setShowProofModal(false);
          setProofFile(null);

          // Show success message
          Alert.alert(
            'Success',
            'Proof of payment has been uploaded successfully',
            [{ text: 'OK' }]
          );

          // Force a refresh regardless of alert response
          setTimeout(() => {
            refreshAllData();
          }, 300);
        } catch (secondError) {
          console.error('Error with fetch approach:', secondError);
          setUploadError(`All upload methods failed. Please try a different file.`);
        }
      }
    } catch (error) {
      console.error('Error in upload process:', error);
      setUploadError(`Upload process failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Helper function to convert base64 to bytes
  const base64ToBytes = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Update the updateVoucherWithProof function
  const updateVoucherWithProof = async (downloadURL: string) => {
    if (!selectedVoucher) return;
    
    try {
      const voucherRef = doc(db, 'vouchers', selectedVoucher.id);
      
      // Build the update data
      const updateData = {
        proofOfPaymentUrl: downloadURL,
        proofOfPaymentUploadedAt: new Date().toISOString(),
        proofOfPaymentUploadedBy: auth.currentUser?.uid || '',
        proofOfPaymentUploadedByName: userData?.name || 'Unknown',
        status: 'payment_completed',
        comments: [...(selectedVoucher.comments || []), {
          text: 'Proof of payment uploaded',
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.uid || '',
          createdByName: userData?.name || 'Unknown User',
          role: 'initiator'
        }]
      };
      
      // Update Firestore
      await updateDoc(voucherRef, updateData);
      
      // Update local state
      const updatedVoucher = { ...selectedVoucher, ...updateData };
      
      // Update all vouchers state
      setAllVouchers(prevVouchers => 
        prevVouchers.map(v => v.id === selectedVoucher.id ? updatedVoucher : v)
      );
      
      // Remove from released vouchers since it's no longer in that status
      setReleasedVouchers(prevVouchers => 
        prevVouchers.filter(v => v.id !== selectedVoucher.id)
      );
      
      // Update filtered states too
      setFilteredAllVouchers(prevVouchers => 
        prevVouchers.map(v => v.id === selectedVoucher.id ? updatedVoucher : v)
      );
      
      setFilteredReleasedVouchers(prevVouchers => 
        prevVouchers.filter(v => v.id !== selectedVoucher.id)
      );
      
      console.log("Voucher updated with proof of payment");
      
      // Force a refresh to make sure all tabs are up to date
      setTimeout(() => {
        refreshAllData();
      }, 500);
      
      return updatedVoucher;
    } catch (error) {
      console.error("Error updating voucher with proof:", error);
      throw error;
    }
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
        role: 'initiator'
      };
      
      const updatedComments = [...(selectedVoucher.comments || []), newComment];
      
      await updateDoc(doc(db, 'vouchers', selectedVoucher.id), {
        comments: updatedComments
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

  const getVoucherStatusDetails = (status: string) => {
    switch (status) {
      case 'in_progress':
        return { text: 'Pending Review', color: theme.colors.warning };
      case 'voucher_created':
        return { text: 'Pending Review', color: theme.colors.warning };
      case 'checked':
        return { text: 'Ready to Initiate', color: theme.colors.primary };
      case 'initiated':
        return { text: 'Initiated', color: theme.colors.info };
      case 'payment_released':
        return { text: 'Pending Proof', color: theme.colors.warning };
      case 'payment_completed':
        return { text: 'Payment Completed', color: theme.colors.success };
      case 'payment_closed':
        return { text: 'Payment Closed', color: theme.colors.success };
      case 'rejected':
        return { text: 'Rejected', color: theme.colors.error };
      default:
        return { text: status, color: theme.colors.textLight };
    }
  };

  const renderCheckedVoucherItem = ({ item }: { item: Voucher }) => {
    const formattedDate = typeof item.checkedAt === 'string'
      ? format(new Date(item.checkedAt), 'dd MMM yyyy, hh:mm a')
      : item.checkedAt 
        ? format((item.checkedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')
        : 'Unknown';

    return (
      <Swipeable
        ref={ref => {
          if (ref) {
            swipeableRefs.current.set(item.id, ref);
          } else if (swipeableRefs.current.has(item.id)) {
            swipeableRefs.current.delete(item.id);
          }
        }}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity 
              style={[styles.swipeAction, { backgroundColor: theme.colors.primary }]}
              onPress={() => handleInitiateVoucher(item)}
            >
              <MaterialCommunityIcons name="play" size={24} color="white" />
              <Text style={styles.swipeActionText}>Initiate</Text>
            </TouchableOpacity>
          </View>
        )}
        onSwipeableOpen={() => closeSwipeables(item.id)}
      >
        <TouchableOpacity 
          style={styles.voucherCard}
          onPress={() => handleViewDetails(item)}
        >
          <View style={styles.voucherHeader}>
            <View>
              <Text style={styles.voucherTitle}>
                {item.ticketNumber || `Voucher #${item.id.substring(0, 6)}`}
              </Text>
              <Text style={styles.voucherCompany}>{item.company}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${theme.colors.primary}20` }]}>
              <Text style={[styles.statusText, { color: theme.colors.primary }]}>Ready to Initiate</Text>
            </View>
          </View>
          
          <View style={styles.voucherDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount:</Text>
              <Text style={styles.detailValueHighlight}>
                ${item.amount.toLocaleString()}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank:</Text>
              <Text style={styles.detailValue}>{item.bankName}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account:</Text>
              <Text style={styles.detailValue}>{item.accountTitle} ({item.accountNumber})</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Checked:</Text>
              <Text style={styles.detailValue}>
                {formattedDate} by {item.checkedByName}
              </Text>
            </View>
          </View>
          
          <View style={styles.voucherActions}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => handleInitiateVoucher(item)}
            >
              <MaterialCommunityIcons name="bank-transfer" size={18} color="white" />
              <Text style={styles.actionButtonText}>Initiate Payment</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.viewFilesSection}>
            <TouchableOpacity 
              style={styles.fileButton}
              onPress={() => viewImage(item.imageUrl)}
            >
              <MaterialCommunityIcons name="file-image-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.fileButtonText}>View Receipt</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.fileButton}
              onPress={() => viewImage(item.voucherUrl)}
            >
              <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.fileButtonText}>View Voucher</Text>
            </TouchableOpacity>
            
            {item.comments && item.comments.length > 0 && (
              <TouchableOpacity 
                style={styles.fileButton}
                onPress={() => handleViewComments(item)}
              >
                <MaterialCommunityIcons name="comment-multiple-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.fileButtonText}>{item.comments.length} Comments</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderReleasedVoucherItem = ({ item }: { item: Voucher }) => {
    const formattedDate = typeof item.paymentReleasedAt === 'string'
      ? format(new Date(item.paymentReleasedAt), 'dd MMM yyyy, hh:mm a')
      : item.paymentReleasedAt 
        ? format((item.paymentReleasedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')
        : 'Unknown';

    return (
      <Swipeable
        ref={ref => {
          if (ref) {
            swipeableRefs.current.set(item.id, ref);
          } else if (swipeableRefs.current.has(item.id)) {
            swipeableRefs.current.delete(item.id);
          }
        }}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity 
              style={[styles.swipeAction, { backgroundColor: theme.colors.success }]}
              onPress={() => handleUploadProof(item)}
            >
              <MaterialCommunityIcons name="upload" size={24} color="white" />
              <Text style={styles.swipeActionText}>Upload</Text>
            </TouchableOpacity>
          </View>
        )}
        onSwipeableOpen={() => closeSwipeables(item.id)}
      >
        <TouchableOpacity 
          style={styles.voucherCard}
          onPress={() => handleViewDetails(item)}
        >
          <View style={styles.voucherHeader}>
            <View>
              <Text style={styles.voucherTitle}>
                {item.ticketNumber || `Voucher #${item.id.substring(0, 6)}`}
              </Text>
              <Text style={styles.voucherCompany}>{item.company}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${theme.colors.warning}20` }]}>
              <Text style={[styles.statusText, { color: theme.colors.warning }]}>Pending Proof</Text>
            </View>
          </View>
          
          <View style={styles.voucherDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount:</Text>
              <Text style={styles.detailValueHighlight}>
                ${item.amount.toLocaleString()}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank:</Text>
              <Text style={styles.detailValue}>{item.bankName}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account:</Text>
              <Text style={styles.detailValue}>{item.accountTitle} ({item.accountNumber})</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Released:</Text>
              <Text style={styles.detailValue}>
                {formattedDate} by {item.paymentReleasedByName}
              </Text>
            </View>
          </View>
          
          <View style={styles.voucherActions}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.colors.success }]}
              onPress={() => handleUploadProof(item)}
            >
              <MaterialCommunityIcons name="upload" size={18} color="white" />
              <Text style={styles.actionButtonText}>Upload Proof of Payment</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.viewFilesSection}>
            <TouchableOpacity 
              style={styles.fileButton}
              onPress={() => viewImage(item.imageUrl)}
            >
              <MaterialCommunityIcons name="file-image-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.fileButtonText}>View Receipt</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.fileButton}
              onPress={() => viewImage(item.voucherUrl)}
            >
              <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.fileButtonText}>View Voucher</Text>
            </TouchableOpacity>
            
            {item.comments && item.comments.length > 0 && (
              <TouchableOpacity 
                style={styles.fileButton}
                onPress={() => handleViewComments(item)}
              >
                <MaterialCommunityIcons name="comment-multiple-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.fileButtonText}>{item.comments.length} Comments</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderAllVoucherItem = ({ item }: { item: Voucher }) => {
    const status = getVoucherStatusDetails(item.status);
    const formattedDate = typeof item.createdAt === 'string'
      ? format(new Date(item.createdAt), 'dd MMM yyyy, hh:mm a')
      : format((item.createdAt as any).toDate(), 'dd MMM yyyy, hh:mm a');
    const isCompleted = item.status === 'payment_completed';

    return (
      <TouchableOpacity 
        style={[
          styles.voucherCard,
          isCompleted && styles.completedVoucherCard
        ]}
        onPress={() => handleViewDetails(item)}
      >
        <View style={styles.voucherHeader}>
          <View>
            <Text style={styles.voucherTitle}>
              {item.ticketNumber || `Voucher #${item.id.substring(0, 6)}`}
            </Text>
            <Text style={styles.voucherCompany}>{item.company}</Text>
          </View>
          <View style={[
            styles.statusBadge, 
            { backgroundColor: `${status.color}20` }
          ]}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.text}
            </Text>
          </View>
        </View>
        
        <View style={styles.voucherDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount:</Text>
            <Text style={styles.detailValueHighlight}>
              ${item.amount.toLocaleString()}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bank:</Text>
            <Text style={styles.detailValue}>{item.bankName}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Account:</Text>
            <Text style={styles.detailValue}>{item.accountTitle} ({item.accountNumber})</Text>
          </View>
          
          {isCompleted && (
            <View style={styles.paymentProofSection}>
              <Text style={styles.paymentProofTitle}>Payment Proof</Text>
              <Text style={styles.paymentProofInfo}>
                {item.proofOfPaymentUploadedAt ? 
                  typeof item.proofOfPaymentUploadedAt === 'string' ?
                    format(new Date(item.proofOfPaymentUploadedAt), 'dd MMM yyyy') :
                    format((item.proofOfPaymentUploadedAt as any).toDate(), 'dd MMM yyyy')
                  : 'Unknown date'}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.viewFilesSection}>
          <TouchableOpacity 
            style={styles.fileButton}
            onPress={() => viewImage(item.imageUrl)}
          >
            <MaterialCommunityIcons name="file-image-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.fileButtonText}>Receipt</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.fileButton}
            onPress={() => viewImage(item.voucherUrl)}
          >
            <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.fileButtonText}>Voucher</Text>
          </TouchableOpacity>
          
          {item.proofOfPaymentUrl && (
            <TouchableOpacity 
              style={styles.fileButton}
              onPress={() => viewImage(item.proofOfPaymentUrl)}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={18} color={theme.colors.success} />
              <Text style={[styles.fileButtonText, { color: theme.colors.success }]}>Proof</Text>
            </TouchableOpacity>
          )}
          
          {item.comments && item.comments.length > 0 && (
            <TouchableOpacity 
              style={styles.fileButton}
              onPress={() => handleViewComments(item)}
            >
              <MaterialCommunityIcons name="comment-multiple-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.fileButtonText}>{item.comments.length}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderInitiateTab = () => {
    return (
      <FlatList
        data={filteredCheckedVouchers}
        renderItem={renderCheckedVoucherItem}
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
            <MaterialCommunityIcons name="bank-check" size={64} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No payments to initiate</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery 
                ? 'Try adjusting your search criteria' 
                : 'Vouchers that have been checked and are ready for initiation will appear here'}
            </Text>
          </View>
        }
      />
    );
  };

  const renderProofTab = () => {
    return (
      <FlatList
        data={filteredReleasedVouchers}
        renderItem={renderReleasedVoucherItem}
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
            <MaterialCommunityIcons name="upload" size={64} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No pending proof uploads</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery 
                ? 'Try adjusting your search criteria' 
                : 'Vouchers that need proof of payment to be uploaded will appear here'}
            </Text>
          </View>
        }
      />
    );
  };

  const renderAllTab = () => {
    return (
      <FlatList
        data={filteredAllVouchers}
        renderItem={renderAllVoucherItem}
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
            <MaterialCommunityIcons name="file-document-multiple-outline" size={64} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No vouchers found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery 
                ? 'Try adjusting your search criteria' 
                : 'Your voucher history will appear here'}
            </Text>
          </View>
        }
      />
    );
  };

  const renderScene = SceneMap({
    initiate: renderInitiateTab,
    proof: renderProofTab,
    all: renderAllTab,
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Payment Initiator</Text>
          <Text style={styles.subtitle}>{userData?.name || 'Bank Employee'}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <MaterialCommunityIcons name="account" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={refreshAllData}
          >
            <MaterialCommunityIcons name="refresh" size={24} color={theme.colors.primary} />
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
        <View style={styles.searchBar}>
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
      
      {/* Loading Indicator */}
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
              indicatorStyle={styles.indicator}
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
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Document Preview</Text>
              <TouchableOpacity onPress={() => setShowImageModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.imageScrollContainer}>
              {selectedImage && selectedImage.toLowerCase().endsWith('.pdf') ? (
                <View style={styles.pdfPreview}>
                  <MaterialCommunityIcons name="file-pdf-box" size={80} color={theme.colors.error} />
                  <Text style={styles.pdfText}>PDF Document</Text>
                  <TouchableOpacity 
                    style={styles.openPdfButton}
                    onPress={() => openURL(selectedImage)}
                  >
                    <Text style={styles.openPdfButtonText}>Open PDF</Text>
                  </TouchableOpacity>
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
                style={[styles.modalAction, { backgroundColor: theme.colors.primary }]}
                onPress={() => {
                  if (selectedImage) {
                    const filename = `zoompay_${Date.now()}.${selectedImage.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg'}`;
                    downloadFile(selectedImage, filename);
                  }
                }}
              >
                <MaterialCommunityIcons name="download" size={20} color="white" />
                <Text style={styles.modalActionText}>Download</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalAction, { backgroundColor: theme.colors.secondary }]}
                onPress={() => {
                  if (selectedImage) {
                    openURL(selectedImage);
                  }
                }}
              >
                <MaterialCommunityIcons name="open-in-new" size={20} color="white" />
                <Text style={styles.modalActionText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Initiate Payment Modal */}
      <Modal
        visible={showInitiateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInitiateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Initiate Payment</Text>
              <TouchableOpacity onPress={() => setShowInitiateModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollContent}>
              <Text style={styles.modalSubtitle}>
                You are about to initiate payment for:
              </Text>
              
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>
                  {selectedVoucher?.ticketNumber || `Voucher #${selectedVoucher?.id.substring(0, 6)}`}
                </Text>
                <Text style={styles.summaryCompany}>{selectedVoucher?.company}</Text>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount:</Text>
                  <Text style={styles.summaryValue}>
                    ${selectedVoucher?.amount.toLocaleString()}
                  </Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Bank:</Text>
                  <Text style={styles.summaryValue}>{selectedVoucher?.bankName}</Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Account:</Text>
                  <Text style={styles.summaryValue}>
                    {selectedVoucher?.accountTitle} ({selectedVoucher?.accountNumber})
                  </Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Description:</Text>
                  <Text style={styles.summaryValue}>{selectedVoucher?.description}</Text>
                </View>
              </View>
              
              <Text style={styles.inputLabel}>Notes (Optional):</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Add any notes regarding this payment initiation..."
                value={initiationNotes}
                onChangeText={setInitiationNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formActionButton, { backgroundColor: theme.colors.border }]}
                  onPress={() => setShowInitiateModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.formActionButton, { backgroundColor: theme.colors.primary }]}
                  onPress={initiatePayment}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="bank-transfer" size={20} color="white" />
                      <Text style={styles.formActionButtonText}>Initiate Payment</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Upload Proof Modal */}
      <Modal
        visible={showProofModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProofModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload Proof of Payment</Text>
              <TouchableOpacity onPress={() => setShowProofModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollContent}>
              <Text style={styles.modalSubtitle}>
                Upload proof of payment for:
              </Text>
              
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>
                  {selectedVoucher?.ticketNumber || `Voucher #${selectedVoucher?.id.substring(0, 6)}`}
                </Text>
                <Text style={styles.summaryCompany}>{selectedVoucher?.company}</Text>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount:</Text>
                  <Text style={styles.summaryValue}>
                    ${selectedVoucher?.amount.toLocaleString()}
                  </Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Bank:</Text>
                  <Text style={styles.summaryValue}>{selectedVoucher?.bankName}</Text>
                </View>
              </View>
              
              <TouchableOpacity 
                style={[
                  styles.uploadButton,
                  proofFile ? styles.uploadButtonSuccess : {}
                ]}
                onPress={pickProofDocument}
              >
                <MaterialCommunityIcons 
                  name={proofFile ? "check-circle" : "upload"} 
                  size={32} 
                  color={proofFile ? theme.colors.success : theme.colors.primary} 
                />
                <Text style={[
                  styles.uploadButtonText,
                  proofFile ? { color: theme.colors.success } : {}
                ]}>
                  {proofFile 
                    ? `Selected: ${proofFile.name || 'File'}` 
                    : 'Select Proof of Payment Document'}
                </Text>
              </TouchableOpacity>
              
              <Text style={styles.inputLabel}>Comments (Optional):</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Add any comments about this payment proof..."
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formActionButton, { backgroundColor: theme.colors.border }]}
                  onPress={() => setShowProofModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.formActionButton, 
                    { backgroundColor: theme.colors.success },
                    !proofFile && styles.disabledButton
                  ]}
                  onPress={uploadProofOfPayment}
                  disabled={!proofFile || uploadingProof}
                >
                  {uploadingProof ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={20} color="white" />
                      <Text style={styles.formActionButtonText}>Upload & Complete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
              ListEmptyComponent={
                <Text style={styles.emptyComments}>No comments yet</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {item.createdByName} <Text style={styles.commentRole}>({item.role})</Text>
                    </Text>
                    <Text style={styles.commentDate}>
                      {typeof item.createdAt === 'string'
                        ? format(new Date(item.createdAt), 'dd MMM yyyy, hh:mm a')
                        : format((item.createdAt as Timestamp).toDate(), 'dd MMM yyyy, hh:mm a')}
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

      {/* Voucher Detail Modal */}
      <Modal
        visible={showVoucherDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoucherDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Voucher Details</Text>
              <TouchableOpacity onPress={() => setShowVoucherDetailModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollContent}>
              {selectedVoucher && (
                <>
                  <View style={styles.detailHeaderSection}>
                    <Text style={styles.detailTitle}>
                      {selectedVoucher.ticketNumber || `Voucher #${selectedVoucher.id.substring(0, 6)}`}
                    </Text>
                    
                    <View style={[
                      styles.detailStatusBadge,
                      { backgroundColor: `${getVoucherStatusDetails(selectedVoucher.status).color}20` }
                    ]}>
                      <Text style={[
                        styles.detailStatusText,
                        { color: getVoucherStatusDetails(selectedVoucher.status).color }
                      ]}>
                        {getVoucherStatusDetails(selectedVoucher.status).text}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Payment Information</Text>
                    
                    <View style={styles.detailItem}>
                      <Text style={styles.detailItemLabel}>Amount:</Text>
                      <Text style={styles.detailItemValue}>
                        ${selectedVoucher.amount.toLocaleString()}
                      </Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Text style={styles.detailItemLabel}>Bank:</Text>
                      <Text style={styles.detailItemValue}>{selectedVoucher.bankName}</Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Text style={styles.detailItemLabel}>Account Title:</Text>
                      <Text style={styles.detailItemValue}>{selectedVoucher.accountTitle}</Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Text style={styles.detailItemLabel}>Account Number:</Text>
                      <Text style={styles.detailItemValue}>{selectedVoucher.accountNumber}</Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Text style={styles.detailItemLabel}>Description:</Text>
                      <Text style={styles.detailItemValue}>{selectedVoucher.description}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Timeline</Text>
                    
                    <View style={styles.timeline}>
                      <View style={styles.timelineItem}>
                        <View style={[styles.timelineIconContainer, { backgroundColor: theme.colors.primary }]}>
                          <MaterialCommunityIcons name="file-document-edit" size={16} color="white" />
                        </View>
                        <View style={styles.timelineContent}>
                          <Text style={styles.timelineTitle}>Created</Text>
                          <Text style={styles.timelineDate}>
                            {typeof selectedVoucher.createdAt === 'string'
                              ? format(new Date(selectedVoucher.createdAt), 'dd MMM yyyy, hh:mm a')
                              : format((selectedVoucher.createdAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                          </Text>
                          <Text style={styles.timelineText}>
                            by {selectedVoucher.createdByName}
                          </Text>
                        </View>
                      </View>
                      
                      {selectedVoucher.checkedAt && (
                        <View style={styles.timelineItem}>
                          <View style={[styles.timelineIconContainer, { backgroundColor: theme.colors.success }]}>
                            <MaterialCommunityIcons name="check" size={16} color="white" />
                          </View>
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Checked</Text>
                            <Text style={styles.timelineDate}>
                              {typeof selectedVoucher.checkedAt === 'string'
                                ? format(new Date(selectedVoucher.checkedAt), 'dd MMM yyyy, hh:mm a')
                                : format((selectedVoucher.checkedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                            </Text>
                            <Text style={styles.timelineText}>
                              by {selectedVoucher.checkedByName}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {selectedVoucher.initiatedAt && (
                        <View style={styles.timelineItem}>
                          <View style={[styles.timelineIconContainer, { backgroundColor: theme.colors.info }]}>
                            <MaterialCommunityIcons name="bank-transfer" size={16} color="white" />
                          </View>
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Initiated</Text>
                            <Text style={styles.timelineDate}>
                              {typeof selectedVoucher.initiatedAt === 'string'
                                ? format(new Date(selectedVoucher.initiatedAt), 'dd MMM yyyy, hh:mm a')
                                : format((selectedVoucher.initiatedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                            </Text>
                            <Text style={styles.timelineText}>
                              by {selectedVoucher.initiatedByName}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {selectedVoucher.paymentReleasedAt && (
                        <View style={styles.timelineItem}>
                          <View style={[styles.timelineIconContainer, { backgroundColor: theme.colors.warning }]}>
                            <MaterialCommunityIcons name="cash" size={16} color="white" />
                          </View>
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Payment Released</Text>
                            <Text style={styles.timelineDate}>
                              {typeof selectedVoucher.paymentReleasedAt === 'string'
                                ? format(new Date(selectedVoucher.paymentReleasedAt), 'dd MMM yyyy, hh:mm a')
                                : format((selectedVoucher.paymentReleasedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                            </Text>
                            <Text style={styles.timelineText}>
                              by {selectedVoucher.paymentReleasedByName}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {selectedVoucher.paymentClosedAt && (
                        <View style={styles.timelineItem}>
                          <View style={[styles.timelineIconContainer, { backgroundColor: theme.colors.success }]}>
                            <MaterialCommunityIcons name="check-circle" size={16} color="white" />
                          </View>
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Payment Closed</Text>
                            <Text style={styles.timelineDate}>
                              {typeof selectedVoucher.paymentClosedAt === 'string'
                                ? format(new Date(selectedVoucher.paymentClosedAt), 'dd MMM yyyy, hh:mm a')
                                : format((selectedVoucher.paymentClosedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                            </Text>
                            <Text style={styles.timelineText}>
                              by {selectedVoucher.paymentClosedByName}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {selectedVoucher.rejectedAt && (
                        <View style={styles.timelineItem}>
                          <View style={[styles.timelineIconContainer, { backgroundColor: theme.colors.error }]}>
                            <MaterialCommunityIcons name="close" size={16} color="white" />
                          </View>
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Rejected</Text>
                            <Text style={styles.timelineDate}>
                              {typeof selectedVoucher.rejectedAt === 'string'
                                ? format(new Date(selectedVoucher.rejectedAt), 'dd MMM yyyy, hh:mm a')
                                : format((selectedVoucher.rejectedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                            </Text>
                            <Text style={styles.timelineText}>
                              by {selectedVoucher.rejectedByName}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>

                  {selectedVoucher && selectedVoucher.proofOfPaymentUrl && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Payment Proof</Text>
                      
                      <TouchableOpacity 
                        style={styles.documentButton}
                        onPress={() => viewImage(selectedVoucher.proofOfPaymentUrl!)}
                      >
                        <MaterialCommunityIcons name="file-document-outline" size={24} color={theme.colors.success} />
                        <Text style={[styles.documentButtonText, { color: theme.colors.success }]}>
                          View Payment Proof
                        </Text>
                      </TouchableOpacity>
                      
                      {selectedVoucher.proofOfPaymentUploadedAt && (
                        <Text style={styles.documentUploadInfo}>
                          Uploaded on {typeof selectedVoucher.proofOfPaymentUploadedAt === 'string'
                            ? format(new Date(selectedVoucher.proofOfPaymentUploadedAt), 'dd MMM yyyy, hh:mm a')
                            : format((selectedVoucher.proofOfPaymentUploadedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')}
                          {selectedVoucher.proofOfPaymentUploadedByName 
                            ? ` by ${selectedVoucher.proofOfPaymentUploadedByName}` 
                            : ''}
                        </Text>
                      )}
                    </View>
                  )}

                  {selectedVoucher && selectedVoucher.status === 'payment_completed' && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Payment Completion Details</Text>
                      
                      <View style={styles.detailItem}>
                        <Text style={styles.detailItemLabel}>Completed By:</Text>
                        <Text style={styles.detailItemValue}>
                          {selectedVoucher.proofOfPaymentUploadedByName || 'Unknown'}
                        </Text>
                      </View>
                      
                      <View style={styles.detailItem}>
                        <Text style={styles.detailItemLabel}>Completed On:</Text>
                        <Text style={styles.detailItemValue}>
                          {selectedVoucher.proofOfPaymentUploadedAt ? 
                            typeof selectedVoucher.proofOfPaymentUploadedAt === 'string' ?
                              format(new Date(selectedVoucher.proofOfPaymentUploadedAt), 'dd MMM yyyy, hh:mm a') :
                              format((selectedVoucher.proofOfPaymentUploadedAt as any).toDate(), 'dd MMM yyyy, hh:mm a')
                            : 'Unknown date'}
                        </Text>
                      </View>
                      
                      {selectedVoucher.proofOfPaymentUrl && (
                        <TouchableOpacity 
                          style={styles.documentButton}
                          onPress={() => viewImage(selectedVoucher.proofOfPaymentUrl!)}
                        >
                          <MaterialCommunityIcons name="check-circle-outline" size={24} color={theme.colors.success} />
                          <Text style={[styles.documentButtonText, { color: theme.colors.success }]}>
                            View Payment Proof
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    padding: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.textLight },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    marginLeft: theme.spacing.xs,
  },
  searchContainer: { padding: theme.spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    height: 40,
  },
  searchInput: { flex: 1, marginLeft: theme.spacing.xs, color: theme.colors.text },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: theme.spacing.md, color: theme.colors.textLight },
  tabBar: { backgroundColor: theme.colors.background },
  indicator: { backgroundColor: theme.colors.primary },
  tabLabel: { fontSize: 14, fontWeight: 'bold' },
  listContainer: { padding: theme.spacing.md },
  emptyContainer: { alignItems: 'center', marginTop: theme.spacing.lg },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.textLight },
  emptySubtext: { fontSize: 14, color: theme.colors.textLight, textAlign: 'center', marginTop: theme.spacing.sm },
  voucherCard: {
    backgroundColor: 'white',
    borderRadius: theme.spacing.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  completedVoucherCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
  },
  voucherHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voucherTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  voucherCompany: { fontSize: 14, color: theme.colors.textLight },
  statusBadge: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.spacing.sm },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  voucherDetails: { marginTop: theme.spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  detailLabel: { fontSize: 14, color: theme.colors.textLight },
  detailValue: { fontSize: 14, color: theme.colors.text },
  detailValueHighlight: { fontSize: 14, fontWeight: 'bold', color: theme.colors.primary },
  voucherActions: { marginTop: theme.spacing.md },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.sm,
    borderRadius: theme.spacing.sm,
    justifyContent: 'center',
  },
  actionButtonText: { color: 'white', fontWeight: '500', marginLeft: theme.spacing.xs },
  viewFilesSection: { flexDirection: 'row', marginTop: theme.spacing.md },
  fileButton: { flexDirection: 'row', alignItems: 'center', marginRight: theme.spacing.md },
  fileButtonText: { marginLeft: theme.spacing.xs, fontSize: 14, color: theme.colors.primary },
  swipeActions: { flexDirection: 'row', alignItems: 'center' },
  swipeAction: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.md, borderRadius: theme.spacing.sm },
  swipeActionText: { color: 'white', fontWeight: 'bold', marginLeft: theme.spacing.xs },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  imageModalContent: { width: '90%', backgroundColor: 'white', borderRadius: theme.spacing.sm, padding: theme.spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  imageScrollContainer: { maxHeight: 300 },
  pdfPreview: { alignItems: 'center', marginTop: theme.spacing.md },
  pdfText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  openPdfButton: { marginTop: theme.spacing.md, backgroundColor: theme.colors.primary, padding: theme.spacing.sm, borderRadius: theme.spacing.sm },
  openPdfButtonText: { color: 'white', fontWeight: 'bold' },
  previewImage: { width: '100%', height: 300 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.md },
  modalAction: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.sm, borderRadius: theme.spacing.sm },
  modalActionText: { color: 'white', fontWeight: 'bold', marginLeft: theme.spacing.xs },
  formModalContent: { width: '90%', backgroundColor: 'white', borderRadius: theme.spacing.sm, padding: theme.spacing.md },
  modalScrollContent: { maxHeight: 400 },
  modalSubtitle: { fontSize: 16, color: theme.colors.textLight, marginBottom: theme.spacing.md },
  summaryCard: { backgroundColor: theme.colors.inputBackground, borderRadius: theme.spacing.sm, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  summaryTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  summaryCompany: { fontSize: 14, color: theme.colors.textLight },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  summaryLabel: { fontSize: 14, color: theme.colors.textLight },
  summaryValue: { fontSize: 14, color: theme.colors.text },
  inputLabel: { fontSize: 14, color: theme.colors.textLight, marginBottom: theme.spacing.sm },
  notesInput: { backgroundColor: theme.colors.inputBackground, borderRadius: theme.spacing.sm, padding: theme.spacing.md, fontSize: 14, color: theme.colors.text },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.md },
  formActionButton: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.sm, borderRadius: theme.spacing.sm },
  cancelButtonText: { color: theme.colors.textLight, fontWeight: 'bold' },
  formActionButtonText: { color: 'white', fontWeight: 'bold', marginLeft: theme.spacing.xs },
  uploadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.md, borderRadius: theme.spacing.sm, marginBottom: theme.spacing.md },
  uploadButtonSuccess: { backgroundColor: theme.colors.success },
  uploadButtonText: { fontSize: 14, fontWeight: 'bold', color: theme.colors.primary, marginLeft: theme.spacing.xs },
  commentModalContent: { width: '90%', backgroundColor: 'white', borderRadius: theme.spacing.sm, padding: theme.spacing.md },
  commentsList: { marginTop: theme.spacing.md },
  emptyComments: { fontSize: 14, color: theme.colors.textLight, textAlign: 'center', marginTop: theme.spacing.md },
  commentItem: { marginBottom: theme.spacing.md },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  commentAuthor: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  commentRole: { fontSize: 12, color: theme.colors.textLight },
  commentDate: { fontSize: 12, color: theme.colors.textLight },
  commentText: { fontSize: 14, color: theme.colors.text },
  addCommentContainer: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.md },
  commentInput: { flex: 1, backgroundColor: theme.colors.inputBackground, borderRadius: theme.spacing.sm, padding: theme.spacing.md, fontSize: 14, color: theme.colors.text },
  addCommentButton: { padding: theme.spacing.md, borderRadius: theme.spacing.sm, backgroundColor: theme.colors.primary, marginLeft: theme.spacing.md },
  detailModalContent: { width: '90%', backgroundColor: 'white', borderRadius: theme.spacing.sm, padding: theme.spacing.md },
  detailHeaderSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  detailTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  detailStatusBadge: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.spacing.sm },
  detailStatusText: { fontSize: 12, fontWeight: 'bold' },
  detailSection: { marginBottom: theme.spacing.md },
  detailSectionTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.sm },
  detailItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  detailItemLabel: { fontSize: 14, color: theme.colors.textLight },
  detailItemValue: { fontSize: 14, color: theme.colors.text },
  timeline: { marginTop: theme.spacing.md },
  timelineItem: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md },
  timelineIconContainer: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  timelineContent: { marginLeft: theme.spacing.md },
  timelineTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  timelineDate: { fontSize: 12, color: theme.colors.textLight },
  timelineText: { fontSize: 14, color: theme.colors.text },
  documentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  documentButtonText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  documentUploadInfo: {
    marginTop: 8,
    fontSize: 14,
    color: theme.colors.textLight,
    fontStyle: 'italic',
  },
  disabledButton: { opacity: 0.5 },
  paymentProofSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: `${theme.colors.success}10`,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success,
  },
  paymentProofTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.success,
    marginBottom: 6,
  },
  paymentProofInfo: {
    fontSize: 14,
    color: theme.colors.text,
  },
});