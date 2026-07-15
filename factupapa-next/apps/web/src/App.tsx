import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { LoadingScreen } from "./ui/LoadingScreen";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const CatalogPage = lazy(() =>
  import("./pages/CatalogPage").then((module) => ({
    default: module.CatalogPage,
  })),
);
const ContactsListPage = lazy(() =>
  import("./pages/ContactsListPage").then((module) => ({
    default: module.ContactsListPage,
  })),
);
const ProductsListPage = lazy(() =>
  import("./pages/ProductsListPage").then((module) => ({
    default: module.ProductsListPage,
  })),
);
const ContactDetailPage = lazy(() =>
  import("./pages/ContactDetailPage").then((module) => ({
    default: module.ContactDetailPage,
  })),
);
const ContactFormPage = lazy(() =>
  import("./pages/ContactFormPage").then((module) => ({
    default: module.ContactFormPage,
  })),
);
const ProductFormPage = lazy(() =>
  import("./pages/ProductFormPage").then((module) => ({
    default: module.ProductFormPage,
  })),
);
const ImportsPage = lazy(() =>
  import("./pages/ImportsPage").then((module) => ({
    default: module.ImportsPage,
  })),
);
const MorePage = lazy(() =>
  import("./pages/MorePage").then((module) => ({ default: module.MorePage })),
);
const SalesPage = lazy(() =>
  import("./pages/SalesPage").then((module) => ({ default: module.SalesPage })),
);
const SalesFormPage = lazy(() =>
  import("./pages/SalesFormPage").then((module) => ({
    default: module.SalesFormPage,
  })),
);
const SalesDetailPage = lazy(() =>
  import("./pages/SalesDetailPage").then((module) => ({
    default: module.SalesDetailPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({
    default: module.NotFoundPage,
  })),
);

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="ventas" element={<SalesPage />} />
            <Route path="ventas/nuevo/:kind" element={<SalesFormPage />} />
            <Route path="ventas/:type/:id" element={<SalesDetailPage />} />
            <Route path="catalogo" element={<CatalogPage />}>
              <Route index element={<Navigate to="contactos" replace />} />
              <Route path="contactos" element={<ContactsListPage />} />
              <Route path="productos" element={<ProductsListPage />} />
            </Route>
            <Route path="contactos/nuevo" element={<ContactFormPage />} />
            <Route path="contactos/:id" element={<ContactDetailPage />} />
            <Route path="contactos/:id/editar" element={<ContactFormPage />} />
            <Route path="productos/nuevo" element={<ProductFormPage />} />
            <Route path="productos/:id/editar" element={<ProductFormPage />} />
            <Route path="importar" element={<ImportsPage />} />
            <Route path="mas" element={<MorePage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
