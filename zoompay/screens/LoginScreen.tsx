import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomInput } from '../components/CustomInput';
import { CustomButton } from '../components/CustomButton';
import { theme } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const { signIn, error, clearError, userData, isLoading: authLoading } = useAuth();

  React.useEffect(() => {
    // Check if we have stored credentials
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('userEmail');
        const savedPassword = await AsyncStorage.getItem('userPassword');
        
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
        }
      } catch (err) {
        console.error("Error loading saved credentials:", err);
      }
    };
    
    loadSavedCredentials();
  }, []);

  const validateForm = () => {
    let isValid = true;
    let newErrors = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleLogin = async () => {
    clearError();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      await signIn(email, password);
      
      // Store credentials if remember me is checked
      if (rememberMe) {
        await AsyncStorage.setItem('userEmail', email);
        await AsyncStorage.setItem('userPassword', password);
      } else {
        await AsyncStorage.removeItem('userEmail');
        await AsyncStorage.removeItem('userPassword');
      }
      
      // This will redirect to AuthLoading which handles role-based navigation
      navigation.replace('AuthLoading');
    } catch (err) {
      console.error('Login error:', err);
      // If error message contains "pending approval", show a specific alert
      if (err.message?.includes('pending approval')) {
        Alert.alert(
          "Account Pending Approval",
          "Your account has not been approved yet. Please wait for a SuperUser to assign you a role.",
          [{ text: "OK" }]
        );
      }
      // Other errors are handled by the context
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    // Navigate to a "Forgot Password" screen, or show a modal
    Alert.alert(
      "Forgot Password",
      "Please enter your email address to receive a password reset link",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Send Link",
          onPress: () => {
            // Implement password reset functionality here
            Alert.alert("Password Reset", "If your email is registered, you'll receive a password reset link shortly.");
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
          <CustomInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            error={errors.email}
          />

          <CustomInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            error={errors.password}
          />

          <View style={styles.rememberForgot}>
            <View style={styles.checkboxContainer}>
              <Checkbox
                value={rememberMe}
                onValueChange={setRememberMe}
                color={rememberMe ? theme.colors.primary : undefined}
              />
              <Text style={styles.rememberText}>Remember me</Text>
            </View>
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          <CustomButton
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
          />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.socialButtons}>
            <TouchableOpacity style={styles.socialButton}>
              <Ionicons name="logo-google" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton}>
              <Ionicons name="logo-apple" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
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
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.xl,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textLight,
  },
  form: {
    flex: 1,
  },
  rememberForgot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rememberText: {
    marginLeft: theme.spacing.xs,
    color: theme.colors.text,
  },
  forgotText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.xl,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  orText: {
    marginHorizontal: theme.spacing.md,
    color: theme.colors.textLight,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  socialButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  footerText: {
    color: theme.colors.textLight,
  },
  footerLink: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: theme.colors.error + '20',
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorMessage: {
    color: theme.colors.error,
    fontSize: 14,
  },
});