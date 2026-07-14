import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingScreen } from "../ui/LoadingScreen";

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "loading") return <LoadingScreen label="Recuperando tu sesión" />;
  if (auth.status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
