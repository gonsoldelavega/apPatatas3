import { Navigate, Outlet } from "react-router-dom";
import { useIsPartner } from "./roles";

/** Rutas del usuario maestro. Un socio que llegue aquí (enlace, marcador...) vuelve al inicio. */
export function OwnerOnly() {
  return useIsPartner() ? <Navigate to="/" replace /> : <Outlet />;
}
