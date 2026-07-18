import {
  FileDown,
  LogOut,
  Moon,
  Settings2,
  ShieldCheck,
  Smartphone,
  Upload,
  PackageCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";

type ThemeChoice = "auto" | "light" | "dark";

function storedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem("factupapa-theme");
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(theme: ThemeChoice) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "auto") localStorage.removeItem("factupapa-theme");
    else localStorage.setItem("factupapa-theme", theme);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function MorePage() {
  const auth = useAuth();
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);
  return (
    <div className="page more-page">
      <header className="page-heading">
        <p className="eyebrow">Cuenta y aplicación</p>
        <h1>Más</h1>
        <p>Tu espacio de trabajo y la seguridad de esta sesión.</p>
      </header>
      <section className="profile-card">
        <div className="profile-avatar">
          {auth.user?.displayName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h2>{auth.user?.displayName}</h2>
          <p>{auth.user?.email}</p>
          <span>{auth.user?.company.name}</span>
        </div>
      </section>
      <section className="info-card">
        <ShieldCheck />
        <div>
          <h2>Sesión protegida</h2>
          <p>
            El access token vive en memoria y la renovación usa una cookie
            HttpOnly que JavaScript no puede leer.
          </p>
        </div>
      </section>
      <Link className="info-card" to="/importar">
        <Upload />
        <div>
          <h2>Importaciones</h2>
          <p>Valida y confirma lotes ficticios de catálogo.</p>
        </div>
      </Link>
      <Link className="info-card" to="/ajustes/ventas">
        <Settings2 />
        <div>
          <h2>Facturación</h2>
          <p>Configura serie, numeración inicial, IVA y pantalla principal.</p>
        </div>
      </Link>
      <Link className="info-card" to="/exportar">
        <FileDown />
        <div>
          <h2>Exportar</h2>
          <p>CSV de facturas y compras por mes, trimestre o año.</p>
        </div>
      </Link>
      <Link className="info-card" to="/stock">
        <PackageCheck />
        <div>
          <h2>Stock</h2>
          <p>Existencias, valor y venta potencial.</p>
        </div>
      </Link>
      <section className="info-card">
        <Moon />
        <div>
          <h2>Apariencia</h2>
          <p>Elige el tema de la aplicación.</p>
          <div className="theme-switch" role="group" aria-label="Tema">
            {(
              [
                ["auto", "Auto"],
                ["light", "Claro"],
                ["dark", "Oscuro"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                className={theme === value ? "theme-switch__active" : ""}
                onClick={() => {
                  setTheme(value);
                  applyTheme(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="info-card">
        <Smartphone />
        <div>
          <h2>Instalable</h2>
          <p>
            Usa “Añadir a pantalla de inicio” para abrir FactuPapa como app.
          </p>
        </div>
      </section>
      <Button
        variant="danger"
        icon={<LogOut />}
        onClick={() => void auth.logout()}
      >
        Cerrar sesión
      </Button>
      <p className="version">
        FactuPapa Next · Validación ficticia · Sin datos reales
      </p>
    </div>
  );
}
