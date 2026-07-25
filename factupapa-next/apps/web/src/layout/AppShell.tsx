import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <BottomNav />
      {!online ? (
        <div className="offline-banner" role="status" aria-live="polite">
          Sin conexión · tus formularios se conservan en este dispositivo
        </div>
      ) : null}
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
