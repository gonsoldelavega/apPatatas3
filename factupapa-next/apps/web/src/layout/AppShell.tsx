import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const location = useLocation();

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
      <header className="app-brand-bar">
        <span className="app-brand-bar__identity">
          <img src="/icon.svg" alt="" width="34" height="34" />
          <strong>FactuPapa</strong>
        </span>
        <span className="app-brand-bar__notifications" aria-label="Notificaciones">
          <Bell aria-hidden="true" />
        </span>
      </header>
      <BottomNav />
      {!online ? (
        <div className="offline-banner" role="status" aria-live="polite">
          Sin conexión · tus formularios se conservan en este dispositivo
        </div>
      ) : null}
      <main id="main-content" className="app-main" tabIndex={-1}>
        <div className="route-transition" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
