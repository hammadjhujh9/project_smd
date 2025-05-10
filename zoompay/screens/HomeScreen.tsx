import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../utils/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen({ navigation }) {
  const { userData, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      // The AuthLoadingScreen will handle navigation
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ZoomPay</Text>
        <TouchableOpacity onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {userData?.name ? userData.name.substring(0, 2).toUpperCase() : 'U'}
            </Text>
          </View>
          <Text style={styles.welcomeText}>Welcome, {userData?.name || 'User'}!</Text>
          <Text style={styles.emailText}>{userData?.email || ''}</Text>
          <Text style={styles.designationText}>{userData?.designation || 'User'}</Text>
        </View>

        <View style={styles.cardsContainer}>
          <View style={styles.card}>
            <MaterialCommunityIcons name="account-details" size={36} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Profile</Text>
            <Text style={styles.cardDescription}>View and edit your profile details</Text>
          </View>
          
          <View style={styles.card}>
            <MaterialCommunityIcons name="wallet-outline" size={36} color={theme.colors.success} />
            <Text style={styles.cardTitle}>Vouchers</Text>
            <Text style={styles.cardDescription}>Manage your payment vouchers</Text>
          </View>

          <View style={styles.card}>
            <MaterialCommunityIcons name="chart-line" size={36} color={theme.colors.secondary} />
            <Text style={styles.cardTitle}>Activity</Text>
            <Text style={styles.cardDescription}>View your recent activities</Text>
          </View>
        </View>
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
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  avatarText: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  emailText: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.xs,
  },
  designationText: {
    fontSize: 16,
    color: theme.colors.secondary,
    textTransform: 'capitalize',
  },
  cardsContainer: {
    marginTop: theme.spacing.xl,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginVertical: theme.spacing.sm,
  },
  cardDescription: {
    fontSize: 14,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
});