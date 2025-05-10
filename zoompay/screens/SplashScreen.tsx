import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../utils/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomButton } from '../components/CustomButton';

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    // Auto navigate after 3 seconds if user doesn't press any button
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="wallet-outline" size={80} color={theme.colors.primary} />
          <Text style={styles.title}>ZoomPay</Text>
        </View>
        
        <View style={styles.buttonContainer}>
          <CustomButton
            title="Get Started"
            onPress={() => navigation.replace('Login')}
            style={styles.button}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Developed by Kvorx</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginTop: theme.spacing.md,
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: theme.spacing.xl,
  },
  button: {
    width: '100%',
  },
  footer: {
    marginBottom: theme.spacing.xl,
  },
  footerText: {
    fontSize: 16,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
});