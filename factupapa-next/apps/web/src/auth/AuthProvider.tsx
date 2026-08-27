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
  restore(): Promise<boolean>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const isExplicitDemo = import.meta.env.VITE_DEMO === "1";

const demoUser = {
  id: "demo-user",
  email: "demo@factupapa.test",
  displayName: "Usuario Demo",
  role: "owner",
  company: {
    id: "demo-company",
    name: "Empresa Demo Ficticia",
  },
} as unknown as CurrentUser;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(
    isExplicitDemo ? "authenticated" : "loading",
  );
  const [user, setUser] = useState<CurrentUser | null>(
    isExplicitDemo ? demoUser : null,
  );

  const restore = useCallback(async (): Promise<boolean> => {
    if (isExplicitDemo) return true;
    try {
      await authApi.refresh();
      const current = await authApi.me();
      setUser(current);
      setStatus("authenticated");
      return true;
    } catch {
      apiClient.clearSession();
      queryClient.clear();
      setUser(null);
      setStatus("anonymous");
      return false;
    }
  }, [queryClient]);

  useEffect(() => {
    if (isExplicitDemo) return undefined;

    const unsubscribe = apiClient.onSessionExpired(() => {
      queryClient.clear();
      setUser(null);
      setStatus("anonymous");
    });

    const googleCallback =
      new URLSearchParams(window.location.search).get("google") === "success";

    void restore().finally(() => {
      if (!googleCallback) return;
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient, restore]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (isExplicitDemo) {
        setUser(demoUser);
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
    if (isExplicitDemo) {
      setUser(demoUser);
      setStatus("authenticated");
      return;
    }

    await authApi.logout().catch(() => undefined);
    queryClient.clear();
    setUser(null);
    setStatus("anonymous");
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, user, restore, login, logout }),
    [status, user, restore, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
