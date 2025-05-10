import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, Modal, TextInput, StyleSheet
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db, storage, auth } from '../config/firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { theme } from '../utils/theme';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

type Receipt = {
  id: string;
  imageUrl: string;
  pdfUrl?: string;
  paidPdfUrl?: string;
  status: string;
  createdAt: string;
  userName?: string;
  userEmail?: string;
  company?: string;
  ticketNumber?: string;
  processedBy?: string;
  processedAt?: string;
  comments?: any[];
  rejectedReason?: string;
};

export default function PublisherScreen({ navigation }) {
  const [vouchers, setVouchers] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const { userData, logout } = useAuth();

  useEffect(() => { fetchVouchers(); }, []);

  const fetchVouchers = async () => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'receipts'),
        where('status', '==', 'payment_initiated'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const list: Receipt[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setVouchers(list);
    } catch (e) {
      Alert.alert('Error', 'Could not load vouchers');
    }
    setIsLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchVouchers();
  };

  const uploadPaidPDF = async (voucher: Receipt) => {
    try {
      setUploadingId(voucher.id);
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
      if (result.type === 'cancel') {
        setUploadingId(null);
        return;
      }
      const response = await fetch(result.uri);
      const blob = await response.blob();
      const fileName = `paid_vouchers/${voucher.id}-${Date.now()}.pdf`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
      const paidPdfUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'receipts', voucher.id), {
        paidPdfUrl,
        status: 'payment_done',
        publishedBy: userData?.name || auth.currentUser.email,
        publishedAt: new Date().toISOString(),
      });

      Alert.alert('Success', 'Paid PDF uploaded and status updated!');
      fetchVouchers();
    } catch (e) {
      Alert.alert('Error', 'Failed to upload paid PDF');
    }
    setUploadingId(null);
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.downloadAsync(url, fileUri);
      Alert.alert('Downloaded', `File saved to ${fileUri}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to download file');
    }
  };

  const shareFile = async (url: string, filename: string) => {
    try {
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.downloadAsync(url, fileUri);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing not available');
        return;
      }
      await Sharing.shareAsync(fileUri);
    } catch (e) {
      Alert.alert('Error', 'Failed to share file');
    }
  };

  const renderVoucher = (voucher: Receipt) => (
    <View key={voucher.id} style={styles.voucherBox}>
      <Text style={styles.ticketNumber}>{voucher.ticketNumber || 'No Ticket Yet'}</Text>
      <Text style={styles.label}>Name: <Text style={styles.value}>{voucher.userName}</Text></Text>
      <Text style={styles.label}>Email: <Text style={styles.value}>{voucher.userEmail}</Text></Text>
      <Text style={styles.label}>Company: <Text style={styles.value}>{voucher.company}</Text></Text>
      <Text style={styles.label}>Submitted: <Text style={styles.value}>{format(new Date(voucher.createdAt), 'PPP p')}</Text></Text>
      <Text style={styles.label}>Status: <Text style={styles.value}>{voucher.status}</Text></Text>
      {voucher.pdfUrl && (
        <>
          <TouchableOpacity style={styles.actionButton} onPress={() => downloadFile(voucher.pdfUrl!, `voucher-${voucher.id}.pdf`)}>
            <MaterialCommunityIcons name="download" size={20} color="white" />
            <Text style={styles.actionButtonText}>Download PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => shareFile(voucher.pdfUrl!, `voucher-${voucher.id}.pdf`)}>
            <MaterialCommunityIcons name="share-variant" size={20} color="white" />
            <Text style={styles.actionButtonText}>Share PDF</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.actionButton} onPress={() => downloadFile(voucher.imageUrl, `receipt-${voucher.id}.jpg`)}>
        <MaterialCommunityIcons name="download" size={20} color="white" />
        <Text style={styles.actionButtonText}>Download Receipt</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={() => shareFile(voucher.imageUrl, `receipt-${voucher.id}.jpg`)}>
        <MaterialCommunityIcons name="share-variant" size={20} color="white" />
        <Text style={styles.actionButtonText}>Share Receipt</Text>
      </TouchableOpacity>
      {!voucher.paidPdfUrl && (
        <TouchableOpacity
          style={[styles.actionButton, styles.uploadButton]}
          onPress={() => uploadPaidPDF(voucher)}
          disabled={uploadingId === voucher.id}
        >
          <MaterialCommunityIcons name="file-upload" size={20} color="white" />
          <Text style={styles.actionButtonText}>
            {uploadingId === voucher.id ? 'Uploading...' : 'Upload Paid PDF'}
          </Text>
        </TouchableOpacity>
      )}
      {voucher.paidPdfUrl && (
        <>
          <TouchableOpacity style={styles.actionButton} onPress={() => downloadFile(voucher.paidPdfUrl!, `paid-voucher-${voucher.id}.pdf`)}>
            <MaterialCommunityIcons name="download" size={20} color="white" />
            <Text style={styles.actionButtonText}>Download Paid PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => shareFile(voucher.paidPdfUrl!, `paid-voucher-${voucher.id}.pdf`)}>
            <MaterialCommunityIcons name="share-variant" size={20} color="white" />
            <Text style={styles.actionButtonText}>Share Paid PDF</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Publisher</Text>
          <Text style={styles.subtitle}>{userData?.name || 'Publisher'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton} onPress={logout}>
            <MaterialCommunityIcons name="logout" size={24} color={theme.colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading vouchers...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
        >
          {vouchers.length === 0 ? (
            <Text style={styles.emptyText}>No vouchers found.</Text>
          ) : (
            vouchers.map(renderVoucher)
          )}
        </ScrollView>
      )}
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
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
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
  scrollContent: { padding: theme.spacing.md },
  voucherBox: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  ticketNumber: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: theme.colors.primary },
  label: { fontWeight: '500', color: theme.colors.text, marginTop: 2 },
  value: { fontWeight: '400', color: theme.colors.textLight },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.sm,
    borderRadius: 8,
    marginTop: 8,
    justifyContent: 'center',
  },
  uploadButton: { backgroundColor: theme.colors.success },
  actionButtonText: { color: 'white', fontWeight: '500', marginLeft: 8 },
  emptyText: { textAlign: 'center', color: theme.colors.textLight, marginTop: 40, fontSize: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: theme.spacing.md, color: theme.colors.textLight },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: theme.spacing.lg,
    width: '85%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
    color: theme.colors.text,
  },
  input: {
    width: '100%',
    minHeight: 60,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    color: theme.colors.text,
    textAlignVertical: 'top',
  },
});