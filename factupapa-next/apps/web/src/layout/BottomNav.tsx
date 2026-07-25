import {
  Boxes,
  Home,
  MoreHorizontal,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/ventas", label: "Facturas", icon: ReceiptText },
  { to: "/gastos", label: "Gastos", icon: ShoppingBag },
  { to: "/catalogo/productos", label: "Productos", icon: Boxes },
  { to: "/mas", label: "Otros", icon: MoreHorizontal },
] as const;

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            isActive ? "nav-item nav-item--active" : "nav-item"
          }
        >
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
