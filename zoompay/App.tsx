import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from 'sonner-native';
import { AuthProvider } from './context/AuthContext';
import HomeScreen from "./screens/HomeScreen";
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import SplashScreen from "./screens/SplashScreen";
import AdminScreen from "./screens/AdminScreen";
import ProfileScreen from "./screens/ProfileScreen";
import AuthLoadingScreen from './screens/AuthLoadingScreen';
import FinanceOfficerScreen from './screens/FinanceScreen';
import VoucherScreen from './screens/VoucherScreen';
import SuperUserScreen from "./screens/SuperUserScreen";
import CheckerScreen from "./screens/CheckerScreen";
import InitiatorScreen from './screens/InitiatorScreen';
import PaymentReleaserScreen from './screens/PaymentReleaserScreen';

const Stack = createNativeStackNavigator();

function RootStack() {
  return (
    <Stack.Navigator 
      initialRouteName="AuthLoading"
      screenOptions={{
        headerShown: false
      }}
    >
      <Stack.Screen name="AuthLoading" component={AuthLoadingScreen} />
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name ="Finance" component={FinanceOfficerScreen} />
      <Stack.Screen name ="Voucher" component={VoucherScreen} />
      <Stack.Screen name="SuperUser" component={SuperUserScreen} />
      <Stack.Screen name="Checker" component={CheckerScreen} />
      <Stack.Screen name="InitiatorScreen" component={InitiatorScreen} />
      <Stack.Screen name="PaymentReleasorScreen" component={PaymentReleaserScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <Toaster />
          <NavigationContainer>
            <RootStack />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    userSelect: "none"
  }
});