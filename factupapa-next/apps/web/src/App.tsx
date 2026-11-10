import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { OwnerOnly } from "./auth/OwnerOnly";
import { AppShell } from "./layout/AppShell";
import { LoadingScreen } from "./ui/LoadingScreen";
import { DialogHost } from "./ui/dialogs";

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
const MoreRoute = lazy(() =>
  import("./pages/MoreRoute").then((module) => ({ default: module.MoreRoute })),
);
const OrdersPage = lazy(() =>
  import("./pages/OrdersPage").then((module) => ({ default: module.OrdersPage })),
);
const TasksPage = lazy(() =>
  import("./pages/TasksPage").then((module) => ({ default: module.TasksPage })),
);
const NotesPage = lazy(() =>
  import("./pages/NotesPage").then((module) => ({ default: module.NotesPage })),
);
const LedgerPage = lazy(() =>
  import("./pages/LedgerPage").then((module) => ({ default: module.LedgerPage })),
);
const ExportPage = lazy(() =>
  import("./pages/ExportPage").then((module) => ({
    default: module.ExportPage,
  })),
);
const CompanyProfilePage = lazy(() =>
  import("./pages/CompanyProfilePage").then((module) => ({
    default: module.CompanyProfilePage,
  })),
);
const SalesSettingsPage = lazy(() =>
  import("./pages/SalesSettingsPage").then((module) => ({
    default: module.SalesSettingsPage,
  })),
);
const SalesPage = lazy(() =>
  import("./pages/SalesPage").then((module) => ({ default: module.SalesPage })),
);
const SalesFormRoute = lazy(() =>
  import("./pages/SalesFormRoute").then((module) => ({
    default: module.SalesFormRoute,
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
const ExpensesPage = lazy(() =>
  import("./pages/ExpensesPage").then((module) => ({
    default: module.ExpensesPage,
  })),
);
const PurchaseFormPage = lazy(() =>
  import("./pages/PurchaseFormPage").then((module) => ({
    default: module.PurchaseFormPage,
  })),
);
const PurchaseDetailPage = lazy(() =>
  import("./pages/PurchaseDetailPage").then((module) => ({
    default: module.PurchaseDetailPage,
  })),
);
const StockPage = lazy(() =>
  import("./pages/StockPage").then((module) => ({
    default: module.StockPage,
  })),
);
const GestoriaPage = lazy(() =>
  import("./pages/GestoriaPage").then((module) => ({
    default: module.GestoriaPage,
  })),
);
const TeamPage = lazy(() =>
  import("./pages/TeamPage").then((module) => ({ default: module.TeamPage })),
);
const AccountSecurityPage = lazy(() =>
  import("./pages/AccountSecurityPage").then((module) => ({
    default: module.AccountSecurityPage,
  })),
);

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DialogHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="ventas" element={<SalesPage />} />
            <Route path="ventas/nuevo/:kind" element={<SalesFormRoute />} />
            <Route path="ventas/:type/:id" element={<SalesDetailPage />} />
            {/* Espacio compartido: maestro y socios. */}
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="tareas" element={<TasksPage />} />
            <Route path="notas" element={<NotesPage />} />
            <Route path="cuentas" element={<LedgerPage />} />
            <Route path="mas" element={<MoreRoute />} />
            {/* Los socios pueden consultar y dar de alta clientes, proveedores y productos (no editarlos). */}
            <Route path="catalogo" element={<CatalogPage />}>
              <Route index element={<Navigate to="contactos" replace />} />
              <Route path="contactos" element={<ContactsListPage />} />
              <Route path="productos" element={<ProductsListPage />} />
            </Route>
            <Route path="contactos/nuevo" element={<ContactFormPage />} />
            <Route path="productos/nuevo" element={<ProductFormPage />} />
            {/* Todo lo que sigue es solo del usuario maestro: un socio vuelve al inicio. */}
            <Route element={<OwnerOnly />}>
              <Route path="gastos" element={<ExpensesPage />} />
              <Route path="gastos/nuevo" element={<PurchaseFormPage />} />
              <Route path="gastos/:id" element={<PurchaseDetailPage />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="contactos/:id" element={<ContactDetailPage />} />
              <Route path="contactos/:id/editar" element={<ContactFormPage />} />
              <Route path="productos/:id/editar" element={<ProductFormPage />} />
              <Route path="importar" element={<ImportsPage />} />
              <Route path="exportar" element={<ExportPage />} />
              <Route path="socios" element={<TeamPage />} />
              <Route path="gestoria" element={<GestoriaPage />} />
              <Route path="ajustes/empresa" element={<CompanyProfilePage />} />
              <Route path="ajustes/ventas" element={<SalesSettingsPage />} />
              <Route path="ajustes/seguridad" element={<AccountSecurityPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
