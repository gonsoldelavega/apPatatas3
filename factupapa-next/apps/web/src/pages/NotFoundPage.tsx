import { Link } from "react-router-dom";
import { EmptyState } from "../ui/EmptyState";

export function NotFoundPage() {
  return <div className="page"><EmptyState title="Página no encontrada" description="La dirección no existe o ya no está disponible." action={<Link to="/">Volver al inicio</Link>} /></div>;
}
