import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, ActivityIndicator, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../utils/theme';
import { CustomInput } from '../components/CustomInput';
import { useAuth } from '../context/AuthContext';
import { db, auth } from '../config/firebaseConfig';
import {
  collection, doc, getDocs, updateDoc, query,
  where, addDoc, deleteDoc, orderBy
} from 'firebase/firestore';

export default function SuperUserScreen({ navigation }) {
  const { userData, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [banks, setBanks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('users'); // users, companies, banks

  // Modals
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form data
  const [companyForm, setCompanyForm] = useState({ name: '', address: '', contactPerson: '', contactEmail: '', contactPhone: '' });
  const [bankForm, setBankForm] = useState({ name: '', address: '', swiftCode: '', contactPerson: '', contactEmail: '', contactPhone: '' });
  const [userForm, setUserForm] = useState({ company: '', bank: '', role: '' });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchUsers(),
      fetchCompanies(),
      fetchBanks()
    ]);
    setRefreshing(false);
  };

  // Fetch all users
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const usersList = [];
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        usersList.push({
          id: doc.id,
          ...userData,
          // Add a display field for user type
          userType: userData.bank ? 'Bank' : userData.company ? 'Company' : 'Unassigned'
        });
      });
      
      setUsers(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      Alert.alert("Error", "Could not load users. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch all companies
  const fetchCompanies = async () => {
    try {
      const companiesRef = collection(db, 'companies');
      const querySnapshot = await getDocs(companiesRef);
      
      const companiesList = [];
      querySnapshot.forEach((doc) => {
        companiesList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setCompanies(companiesList);
    } catch (error) {
      console.error("Error fetching companies:", error);
      Alert.alert("Error", "Could not load companies. Please try again.");
    }
  };

  // Fetch all banks
  const fetchBanks = async () => {
    try {
      const banksRef = collection(db, 'banks');
      const querySnapshot = await getDocs(banksRef);
      
      const banksList = [];
      querySnapshot.forEach((doc) => {
        banksList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setBanks(banksList);
    } catch (error) {
      console.error("Error fetching banks:", error);
      Alert.alert("Error", "Could not load banks. Please try again.");
    }
  };

  // Add new company
  const addCompany = async () => {
    try {
      if (!companyForm.name || !companyForm.contactPerson || !companyForm.contactEmail) {
        Alert.alert("Error", "Please fill in all required fields");
        return;
      }
      
      setLoading(true);
      await addDoc(collection(db, 'companies'), {
        ...companyForm,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      });
      
      Alert.alert("Success", "Company added successfully");
      setShowAddCompanyModal(false);
      setCompanyForm({ name: '', address: '', contactPerson: '', contactEmail: '', contactPhone: '' });
      await fetchCompanies();
    } catch (error) {
      console.error("Error adding company:", error);
      Alert.alert("Error", "Could not add company. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Add new bank
  const addBank = async () => {
    try {
      if (!bankForm.name || !bankForm.swiftCode) {
        Alert.alert("Error", "Please fill in all required fields");
        return;
      }
      
      setLoading(true);
      await addDoc(collection(db, 'banks'), {
        ...bankForm,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      });
      
      Alert.alert("Success", "Bank added successfully");
      setShowAddBankModal(false);
      setBankForm({ name: '', address: '', swiftCode: '', contactPerson: '', contactEmail: '', contactPhone: '' });
      await fetchBanks();
    } catch (error) {
      console.error("Error adding bank:", error);
      Alert.alert("Error", "Could not add bank. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Update user assignments
  const updateUser = async () => {
    try {
      if (!selectedUser) return;
      
      const updates = {};
      
      // Handle company assignment
      if (userForm.company) {
        updates.company = userForm.company;
        // Clear bank if assigning to a company
        updates.bank = null;
      } else if (userForm.bank) {
        updates.bank = userForm.bank;
        // Clear company if assigning to a bank
        updates.company = null;
      }
      
      // Handle role assignment
      if (userForm.role) {
        updates.designation = userForm.role;
        
        // If user is getting a role, they are no longer pending and are approved
        updates.pending = false;
        updates.approved = true;
      }
      
      setLoading(true);
      await updateDoc(doc(db, 'users', selectedUser.id), {
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser.uid
      });
      
      Alert.alert("Success", "User updated successfully");
      setShowEditUserModal(false);
      setUserForm({ company: '', bank: '', role: '' });
      setSelectedUser(null);
      await fetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      Alert.alert("Error", "Could not update user. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Delete company
  const deleteCompany = async (companyId, companyName) => {
    Alert.alert(
      "Delete Company",
      `Are you sure you want to delete ${companyName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteDoc(doc(db, 'companies', companyId));
              
              // Remove company from all users
              const usersRef = collection(db, 'users');
              const q = query(usersRef, where("company", "==", companyId));
              const querySnapshot = await getDocs(q);
              
              const batch = db.batch();
              querySnapshot.forEach((doc) => {
                batch.update(doc.ref, { company: null });
              });
              
              await batch.commit();
              
              Alert.alert("Success", "Company deleted successfully");
              await Promise.all([fetchCompanies(), fetchUsers()]);
            } catch (error) {
              console.error("Error deleting company:", error);
              Alert.alert("Error", "Could not delete company. Please try again.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Delete bank
  const deleteBank = async (bankId, bankName) => {
    Alert.alert(
      "Delete Bank",
      `Are you sure you want to delete ${bankName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteDoc(doc(db, 'banks', bankId));
              
              // Remove bank from all users
              const usersRef = collection(db, 'users');
              const q = query(usersRef, where("bank", "==", bankId));
              const querySnapshot = await getDocs(q);
              
              const batch = db.batch();
              querySnapshot.forEach((doc) => {
                batch.update(doc.ref, { bank: null });
              });
              
              await batch.commit();
              
              Alert.alert("Success", "Bank deleted successfully");
              await Promise.all([fetchBanks(), fetchUsers()]);
            } catch (error) {
              console.error("Error deleting bank:", error);
              Alert.alert("Error", "Could not delete bank. Please try again.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Handle logout
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

  // Render user item for list
  const renderUserItem = ({ item }) => {
    const isPending = item.pending || !item.designation;
    const userStatus = isPending ? 'Pending' : 
                      (item.company || item.bank) ? 
                      (item.designation ? 'Active' : 'Assigned') : 'Inactive';

    let statusColor;
    switch (userStatus) {
      case 'Active': statusColor = theme.colors.success; break;
      case 'Assigned': statusColor = theme.colors.warning; break;
      case 'Pending': statusColor = theme.colors.primary; break;
      default: statusColor = theme.colors.error;
    }

    return (
      <TouchableOpacity
        style={[styles.listItem, isPending && styles.pendingItem]}
        onPress={() => {
          setSelectedUser(item);
          setUserForm({
            company: item.company || '',
            bank: item.bank || '',
            role: item.designation || ''
          });
          setShowEditUserModal(true);
        }}
      >
        <View style={styles.listItemContent}>
          <View style={[styles.avatarContainer, isPending && { backgroundColor: theme.colors.primary + '30' }]}>
            <Text style={styles.avatarText}>{item.name ? item.name.substring(0, 1).toUpperCase() : 'U'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
            <View style={styles.userMetadata}>
              <View style={[styles.userTypeBadge, { backgroundColor: item.company ? '#e3f2fd' : item.bank ? '#f5f5f5' : '#ffebee' }]}>
                <Text style={[styles.userTypeText, { color: item.company ? '#2196f3' : item.bank ? '#424242' : '#f44336' }]}>
                  {item.userType}
                </Text>
              </View>
              <View style={[styles.userRoleBadge, { backgroundColor: item.designation ? '#e8f5e9' : '#fafafa' }]}>
                <Text style={[styles.userRoleText, { color: item.designation ? '#4caf50' : '#9e9e9e' }]}>
                  {item.designation || 'No Role'}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{userStatus}</Text>
              </View>
            </View>
          </View>
        </View>
        {isPending && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>Needs Approval</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render company item for list
  const renderCompanyItem = ({ item }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemContent}>
        <View style={[styles.avatarContainer, { backgroundColor: '#e3f2fd' }]}>
          <Text style={[styles.avatarText, { color: '#2196f3' }]}>{item.name.substring(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.companyInfo}>
          <Text style={styles.companyName}>{item.name}</Text>
          <Text style={styles.companyDetail}>{item.contactPerson}</Text>
          <Text style={styles.companyDetail}>{item.contactEmail}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteCompany(item.id, item.name)}
      >
        <MaterialCommunityIcons name="delete" size={24} color={theme.colors.error} />
      </TouchableOpacity>
    </View>
  );

  // Render bank item for list
  const renderBankItem = ({ item }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemContent}>
        <View style={[styles.avatarContainer, { backgroundColor: '#f5f5f5' }]}>
          <Text style={[styles.avatarText, { color: '#424242' }]}>{item.name.substring(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.bankInfo}>
          <Text style={styles.bankName}>{item.name}</Text>
          <Text style={styles.bankDetail}>Swift: {item.swiftCode}</Text>
          <Text style={styles.bankDetail}>{item.contactPerson || 'No contact person'}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteBank(item.id, item.name)}
      >
        <MaterialCommunityIcons name="delete" size={24} color={theme.colors.error} />
      </TouchableOpacity>
    </View>
  );

  // Create tabs for navigation
  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'users' && styles.activeTab]}
        onPress={() => setActiveTab('users')}
      >
        <MaterialCommunityIcons 
          name="account-group" 
          size={24} 
          color={activeTab === 'users' ? theme.colors.primary : theme.colors.textLight} 
        />
        <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>Users</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'companies' && styles.activeTab]}
        onPress={() => setActiveTab('companies')}
      >
        <MaterialCommunityIcons 
          name="domain" 
          size={24} 
          color={activeTab === 'companies' ? theme.colors.primary : theme.colors.textLight} 
        />
        <Text style={[styles.tabText, activeTab === 'companies' && styles.activeTabText]}>Companies</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'banks' && styles.activeTab]}
        onPress={() => setActiveTab('banks')}
      >
        <MaterialCommunityIcons 
          name="bank" 
          size={24} 
          color={activeTab === 'banks' ? theme.colors.primary : theme.colors.textLight} 
        />
        <Text style={[styles.tabText, activeTab === 'banks' && styles.activeTabText]}>Banks</Text>
      </TouchableOpacity>
    </View>
  );

  // Render Add Company Modal
  const renderAddCompanyModal = () => (
    <Modal
      visible={showAddCompanyModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowAddCompanyModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add New Company</Text>
            <TouchableOpacity onPress={() => setShowAddCompanyModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <CustomInput
              label="Company Name *"
              value={companyForm.name}
              onChangeText={(text) => setCompanyForm({...companyForm, name: text})}
              placeholder="Enter company name"
              autoCapitalize="words"
            />
            <CustomInput
              label="Address"
              value={companyForm.address}
              onChangeText={(text) => setCompanyForm({...companyForm, address: text})}
              placeholder="Enter company address"
              multiline
            />
            <CustomInput
              label="Contact Person *"
              value={companyForm.contactPerson}
              onChangeText={(text) => setCompanyForm({...companyForm, contactPerson: text})}
              placeholder="Enter contact person name"
              autoCapitalize="words"
            />
            <CustomInput
              label="Contact Email *"
              value={companyForm.contactEmail}
              onChangeText={(text) => setCompanyForm({...companyForm, contactEmail: text})}
              placeholder="Enter contact email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <CustomInput
              label="Contact Phone"
              value={companyForm.contactPhone}
              onChangeText={(text) => setCompanyForm({...companyForm, contactPhone: text})}
              placeholder="Enter contact phone"
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={styles.submitButton}
              onPress={addCompany}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Add Company</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Render Add Bank Modal
  const renderAddBankModal = () => (
    <Modal
      visible={showAddBankModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowAddBankModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add New Bank</Text>
            <TouchableOpacity onPress={() => setShowAddBankModal(false)}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <CustomInput
              label="Bank Name *"
              value={bankForm.name}
              onChangeText={(text) => setBankForm({...bankForm, name: text})}
              placeholder="Enter bank name"
              autoCapitalize="words"
            />
            <CustomInput
              label="Swift Code *"
              value={bankForm.swiftCode}
              onChangeText={(text) => setBankForm({...bankForm, swiftCode: text})}
              placeholder="Enter SWIFT code"
              autoCapitalize="characters"
            />
            <CustomInput
              label="Address"
              value={bankForm.address}
              onChangeText={(text) => setBankForm({...bankForm, address: text})}
              placeholder="Enter bank address"
              multiline
            />
            <CustomInput
              label="Contact Person"
              value={bankForm.contactPerson}
              onChangeText={(text) => setBankForm({...bankForm, contactPerson: text})}
              placeholder="Enter contact person name"
              autoCapitalize="words"
            />
            <CustomInput
              label="Contact Email"
              value={bankForm.contactEmail}
              onChangeText={(text) => setBankForm({...bankForm, contactEmail: text})}
              placeholder="Enter contact email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <CustomInput
              label="Contact Phone"
              value={bankForm.contactPhone}
              onChangeText={(text) => setBankForm({...bankForm, contactPhone: text})}
              placeholder="Enter contact phone"
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={styles.submitButton}
              onPress={addBank}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Add Bank</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Render Edit User Modal
  const renderEditUserModal = () => {
    if (!selectedUser) return null;

    const companyOptions = companies.map(company => ({
      label: company.name,
      value: company.id,
    }));

    const bankOptions = banks.map(bank => ({
      label: bank.name,
      value: bank.id,
    }));

    const roleOptions = [
      { label: 'Admin', value: 'admin' },
      { label: 'Finance Manager', value: 'finance' },
      { label: 'Checker', value: 'checker' },
      { label: 'Initiator', value: 'initiator' },
      { label: 'Payment Releaser', value: 'payment' },
      { label: 'Voucher Creator', value: 'voucher' },
    ];

    return (
      <Modal
        visible={showEditUserModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit User</Text>
              <TouchableOpacity onPress={() => setShowEditUserModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <Text style={styles.modalSubtitle}>User Information</Text>
              <View style={styles.userInfoCard}>
                <Text style={styles.userInfoName}>{selectedUser.name}</Text>
                <Text style={styles.userInfoEmail}>{selectedUser.email}</Text>
                <Text style={styles.userInfoDetail}>Contact: {selectedUser.contact || 'Not provided'}</Text>
                <View style={styles.userTypeContainer}>
                  <View style={[styles.userTypeBadge, { backgroundColor: selectedUser.company ? '#e3f2fd' : selectedUser.bank ? '#f5f5f5' : '#ffebee' }]}>
                    <Text style={[styles.userTypeText, { color: selectedUser.company ? '#2196f3' : selectedUser.bank ? '#424242' : '#f44336' }]}>
                      {selectedUser.company ? 'Company' : selectedUser.bank ? 'Bank' : 'Unassigned'}
                    </Text>
                  </View>
                  <View style={[styles.userRoleBadge, { backgroundColor: selectedUser.designation ? '#e8f5e9' : '#fafafa' }]}>
                    <Text style={[styles.userRoleText, { color: selectedUser.designation ? '#4caf50' : '#9e9e9e' }]}>
                      {selectedUser.designation || 'No Role'}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Assign Organization</Text>
              <View style={styles.radioGroup}>
                <Text style={styles.radioLabel}>Organization Type:</Text>
                <View style={styles.radioOptions}>
                  <TouchableOpacity
                    style={[styles.radioOption, userForm.company ? styles.radioOptionSelected : null]}
                    onPress={() => {
                      setUserForm({...userForm, bank: '', company: companies.length > 0 ? companies[0].id : ''});
                    }}
                  >
                    <Text style={[styles.radioText, userForm.company ? styles.radioTextSelected : null]}>Company</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioOption, userForm.bank ? styles.radioOptionSelected : null]}
                    onPress={() => {
                      setUserForm({...userForm, company: '', bank: banks.length > 0 ? banks[0].id : ''});
                    }}
                  >
                    <Text style={[styles.radioText, userForm.bank ? styles.radioTextSelected : null]}>Bank</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioOption, (!userForm.company && !userForm.bank) ? styles.radioOptionSelected : null]}
                    onPress={() => {
                      setUserForm({...userForm, company: '', bank: ''});
                    }}
                  >
                    <Text style={[styles.radioText, (!userForm.company && !userForm.bank) ? styles.radioTextSelected : null]}>ZoomPay</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {userForm.company && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>Select Company:</Text>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.pickerScrollView}
                  >
                    {companyOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.pickerItem,
                          userForm.company === option.value && styles.pickerItemSelected
                        ]}
                        onPress={() => setUserForm({...userForm, company: option.value})}
                      >
                        <Text 
                          style={[
                            styles.pickerItemText,
                            userForm.company === option.value && styles.pickerItemTextSelected
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {userForm.bank && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>Select Bank:</Text>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.pickerScrollView}
                  >
                    {bankOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.pickerItem,
                          userForm.bank === option.value && styles.pickerItemSelected
                        ]}
                        onPress={() => setUserForm({...userForm, bank: option.value})}
                      >
                        <Text 
                          style={[
                            styles.pickerItemText,
                            userForm.bank === option.value && styles.pickerItemTextSelected
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.sectionTitle}>Assign Role</Text>
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerLabel}>Select Role:</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.pickerScrollView}
                >
                  {roleOptions
                    // Filter roles based on organization type
                    .filter(role => {
                      if (userForm.company) {
                        return ['admin', 'finance'].includes(role.value);
                      } else if (userForm.bank) {
                        return ['checker', 'initiator', 'payment'].includes(role.value);
                      } else {
                        // ZoomPay
                        return ['voucher', 'superuser'].includes(role.value);
                      }
                    })
                    .map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.pickerItem,
                          userForm.role === option.value && styles.pickerItemSelected
                        ]}
                        onPress={() => setUserForm({...userForm, role: option.value})}
                      >
                        <Text 
                          style={[
                            styles.pickerItemText,
                            userForm.role === option.value && styles.pickerItemTextSelected
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={updateUser}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Update User</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Main render function
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>ZoomPay Admin</Text>
          <Text style={styles.subtitle}>Super User Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      {renderTabs()}

      {/* Content */}
      <View style={styles.content}>
        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>User Management</Text>
              <Text style={styles.listSubtitle}>{users.length} Users</Text>
            </View>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading users...</Text>
              </View>
            ) : (
              <FlatList
                data={users}
                renderItem={renderUserItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                refreshing={refreshing}
                onRefresh={loadAllData}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="account-off" size={64} color={theme.colors.textLight} />
                    <Text style={styles.emptyText}>No users found</Text>
                    <Text style={styles.emptySubtext}>
                      Users will appear here after they sign up
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}

        {/* Companies Tab */}
        {activeTab === 'companies' && (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Company Management</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddCompanyModal(true)}
              >
                <MaterialCommunityIcons name="plus" size={20} color="white" />
                <Text style={styles.addButtonText}>Add Company</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading companies...</Text>
              </View>
            ) : (
              <FlatList
                data={companies}
                renderItem={renderCompanyItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                refreshing={refreshing}
                onRefresh={loadAllData}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="domain-off" size={64} color={theme.colors.textLight} />
                    <Text style={styles.emptyText}>No companies found</Text>
                    <Text style={styles.emptySubtext}>
                      Add your first company using the button above
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}

        {/* Banks Tab */}
        {activeTab === 'banks' && (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Bank Management</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddBankModal(true)}
              >
                <MaterialCommunityIcons name="plus" size={20} color="white" />
                <Text style={styles.addButtonText}>Add Bank</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading banks...</Text>
              </View>
            ) : (
              <FlatList
                data={banks}
                renderItem={renderBankItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                refreshing={refreshing}
                onRefresh={loadAllData}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="bank-off" size={64} color={theme.colors.textLight} />
                    <Text style={styles.emptyText}>No banks found</Text>
                    <Text style={styles.emptySubtext}>
                      Add your first bank using the button above
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}
      </View>

      {/* Modals */}
      {renderAddCompanyModal()}
      {renderAddBankModal()}
      {renderEditUserModal()}
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    padding: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    marginLeft: 8,
    fontSize: 16,
    color: theme.colors.textLight,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: 'white',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
  },
  listSubtitle: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '500',
    marginLeft: 4,
  },
  listContainer: {
    padding: theme.spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pendingItem: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  listItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  userMetadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  userTypeBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 4,
  },
  userTypeText: {
    fontSize: 12,
  },
  userRoleBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 4,
  },
  userRoleText: {
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
  },
  pendingBadge: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primary + '20',
    borderRadius: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  pendingText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 2,
  },
  bankDetail: {
    fontSize: 14,
    color: theme.colors.textLight,
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
    marginTop: 80,
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
  modalContainer: {
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
  modalContent: {
    padding: theme.spacing.md,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: theme.spacing.md,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  userInfoCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  userInfoName: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 4,
  },
  userInfoEmail: {
    fontSize: 16,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  userInfoDetail: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: 8,
  },
  userTypeContainer: {
    flexDirection: 'row',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  radioGroup: {
    marginBottom: theme.spacing.md,
  },
  radioLabel: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  radioOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  radioOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  radioOptionSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  radioText: {
    color: theme.colors.text,
  },
  radioTextSelected: {
    color: 'white',
    fontWeight: '500',
  },
  pickerContainer: {
    marginBottom: theme.spacing.md,
  },
  pickerLabel: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  pickerScrollView: {
    maxHeight: 50,
  },
  pickerItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
  },
  pickerItemSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pickerItemText: {
    color: theme.colors.text,
  },
  pickerItemTextSelected: {
    color: 'white',
    fontWeight: '500',
  },
});