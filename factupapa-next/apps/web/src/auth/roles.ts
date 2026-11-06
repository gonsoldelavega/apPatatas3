import { useOptionalAuth } from "./AuthProvider";

/** Roles de la empresa. `owner` es el usuario maestro; `partner` es un socio con acceso limitado. */
export type MembershipRole = "owner" | "admin" | "member" | "viewer" | "partner";

/**
 * Primer día de datos visible para un socio. Solo es ayuda de interfaz (límites de los
 * selectores de mes): quien aplica el corte de verdad es la API.
 */
export const PARTNER_HISTORY_FROM = "2026-11-01";

export function useRole(): string | null {
  return useOptionalAuth()?.user?.membership?.role ?? null;
}

export function useIsPartner(): boolean {
  return useRole() === "partner";
}

export function useIsOwner(): boolean {
  return useRole() === "owner";
}
