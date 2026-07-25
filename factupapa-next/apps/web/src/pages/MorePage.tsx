import {
  FileDown,
  LogOut,
  Mail,
  Moon,
  PackageCheck,
  Settings2,
  ShieldCheck,
  Smartphone,
  Upload,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";

type ThemeChoice = "auto" | "light" | "dark";

function storedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem("factupapa-theme");
    return value === "auto" || value === "light" || value === "dark"
      ? value
      : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: ThemeChoice) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("factupapa-theme", theme);
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
        <p className="eyebrow">Gestión y configuración</p>
        <h1>Otros</h1>
        <p>Clientes, importaciones, seguridad, exportación e integraciones.</p>
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

      <Link className="info-card" to="/catalogo/contactos">
        <UsersRound />
        <div>
          <h2>Clientes y proveedores</h2>
          <p>Contactos, condiciones comerciales, precios particulares y deuda.</p>
        </div>
      </Link>

      <Link className="info-card" to="/importar">
        <Upload />
        <div>
          <h2>Importaciones</h2>
          <p>Importa Excel, CSV o JSON con revisión y control de duplicados.</p>
        </div>
      </Link>

      <Link className="info-card" to="/ajustes/ventas">
        <Settings2 />
        <div>
          <h2>Facturación</h2>
          <p>Configura serie, numeración, IVA y preferencias comerciales.</p>
        </div>
      </Link>

      <section className="info-card integration-card" aria-label="Estado de Gmail">
        <Mail />
        <div>
          <div className="integration-card__heading">
            <h2>Gmail</h2>
            <span className="connection-status connection-status--off">No conectado</span>
          </div>
          <p>
            Puedes descargar o compartir el PDF desde cada factura. El envío directo
            por Gmail se habilitará únicamente cuando exista un conector autorizado.
          </p>
        </div>
      </section>

      <Link className="info-card" to="/ajustes/seguridad">
        <ShieldCheck />
        <div>
          <h2>Seguridad</h2>
          <p>Cambia tu contraseña y revisa las sesiones abiertas.</p>
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
          <h2>Stock y producción</h2>
          <p>Existencias, movimientos, merma, costes y venta potencial.</p>
        </div>
      </Link>

      <section className="info-card">
        <ShieldCheck />
        <div>
          <h2>Sesión protegida</h2>
          <p>
            El acceso permanece en memoria y la renovación usa una cookie HttpOnly
            que JavaScript no puede leer.
          </p>
        </div>
      </section>

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
          <p>Usa “Añadir a pantalla de inicio” para abrir FactuPapa como app.</p>
        </div>
      </section>

      <Button
        variant="danger"
        icon={<LogOut />}
        onClick={() => void auth.logout()}
      >
        Cerrar sesión
      </Button>

      <p className="version">FactuPapa Next · Beta privada</p>
    </div>
  );
}
