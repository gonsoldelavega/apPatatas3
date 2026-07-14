import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/auth/AuthProvider";
import { ProtectedRoute } from "../src/auth/ProtectedRoute";
import { ImportReview } from "../src/imports/ImportReview";
import { LoginPage } from "../src/pages/LoginPage";
import { EmptyState } from "../src/ui/EmptyState";

function wrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe("interfaz web", () => {
  it("muestra login con labels, contraseña visible bajo control y error de validación", async () => {
    const user = userEvent.setup();
    render(wrapper(<AuthProvider><Routes><Route path="*" element={<LoginPage />} /></Routes></AuthProvider>));
    expect(await screen.findByRole("heading", { name: "Bienvenido de nuevo" })).toBeInTheDocument();
    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Entrar en FactuPapa" }));
    expect(await screen.findByText("Introduce un email válido")).toBeInTheDocument();
  });

  it("redirige una ruta protegida cuando no existe sesión", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/privada"]}><AuthProvider><Routes><Route element={<ProtectedRoute />}><Route path="/privada" element={<h1>Privada</h1>} /></Route><Route path="/login" element={<h1>Acceso</h1>} /></Routes></AuthProvider></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Acceso" })).toBeInTheDocument();
    expect(screen.queryByText("Privada")).not.toBeInTheDocument();
  });

  it("representa estados vacíos accesibles", () => {
    render(<EmptyState title="Sin productos" description="Crea el primero." />);
    expect(screen.getByRole("heading", { name: "Sin productos" })).toBeInTheDocument();
    expect(screen.getByText("Crea el primero.")).toBeInTheDocument();
  });

  it("exige estrategia explícita y bloquea doble confirmación", async () => {
    const confirm = vi.fn();
    const user = userEvent.setup();
    render(<ImportReview preview={{ id: "batch", entityType: "contacts", sourceFormat: "csv", status: "validated", totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, validationSummary: {}, createdAt: "2026-07-15", validatedAt: "2026-07-15", completedAt: null, failedAt: null, rows: [], reused: false }} strategy="" setStrategy={vi.fn()} confirm={confirm} cancel={vi.fn()} busy={false} error={false} />);
    expect(screen.getByRole("button", { name: "Confirmar importación" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Confirmar importación" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("desactiva acciones mientras una importación está en curso", () => {
    render(<ImportReview preview={{ id: "batch", entityType: "products", sourceFormat: "json", status: "validated", totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, validationSummary: {}, createdAt: "2026-07-15", validatedAt: "2026-07-15", completedAt: null, failedAt: null, rows: [], reused: false }} strategy="skip_existing" setStrategy={vi.fn()} confirm={vi.fn()} cancel={vi.fn()} busy={true} error={false} />);
    expect(screen.getByRole("button", { name: "Confirmar importación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar lote" })).toBeDisabled();
  });
});
