import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ToastProvider } from "./ui/ToastProvider";
import "./styles.css";
import "./navigation.css";
import "./integrations.css";
import "./verde-tinta.css";
import "./factupapa-premium.css";
import "./premium-dashboard.css";
import "./purchase-capture-access.css";
import "./more-page-refinement.css";
import "./mobile-login-fix.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
