import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { login, logout, register, resetPassword } from "@/services/authService.js";
import { getCurrentUser, subscribeKeys } from "@/services/storageService.js";

const AuthContext = createContext({
  user: null,
  refreshUser: () => {},
  login,
  logout,
  register,
  resetPassword
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const unsubscribe = subscribeKeys(["currentUser"], () => {
      setUser(getCurrentUser());
    });
    return unsubscribe;
  }, []);

  const refreshUser = () => {
    setUser(getCurrentUser());
  };

  const value = useMemo(
    () => ({
      user,
      refreshUser,
      login,
      logout,
      register,
      resetPassword
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
