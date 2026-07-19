import {
  ContactRound,
  Home,
  MoreHorizontal,
  Plus,
  ReceiptText,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { NewMenu } from "./NewMenu";

const items = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/ventas", label: "Ventas", icon: ReceiptText },
  { to: "/catalogo/contactos", label: "Contactos", icon: ContactRound },
  { to: "/mas", label: "Más", icon: MoreHorizontal },
];

export function BottomNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <nav className="bottom-nav" aria-label="Navegación principal">
        {items.slice(0, 2).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              isActive ? "nav-item nav-item--active" : "nav-item"
            }
          >
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          className="nav-new"
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <span>
            <Plus size={26} aria-hidden="true" />
          </span>
          <small>Nuevo</small>
        </button>
        {items.slice(2).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isActive ? "nav-item nav-item--active" : "nav-item"
            }
          >
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <NewMenu
        open={open}
        onClose={() => setOpen(false)}
        onChoose={(path) => {
          setOpen(false);
          navigate(path);
        }}
      />
    </>
  );
}
