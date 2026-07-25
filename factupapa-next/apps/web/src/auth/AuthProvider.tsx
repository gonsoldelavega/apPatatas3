import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

const isTemporaryPreview =
  typeof window !== "undefined" &&
  window.location.hostname.endsWith(".vercel.app");

const previewUser = {
  id: "preview-user",
  email: "demo@factupapa.local",
  displayName: "Fernando",
  role: "owner",
  company: {
    id: "preview-company",
    name: "Gonsol de la Vega",
  },
} as unknown as CurrentUser;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(
    isTemporaryPreview ? "authenticated" : "loading",
  );
  const [user, setUser] = useState<CurrentUser | null>(
    isTemporaryPreview ? previewUser : null,
  );

  useEffect(() => {
    if (isTemporaryPreview) return undefined;

    let active = true;
    const unsubscribe = apiClient.onSessionExpired(() => {
      queryClient.clear();
      if (active) {
        setUser(null);
        setStatus("anonymous");
      }
    });
    const restore = async () => {
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
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (isTemporaryPreview) {
        setUser(previewUser);
        setStatus("authenticated");
        return;
      }

      try {
        queryClient.clear();
        await authApi.login(email, password);
        const current = await authApi.me();
        setUser(current);
        setStatus("authenticated");
      } catch (error) {
        apiClient.clearSession();
        queryClient.clear();
        setUser(null);
        setStatus("anonymous");
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 429)
        ) {
          throw new Error(
            "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.",
          );
        }
        throw error;
      }
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    if (isTemporaryPreview) {
      setUser(previewUser);
      setStatus("authenticated");
      return;
    }

    await authApi.logout().catch(() => undefined);
    queryClient.clear();
    setUser(null);
    setStatus("anonymous");
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
