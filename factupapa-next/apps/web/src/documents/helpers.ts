import type { DriveFile, DriveStatus } from "../api/drive";

export const STATUS_LABEL: Record<DriveStatus, string> = {
  registrada: "Registrada",
  sin_registrar: "Sin registrar",
  duplicado: "Duplicado",
  revisar: "Revisar",
  no_aplica: "",
};

/** Enlace al formulario de compra con lo que se sabe del archivo (fecha, concepto y enlace a Drive). */
export function createPurchaseLink(file: Pick<DriveFile, "date" | "total" | "description" | "name" | "webViewLink">): string {
  const params = new URLSearchParams();
  if (file.date) params.set("fecha", file.date);
  if (file.description) params.set("concepto", file.description);
  const note = [
    `Archivo de Drive: ${file.name}`,
    file.total ? `Total según el nombre del archivo: ${file.total.replace(".", ",")} €` : null,
    file.webViewLink,
  ]
    .filter(Boolean)
    .join(" · ");
  params.set("nota", note);
  return `/gastos/nuevo?${params.toString()}`;
}

/** Meses (AAAA-MM) que aparecen en los nombres de archivo, del más reciente al más antiguo. */
export function monthsOf(files: Array<Pick<DriveFile, "date">>): string[] {
  return [...new Set(files.map((file) => file.date?.slice(0, 7)).filter((month): month is string => Boolean(month)))].sort().reverse();
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
