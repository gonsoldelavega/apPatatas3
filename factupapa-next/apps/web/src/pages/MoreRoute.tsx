import { useIsPartner } from "../auth/roles";
import { MorePage } from "./MorePage";
import { PartnerMorePage } from "./PartnerMorePage";

/** «Más»: el maestro ve todas sus opciones; un socio ve solo tareas, notas y salir. */
export function MoreRoute() {
  return useIsPartner() ? <PartnerMorePage /> : <MorePage />;
}
