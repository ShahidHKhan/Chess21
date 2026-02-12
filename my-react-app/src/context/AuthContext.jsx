import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, googleProvider, db } from "../utils/firebase";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Function to Login with Google
  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if new user, or update existing "lastSeen"
      // This saves them to your "Phonebook" so others can find them
      await setDoc(doc(db, "users", user.email), {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastSeen: serverTimestamp(),
      }, { merge: true }); // merge: true prevents overwriting existing data fields
      
    } catch (error) {
      console.error("Error logging in: ", error);
    }
  };

  // 2. Function to Logout
  const logout = () => signOut(auth);

  // 3. Listen for changes (User logs in or out)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loginWithGoogle,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};