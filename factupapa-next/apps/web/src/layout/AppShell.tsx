import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <BottomNav />
      <main id="main-content" className="app-main" tabIndex={-1}><Outlet /></main>
    </div>
  );
}
