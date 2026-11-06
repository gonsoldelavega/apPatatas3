import { ListChecks, LogOut, NotebookPen } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";

/** «Más» de los socios: tareas, notas y salir. */
export function PartnerMorePage() {
  const auth = useAuth();
  return (
    <div className="page workspace-page">
      <header className="page-heading">
        <div>
          <h1>Más</h1>
          <p className="form-hint">
            {auth.user?.displayName} · {auth.user?.email}
          </p>
        </div>
      </header>
      <section className="more-section" aria-label="Accesos">
        <div className="more-quick-grid">
          <Link to="/tareas">
            <ListChecks aria-hidden="true" />
            <strong>Tareas</strong>
            <small>Lo que hay que hacer</small>
          </Link>
          <Link to="/notas">
            <NotebookPen aria-hidden="true" />
            <strong>Notas</strong>
            <small>Info de cada bar</small>
          </Link>
        </div>
      </section>
      <Button variant="danger" icon={<LogOut />} onClick={() => void auth.logout()}>
        Salir
      </Button>
    </div>
  );
}
