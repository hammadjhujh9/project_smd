import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../utils/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomInput } from '../components/CustomInput';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebaseConfig';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export default function ProfileScreen({ navigation }) {
  const { userData, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: userData?.name || '',
    company: userData?.company || '',
    contact: userData?.contact || '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  // Toggle edit mode
  const toggleEdit = () => {
    if (isEditing) {
      // Cancel editing
      setFormData({
        name: userData?.name || '',
        company: userData?.company || '',
        contact: userData?.contact || '',
      });
    }
    setIsEditing(!isEditing);
  };

  // Validate profile form
  const validateForm = () => {
    let isValid = true;
    let newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Save profile changes
  const saveChanges = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      const userRef = doc(db, 'users', auth.currentUser.uid);
      
      await updateDoc(userRef, {
        name: formData.name,
        company: formData.company,
        contact: formData.contact,
        updatedAt: new Date().toISOString()
      });

      Alert.alert("Success", "Profile updated successfully");
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Error", "Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Validate password form
  const validatePasswordForm = () => {
    let isValid = true;
    let newErrors = {};

    if (!passwordData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
      isValid = false;
    }

    if (!passwordData.newPassword) {
      newErrors.newPassword = 'New password is required';
      isValid = false;
    } else if (passwordData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters';
      isValid = false;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Change password
  const changePassword = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Re-authenticate user before changing password
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        passwordData.currentPassword
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Change password
      await updatePassword(auth.currentUser, passwordData.newPassword);
      
      Alert.alert("Success", "Password changed successfully");
      setIsChangingPassword(false);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error("Error changing password:", error);
      if (error.code === 'auth/wrong-password') {
        setErrors({...errors, currentPassword: 'Current password is incorrect'});
      } else {
        Alert.alert("Error", "Failed to change password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>My Profile</Text>
        <TouchableOpacity onPress={toggleEdit}>
          <MaterialCommunityIcons
            name={isEditing ? "close" : "pencil"}
            size={24}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Profile Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {userData?.name ? userData.name.substring(0, 2).toUpperCase() : 'A'}
            </Text>
          </View>
          <Text style={styles.userName}>{userData?.name}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>Admin</Text>
          </View>
        </View>

        {/* Profile Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <CustomInput
            label="Name"
            value={formData.name}
            onChangeText={(text) => setFormData({...formData, name: text})}
            editable={isEditing}
            error={errors.name}
          />
          
          <CustomInput
            label="Email"
            value={userData?.email}
            editable={false}
            style={styles.disabledInput}
          />
          
          <CustomInput
            label="Company"
            value={formData.company}
            onChangeText={(text) => setFormData({...formData, company: text})}
            editable={isEditing}
            error={errors.company}
          />
          
          <CustomInput
            label="Contact Number"
            value={formData.contact}
            onChangeText={(text) => setFormData({...formData, contact: text})}
            editable={isEditing}
            keyboardType="phone-pad"
            error={errors.contact}
          />
          
          {isEditing && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveChanges}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Password Section */}
        <View style={styles.passwordSection}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          {!isChangingPassword ? (
            <TouchableOpacity
              style={styles.changePasswordButton}
              onPress={() => setIsChangingPassword(true)}
            >
              <MaterialCommunityIcons name="lock-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.changePasswordText}>Change Password</Text>
            </TouchableOpacity>
          ) : (
            <>
              <CustomInput
                label="Current Password"
                value={passwordData.currentPassword}
                onChangeText={(text) => setPasswordData({...passwordData, currentPassword: text})}
                secureTextEntry
                error={errors.currentPassword}
              />
              
              <CustomInput
                label="New Password"
                value={passwordData.newPassword}
                onChangeText={(text) => setPasswordData({...passwordData, newPassword: text})}
                secureTextEntry
                error={errors.newPassword}
              />
              
              <CustomInput
                label="Confirm New Password"
                value={passwordData.confirmPassword}
                onChangeText={(text) => setPasswordData({...passwordData, confirmPassword: text})}
                secureTextEntry
                error={errors.confirmPassword}
              />
              
              <View style={styles.passwordButtonsRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setIsChangingPassword(false);
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: '',
                    });
                    setErrors({});
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={changePassword}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Update Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={20} color={theme.colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  avatarText: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  roleBadge: {
    backgroundColor: theme.colors.primary + '30',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20,
  },
  roleText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  infoSection: {
    marginBottom: theme.spacing.xl,
  },
  passwordSection: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  disabledInput: {
    backgroundColor: theme.colors.background,
    color: theme.colors.textLight,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  changePasswordText: {
    color: theme.colors.primary,
    fontWeight: '500',
    marginLeft: theme.spacing.sm,
  },
  passwordButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
  },
  cancelButtonText: {
    color: theme.colors.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.error + '20',
    borderRadius: 8,
    marginTop: theme.spacing.xl,
  },
  logoutText: {
    color: theme.colors.error,
    fontWeight: '500',
    marginLeft: theme.spacing.sm,
  },
});