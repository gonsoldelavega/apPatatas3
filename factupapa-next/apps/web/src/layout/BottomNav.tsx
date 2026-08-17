import {
  Boxes,
  Home,
  MoreHorizontal,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

const items = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/ventas", label: "Facturas", icon: ReceiptText, end: false },
  { to: "/gastos", label: "Gastos", icon: ShoppingBag, end: false },
  {
    to: "/catalogo/productos",
    label: "Productos",
    icon: Boxes,
    end: false,
  },
  { to: "/mas", label: "Otros", icon: MoreHorizontal, end: false },
] as const;

function activeNavIndex(pathname: string) {
  if (pathname === "/") return 0;
  if (pathname.startsWith("/ventas")) return 1;
  if (pathname.startsWith("/gastos")) return 2;
  if (
    pathname.startsWith("/catalogo/productos") ||
    pathname.startsWith("/productos")
  ) return 3;
  return 4;
}

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeIndex = activeNavIndex(pathname);

  const transitionTo = (to: string, event: MouseEvent<HTMLAnchorElement>) => {
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches ?? false;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === to ||
      reduceMotion ||
      !viewTransitionDocument.startViewTransition
    ) return;

    event.preventDefault();
    viewTransitionDocument.startViewTransition(() => navigate(to));
  };

  return (
    <nav
      className="bottom-nav"
      aria-label="Navegación principal"
      style={{ "--active-nav-index": activeIndex } as CSSProperties}
    >
      <span className="bottom-nav__indicator" aria-hidden="true" />
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={(event) => transitionTo(to, event)}
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
