import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { auth, db } from '../config/firebaseConfig';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

interface AuthProviderProps {
  children: ReactNode;
}

interface UserData {
  uid: string;
  name: string;
  email: string;
  designation?: string;
  company?: string;
  bank?: string;
  contact: string;
  pending?: boolean;
  approved?: boolean;
  createdAt: string;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  isLoading: boolean;
  signUp: (email: string, password: string, userData: Omit<UserData, 'uid'>) => Promise<UserData>;
  signIn: (email: string, password: string) => Promise<UserData>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  getReceiptCounts: () => Promise<{pending: number, approved: number, rejected: number}>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data from Firestore
  const fetchUserData = async (user: User) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data() as UserData;
        setUserData(data);
        return data;
      }
      return null;
    } catch (err) {
      console.error("Error fetching user data:", err);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          // Set loading to true while fetching user data
          setIsLoading(true);
          const userData = await fetchUserData(user);
          setUserData(userData);
        } catch (err) {
          console.error("Error in auth state changed:", err);
        } finally {
          // Only set loading to false after userData is fetched
          setIsLoading(false);
        }
      } else {
        setUserData(null);
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signUp = async (email: string, password: string, data: Omit<UserData, 'uid'>) => {
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Save additional user data in Firestore
      const userDocRef = doc(db, 'users', result.user.uid);
      const userData = {
        uid: result.user.uid,
        email,
        name: data.name,
        designation: data.designation,
        company: data.company,
        bank: data.bank,
        contact: data.contact,
        pending: true,
        approved: false,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(userDocRef, userData);
      
      // Update local state
      setUserData(userData);
      
      return userData;
      
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign up');
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      const result = await signInWithEmailAndPassword(auth, email, password);
      
      // Immediately fetch and return user data
      const userData = await fetchUserData(result.user);
      
      if (!userData) {
        throw new Error('Failed to fetch user data after login');
      }
      
      // Check for pending status or missing designation
      if (userData.pending || !userData.designation) {
        // Sign out the user
        await auth.signOut();
        throw new Error('Your account is pending approval. Please wait for a SuperUser to assign you a role.');
      }
      
      return userData;
      
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in');
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
    } catch (err: any) {
      setError(err.message || 'An error occurred during logout');
      throw err;
    }
  };

  const getReceiptCounts = async () => {
    if (!currentUser) return { pending: 0, approved: 0, rejected: 0 };
    
    try {
      const receiptsRef = collection(db, 'receipts');
      const q = query(receiptsRef, where("createdBy", "==", currentUser.uid));
      const querySnapshot = await getDocs(q);
      
      let counts = { pending: 0, approved: 0, rejected: 0 };
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'pending') counts.pending++;
        else if (data.status === 'approved') counts.approved++;
        else if (data.status === 'rejected') counts.rejected++;
      });
      
      return counts;
    } catch (err) {
      console.error("Error getting receipt counts:", err);
      return { pending: 0, approved: 0, rejected: 0 };
    }
  };

  const clearError = () => setError(null);

  const value: AuthContextType = {
    currentUser,
    userData,
    isLoading,
    signUp,
    signIn,
    logout,
    error,
    clearError,
    getReceiptCounts
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};