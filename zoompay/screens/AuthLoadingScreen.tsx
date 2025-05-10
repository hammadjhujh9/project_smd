import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../utils/theme';

export default function AuthLoadingScreen({ navigation }) {
  const { isLoading, currentUser, userData, logout } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (currentUser) {
        if (!userData) {
          // User data not loaded yet
          return;
        }
        
        // Check if user is pending approval or has no designation
        if (userData.pending || !userData.designation) {
          // Sign out and redirect to login
          (async () => {
            await logout();
            Alert.alert(
              "Account Pending Approval",
              "Your account has not been approved yet. Please wait for a SuperUser to assign you a role.",
              [{ text: "OK", onPress: () => navigation.replace('Login') }]
            );
          })();
          return;
        }
        
        // User is approved, route to appropriate screen based on designation
        const designation = userData.designation;
        
        if (designation === 'superuser') {
          navigation.replace('SuperUser');
        } else if (designation === 'admin') {
          navigation.replace('Admin');
        } else if (designation === 'finance') {
          navigation.replace('Finance');
        } else if (designation === 'voucher') {
          navigation.replace('Voucher');
        } else if (designation === 'checker') {
            navigation.replace('Checker');
          } else if (designation === 'initiator') {
            navigation.replace('InitiatorScreen');
          } else if (designation === 'payment') {
            navigation.replace('PaymentReleasorScreen');
        } else {
          // Default to Home if no specific role assigned yet
          navigation.replace('Home');
        }
      } else {
        // No user, send them to the Splash screen
        navigation.replace('Splash');
      }
    }
  }, [isLoading, currentUser, userData]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {isLoading && <Text style={styles.loadingText}>Loading user data...</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 20,
    color: theme.colors.text,
  }
});