import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../src/auth/AuthProvider";
import { OwnerOnly } from "../src/auth/OwnerOnly";
import { PARTNER_HISTORY_FROM } from "../src/auth/roles";
import { AppShell } from "../src/layout/AppShell";
import type { CurrentUser } from "../src/api/types";

function withRole(role: string, children: React.ReactNode, logout = vi.fn()) {
  const user = {
    id: "u1",
    email: "x@example.test",
    displayName: "X",
    company: { id: "c1", name: "Empresa" },
    membership: { role },
  } as CurrentUser;
  return (
    <AuthContext.Provider
      value={{ status: "authenticated", user, restore: vi.fn(), login: vi.fn(), logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const shellRoutes = (
  <Routes>
    <Route element={<AppShell />}>
      <Route index element={<h1>Resumen</h1>} />
      <Route path="ventas" element={<h1>Facturas</h1>} />
      <Route element={<OwnerOnly />}>
        <Route path="gastos" element={<h1>Gastos del maestro</h1>} />
        <Route path="socios" element={<h1>Socios del maestro</h1>} />
      </Route>
    </Route>
  </Routes>
);

describe("acceso por rol en la interfaz", () => {
  it("el maestro ve las 5 secciones de la navegación", () => {
    render(withRole("owner", <MemoryRouter initialEntries={["/"]}>{shellRoutes}</MemoryRouter>));
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(nav).not.toHaveClass("bottom-nav--partner");
    for (const name of ["Inicio", "Facturas", "Gastos", "Productos", "Otros"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Salir" })).not.toBeInTheDocument();
  });

  it("el socio solo ve Inicio, Facturas y Salir (nada de Gastos, Productos ni Otros)", async () => {
    const logout = vi.fn();
    render(withRole("partner", <MemoryRouter initialEntries={["/"]}>{shellRoutes}</MemoryRouter>, logout));
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(nav).toHaveClass("bottom-nav--partner");
    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Facturas" })).toBeInTheDocument();
    for (const name of ["Gastos", "Productos", "Otros"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    screen.getByRole("button", { name: "Salir" }).click();
    expect(logout).toHaveBeenCalledOnce();
  });

  it("si un socio abre una ruta del maestro por enlace, vuelve al inicio", () => {
    for (const path of ["/gastos", "/socios"]) {
      const { unmount } = render(
        withRole("partner", <MemoryRouter initialEntries={[path]}>{shellRoutes}</MemoryRouter>),
      );
      expect(screen.getByRole("heading", { name: "Resumen" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /del maestro/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("el maestro sí entra en sus rutas", () => {
    render(withRole("owner", <MemoryRouter initialEntries={["/socios"]}>{shellRoutes}</MemoryRouter>));
    expect(screen.getByRole("heading", { name: "Socios del maestro" })).toBeInTheDocument();
  });

  it("el corte de fechas de la interfaz coincide con el de la API (1 de noviembre de 2026)", () => {
    expect(PARTNER_HISTORY_FROM).toBe("2026-11-01");
  });
});
