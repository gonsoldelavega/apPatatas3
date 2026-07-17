import { NavLink, Outlet } from "react-router-dom";

export function CatalogPage() {
  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">Tu catálogo</p>
        <h1>Personas y productos</h1>
        <p>Información útil, disponible cuando la necesitas.</p>
      </header>
      <nav className="segmented" aria-label="Secciones del catálogo">
        <NavLink
          to="/catalogo/contactos"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Contactos
        </NavLink>
        <NavLink
          to="/catalogo/productos"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Productos
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
