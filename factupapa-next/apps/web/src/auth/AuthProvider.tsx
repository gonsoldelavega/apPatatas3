import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/services";
import { ApiError, apiClient } from "../api/client";
import type { CurrentUser } from "../api/types";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (!apiClient.hasRefreshToken()) {
        if (active) setStatus("anonymous");
        return;
      }
      try {
        await authApi.refresh();
        const current = await authApi.me();
        if (active) {
          setUser(current);
          setStatus("authenticated");
        }
      } catch {
        apiClient.clearSession();
        queryClient.clear();
        if (active) setStatus("anonymous");
      }
    };
    void restore();
    return () => { active = false; };
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      queryClient.clear();
      await authApi.login(email, password);
      const current = await authApi.me();
      setUser(current);
      setStatus("authenticated");
    } catch (error) {
      apiClient.clearSession();
      setStatus("anonymous");
      if (error instanceof ApiError && (error.status === 401 || error.status === 429)) {
        throw new Error("No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.");
      }
      throw error;
    }
  }, [queryClient]);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    queryClient.clear();
    setUser(null);
    setStatus("anonymous");
  }, [queryClient]);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
