import { useQuery } from "@tanstack/react-query";
import { contactsApi } from "../api/services";
import { ledgerApi, type Side } from "../api/workspace";

/** Clientes activos para elegir en pedidos, tareas y notas. */
export function useCustomers() {
  return useQuery({
    queryKey: ["workspace-customers"],
    queryFn: () => contactsApi.list({ type: "customer", isActive: true, pageSize: 100 }),
    staleTime: 60_000,
  });
}

/** Nombres de los dos núcleos (los pone el usuario maestro). */
export function useSideNames(): Record<Side, string> | undefined {
  return useQuery({
    queryKey: ["ledger-summary", "names"],
    queryFn: () => ledgerApi.summary(),
    staleTime: 60_000,
    select: (summary) => summary.sideNames,
  }).data;
}
