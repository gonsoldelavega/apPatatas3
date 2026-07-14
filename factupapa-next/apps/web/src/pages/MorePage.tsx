import { LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/Button";

export function MorePage() {
  const auth = useAuth();
  return <div className="page more-page"><header className="page-heading"><p className="eyebrow">Cuenta y aplicación</p><h1>Más</h1><p>Tu espacio de trabajo y la seguridad de esta sesión.</p></header><section className="profile-card"><div className="profile-avatar">{auth.user?.displayName.slice(0, 2).toUpperCase()}</div><div><h2>{auth.user?.displayName}</h2><p>{auth.user?.email}</p><span>{auth.user?.company.name}</span></div></section><section className="info-card"><ShieldCheck /><div><h2>Sesión protegida</h2><p>El acceso se conserva en memoria y la renovación solo durante esta sesión del navegador.</p></div></section><section className="info-card"><Smartphone /><div><h2>Instalable</h2><p>Usa “Añadir a pantalla de inicio” desde el menú del navegador para abrir FactuPapa como app.</p></div></section><Button variant="danger" icon={<LogOut />} onClick={() => void auth.logout()}>Cerrar sesión</Button><p className="version">FactuPapa Next · Primera validación funcional · Sin datos reales</p></div>;
}
