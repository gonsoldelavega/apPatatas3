import { NavLink, Outlet, useLocation } from "react-router-dom";

export function CatalogPage() {
  const { pathname } = useLocation();
  const productsOnly = pathname.startsWith("/catalogo/productos");

  return (
    <div className={`page${productsOnly ? " catalog-products-page" : ""}`}>
      {!productsOnly ? (
        <>
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
        </>
      ) : null}
      <Outlet />
    </div>
  );
}
