import { LogOut, Settings2, ShieldCheck, Smartphone, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";

export function MorePage() {
  const auth = useAuth();
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
