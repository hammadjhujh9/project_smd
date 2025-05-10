import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomInput } from '../components/CustomInput';
import { theme } from '../utils/theme';
import { useAuth } from '../context/AuthContext';
import * as Animatable from 'react-native-animatable';
import { Ionicons } from '@expo/vector-icons';

export default function SignupScreen({ navigation }) {
  const { signUp, error, clearError, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validateForm = () => {
    let isValid = true;
    let formErrors = {};

    // Validate name
    if (!name.trim()) {
      formErrors.name = 'Name is required';
      isValid = false;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      formErrors.email = 'Email is required';
      isValid = false;
    } else if (!emailRegex.test(email)) {
      formErrors.email = 'Please enter a valid email address';
      isValid = false;
    }

    // Validate password
    if (!password) {
      formErrors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      formErrors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      formErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    // Validate contact number (optional but if provided, must be at least 10 digits)
    if (contactNumber && contactNumber.length < 10) {
      formErrors.contactNumber = 'Please enter a valid contact number';
      isValid = false;
    }

    setErrors(formErrors);
    return isValid;
  };

  const handleSignup = async () => {
    clearError();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, {
        name,
        contact: contactNumber || "",
        designation: "pending",
        company: null,
        bank: null,
        approved: false,
        pending: true
      });

      // Explicitly log out the user after signing up
      await logout();

      Alert.alert(
        "Registration Successful",
        "Your account has been created and is pending approval. A SuperUser will need to assign you to a company/bank and give you a role before you can log in.",
        [
          { 
            text: "OK", 
            onPress: () => navigation.navigate('Login') 
          }
        ]
      );
    } catch (err) {
      console.error('Signup error:', err);
      // Error is handled by the context and displayed below
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Logo Section */}
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/favicon.png')} 
              style={styles.logo} 
              resizeMode="contain" 
            />
            <Text style={styles.appName}>ZoomPay</Text>
          </View>

          {/* Form Section */}
          <Animatable.View 
            animation="fadeInUp" 
            duration={1000} 
            delay={300}
            style={styles.formContainer}
          >
            <Text style={styles.title}>Create an Account</Text>
            <Text style={styles.subtitle}>Please fill in the details below</Text>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <CustomInput
              label="Full Name"
              placeholder="Enter your full name"
              value={name}
              onChangeText={setName}
              error={errors.name}
              autoCapitalize="words"
            />

            <CustomInput
              label="Email"
              placeholder="Enter your email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <CustomInput
              label="Password"
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              error={errors.password}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off" : "eye"} size={24} color={theme.colors.textLight} />
                </TouchableOpacity>
              }
            />

            <CustomInput
              label="Confirm Password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              error={errors.confirmPassword}
              rightIcon={
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={24} color={theme.colors.textLight} />
                </TouchableOpacity>
              }
            />

            <CustomInput
              label="Contact Number"
              placeholder="Enter your contact number"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              error={errors.contactNumber}
            />

            <TouchableOpacity 
              style={styles.signupButton}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.signupButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Login</Text>
              </TouchableOpacity>
            </View>
          </Animatable.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: theme.spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: theme.spacing.md,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.lg,
  },
  errorContainer: {
    backgroundColor: theme.colors.error + '20',
    borderRadius: 8,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
  },
  signupButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  signupButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  loginText: {
    color: theme.colors.textLight,
  },
  loginLink: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});