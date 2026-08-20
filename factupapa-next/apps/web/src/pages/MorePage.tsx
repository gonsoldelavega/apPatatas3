import {
  ChevronRight,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { gmailApi } from "../api/services";
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

const gmailSyncLabel = (value: string | null) => {
  if (!value) return "Todavía no se ha revisado la bandeja.";
  return `Última revisión: ${new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))}`;
};

export function MorePage() {
  const auth = useAuth();
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const gmail = useQuery({ queryKey: ["gmail-connection"], queryFn: gmailApi.status });
  const connectGmail = useMutation({
    mutationFn: gmailApi.connect,
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const disconnectGmail = useMutation({
    mutationFn: gmailApi.disconnect,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gmail-connection"] });
    },
  });
  const gmailResult = searchParams.get("gmail");

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

      <section className="more-section" aria-labelledby="more-business-title">
        <h2 className="more-section__title" id="more-business-title">
          Gestión del negocio
        </h2>
        <div className="more-card-grid">
          <Link className="info-card info-card--action" to="/catalogo/contactos">
            <span className="info-card__icon info-card__icon--contacts">
              <UsersRound />
            </span>
            <div className="info-card__body">
              <h2>Clientes y proveedores</h2>
              <p>Contactos, condiciones y deuda.</p>
            </div>
            <ChevronRight className="info-card__chevron" aria-hidden="true" />
          </Link>

          <Link className="info-card info-card--action" to="/importar">
            <span className="info-card__icon info-card__icon--import">
              <Upload />
            </span>
            <div className="info-card__body">
              <h2>Importaciones</h2>
              <p>Excel, CSV o JSON con revisión previa.</p>
            </div>
            <ChevronRight className="info-card__chevron" aria-hidden="true" />
          </Link>

          <Link className="info-card info-card--action" to="/ajustes/ventas">
            <span className="info-card__icon info-card__icon--billing">
              <Settings2 />
            </span>
            <div className="info-card__body">
              <h2>Facturación</h2>
              <p>Serie, numeración, IVA y plantilla.</p>
            </div>
            <ChevronRight className="info-card__chevron" aria-hidden="true" />
          </Link>

          <Link className="info-card info-card--action" to="/stock">
            <span className="info-card__icon info-card__icon--stock">
              <PackageCheck />
            </span>
            <div className="info-card__body">
              <h2>Stock y producción</h2>
              <p>Existencias, movimientos y costes.</p>
            </div>
            <ChevronRight className="info-card__chevron" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="more-section" aria-labelledby="more-shortcuts-title">
        <h2 className="more-section__title" id="more-shortcuts-title">
          Herramientas
        </h2>
        <div className="more-quick-grid">
          <Link to="/ajustes/seguridad">
            <ShieldCheck aria-hidden="true" />
            <strong>Seguridad</strong>
            <small>Acceso y sesiones</small>
          </Link>
          <Link to="/exportar">
            <FileDown aria-hidden="true" />
            <strong>Exportación</strong>
            <small>Datos en CSV</small>
          </Link>
          <a href="#integraciones">
            <Mail aria-hidden="true" />
            <strong>Integraciones</strong>
            <small>Gmail y servicios</small>
          </a>
        </div>
      </section>

      <section className="more-section" aria-labelledby="more-tools-title">
        <h2 className="more-section__title" id="more-tools-title">
          Integraciones
        </h2>
        <div className="more-card-grid">
          <section id="integraciones" className="info-card integration-card" aria-label="Estado de Gmail">
            <span className="info-card__icon info-card__icon--mail">
              <Mail />
            </span>
            <div className="info-card__body">
              <div className="integration-card__heading">
                <h2>Gmail</h2>
                <span className={`connection-status ${gmail.data?.connected ? "connection-status--on" : "connection-status--off"}`}>
                  {gmail.isLoading
                    ? "Comprobando"
                    : gmail.data?.connected
                      ? gmail.data.canRead ? "Conectado" : "Falta autorizar lectura"
                      : gmail.data?.available === false
                        ? "No disponible"
                        : "No conectado"}
                </span>
              </div>
              <p>
                {gmail.data?.connected
                  ? gmail.data.canRead
                    ? `Cuenta autorizada: ${gmail.data.email}. FactuPapa puede enviar facturas y leer únicamente los mensajes necesarios para importar adjuntos de compra.`
                    : `La cuenta ${gmail.data.email} conserva el permiso de envío, pero necesita autorizar una vez la lectura para importar facturas recibidas.`
                  : gmail.data?.available === false
                    ? "La conexión de Gmail no está configurada en este entorno."
                    : "Tu inicio de sesión identifica la cuenta, pero Gmail necesita un permiso separado de solo envío."}
              </p>
              {gmail.data?.connected && gmail.data.canRead && (
                <p className={`gmail-sync-state gmail-sync-state--${gmail.data.lastInboxSyncStatus ?? "idle"}`}>
                  <strong>
                    {gmail.data.lastInboxSyncStatus === "failed"
                      ? "La última revisión falló"
                      : gmail.data.lastInboxSyncStatus === "running"
                        ? "Revisando Gmail"
                        : "Sincronización automática activa"}
                  </strong>
                  <span>{gmailSyncLabel(gmail.data.lastInboxSyncAt)}</span>
                  <small>Se revisa automáticamente cada 6 horas.</small>
                </p>
              )}
              {gmailResult === "success" && (
                <p className="integration-feedback integration-feedback--success">Gmail se ha conectado correctamente.</p>
              )}
              {gmailResult === "error" && (
                <p className="integration-feedback integration-feedback--error">No se pudo conectar Gmail. Inténtalo de nuevo.</p>
              )}
              <div className="integration-card__actions">
                {gmail.data?.connected && gmail.data.canRead ? (
                  <Button
                    variant="secondary"
                    busy={disconnectGmail.isPending}
                    onClick={() => {
                      if (window.confirm("¿Desconectar esta cuenta de Gmail?"))
                        disconnectGmail.mutate();
                    }}
                  >
                    Desconectar Gmail
                  </Button>
                ) : (
                  <Button
                    busy={connectGmail.isPending}
                    disabled={gmail.isLoading || gmail.isError || gmail.data?.available === false}
                    onClick={() => {
                      if (gmailResult) {
                        const next = new URLSearchParams(searchParams);
                        next.delete("gmail");
                        setSearchParams(next, { replace: true });
                      }
                      connectGmail.mutate();
                    }}
                  >
                    {gmail.data?.connected ? "Autorizar lectura de Gmail" : "Conectar Gmail"}
                  </Button>
                )}
              </div>
            </div>
          </section>

        </div>
      </section>

      <section className="more-section" aria-labelledby="more-account-title">
        <h2 className="more-section__title" id="more-account-title">
          Cuenta y aplicación
        </h2>
        <div className="more-card-grid">
          <section className="info-card">
            <span className="info-card__icon info-card__icon--protected">
              <ShieldCheck />
            </span>
            <div className="info-card__body">
              <h2>Sesión protegida</h2>
              <p>Tu acceso se renueva de forma segura sin exponer la sesión al navegador.</p>
            </div>
          </section>

          <section className="info-card info-card--appearance">
            <span className="info-card__icon info-card__icon--theme">
              <Moon />
            </span>
            <div className="info-card__body">
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
            <span className="info-card__icon info-card__icon--install">
              <Smartphone />
            </span>
            <div className="info-card__body">
              <h2>Instalable</h2>
              <p>Usa “Añadir a pantalla de inicio” para abrir FactuPapa como app.</p>
            </div>
          </section>
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
