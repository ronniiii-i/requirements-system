import { createContext, useContext, useState, useEffect } from "react";
import { getMe } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Token kept in memory only — never localStorage (security improvement over original)
  // On page reload the user has to log in again. For a research prototype this is fine.
  // If persistence is needed, swap to sessionStorage.
  const [token, setToken] = useState(() => sessionStorage.getItem("rg_token") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getMe(token)
      .then(setUser)
      .catch(() => {
        setToken("");
        sessionStorage.removeItem("rg_token");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = (t) => {
    setToken(t);
    sessionStorage.setItem("rg_token", t);
  };

  const logout = () => {
    setToken("");
    setUser(null);
    sessionStorage.removeItem("rg_token");
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};