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

export function MorePage() {
  const auth = useAuth();
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const google = useQuery({ queryKey: ["gmail-connection"], queryFn: gmailApi.status });
  const connectGoogle = useMutation({
    mutationFn: gmailApi.connect,
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const disconnectGoogle = useMutation({
    mutationFn: gmailApi.disconnect,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gmail-connection"] });
    },
  });
  const googleResult = searchParams.get("gmail");
  const googleReady = Boolean(
    google.data?.connected && google.data.canWriteDrive && google.data.canWriteSheets,
  );

  return (
    <div className="page more-page">
      <header className="page-heading">
        <h1>Otros</h1>
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
            <small>Google y servicios</small>
          </a>
        </div>
      </section>

      <section className="more-section" aria-labelledby="more-tools-title">
        <h2 className="more-section__title" id="more-tools-title">
          Integraciones
        </h2>
        <div className="more-card-grid">
          <section
            id="integraciones"
            className="info-card integration-card"
            aria-label="Estado de la integración de Google"
          >
            <span className="info-card__icon info-card__icon--mail">
              <Mail />
            </span>
            <div className="info-card__body">
              <div className="integration-card__heading">
                <h2>Google</h2>
                <span
                  className={`connection-status ${
                    googleReady ? "connection-status--on" : "connection-status--off"
                  }`}
                >
                  {google.isLoading
                    ? "Comprobando"
                    : googleReady
                      ? "Conectado"
                      : google.data?.connected
                        ? "Permisos incompletos"
                        : google.data?.available === false
                          ? "No disponible"
                          : "No conectado"}
                </span>
              </div>
              <p>
                {google.data?.connected
                  ? `Cuenta: ${google.data.email ?? "Google"}. Drive: ${
                      google.data.canWriteDrive ? "autorizado" : "pendiente"
                    } · Registro Maestro: ${
                      google.data.canWriteSheets ? "autorizado" : "pendiente"
                    }.${google.data.canRead ? " Gmail disponible para funciones explícitas de correo." : ""}`
                  : google.data?.available === false
                    ? "La integración de Google no está configurada en este entorno."
                    : "Conecta la cuenta del negocio para autorizar Drive, Registro Maestro y las funciones explícitas de correo que utilices desde Factupapa."}
              </p>
              <p className="integration-card__note">
                Las compras no se crean automáticamente desde adjuntos de Gmail. El flujo de entrada pasa por el Registro Maestro y se importa de forma supervisada desde Gastos.
              </p>
              {googleResult === "success" && (
                <p className="integration-feedback integration-feedback--success">
                  Google se ha conectado correctamente.
                </p>
              )}
              {googleResult === "error" && (
                <p className="integration-feedback integration-feedback--error">
                  No se pudo conectar Google. Inténtalo de nuevo.
                </p>
              )}
              <div className="integration-card__actions">
                {google.data?.connected ? (
                  <>
                    {!googleReady && (
                      <Button
                        busy={connectGoogle.isPending}
                        disabled={google.isLoading || google.isError}
                        onClick={() => connectGoogle.mutate()}
                      >
                        Completar permisos Google
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      busy={disconnectGoogle.isPending}
                      onClick={() => {
                        if (window.confirm("¿Desconectar esta cuenta de Google?"))
                          disconnectGoogle.mutate();
                      }}
                    >
                      Desconectar Google
                    </Button>
                  </>
                ) : (
                  <Button
                    busy={connectGoogle.isPending}
                    disabled={
                      google.isLoading ||
                      google.isError ||
                      google.data?.available === false
                    }
                    onClick={() => {
                      if (googleResult) {
                        const next = new URLSearchParams(searchParams);
                        next.delete("gmail");
                        setSearchParams(next, { replace: true });
                      }
                      connectGoogle.mutate();
                    }}
                  >
                    Conectar Google
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

      <Button variant="danger" icon={<LogOut />} onClick={() => void auth.logout()}>
        Cerrar sesión
      </Button>

      <p className="version">FactuPapa Next · Beta privada</p>
    </div>
  );
}
