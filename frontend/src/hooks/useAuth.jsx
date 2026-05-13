import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
// import { useNavigate } from "react-router-dom";
import { getMe } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("rg_token") || "",
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hydrate user from token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    getMe(token)
      .then(setUser)
      .catch(() => {
        // Token invalid/expired — clear it
        sessionStorage.removeItem("rg_token");
        setToken("");
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const login = useCallback((newToken, userData) => {
    sessionStorage.setItem("rg_token", newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("rg_token");
    setToken("");
    setUser(null);
    // Navigate is not available here (outside Router context for the provider itself),
    // so we use window.location. AuthProvider is inside BrowserRouter so this is fine.
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
