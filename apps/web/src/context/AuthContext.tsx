import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearToken,
  getMe,
  getToken,
  login as apiLogin,
  register as apiRegister,
  setToken,
} from "@/api/client";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import type { User } from "@/types/chat";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Réhydrate la session depuis le token stocké au démarrage.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        connectSocket(token);
      })
      .catch(() => {
        clearToken();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await apiLogin(username, password);
    setToken(token);
    setUser(u);
    connectSocket(token);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await apiRegister(username, password);
    setToken(token);
    setUser(u);
    connectSocket(token);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    disconnectSocket();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
