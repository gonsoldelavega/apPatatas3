import { apiClient } from "./client";

export type DriveKind = "compra" | "venta" | "gasto" | "revisar" | "otro";
export type DriveStatus = "registrada" | "sin_registrar" | "duplicado" | "revisar" | "no_aplica";

export interface DriveFile {
  driveId: string;
  name: string;
  mimeType: string;
  path: string;
  modifiedAt: string | null;
  sizeBytes: number | null;
  webViewLink: string | null;
  kind: DriveKind;
  status: DriveStatus;
  date: string | null;
  total: string | null;
  description: string | null;
}

export interface DriveLibraryStatus {
  needsPermission: boolean;
  lastSyncAt: string | null;
  lastStatus: "running" | "ok" | "error" | null;
  lastFileCount: number;
  lastError: string | null;
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const driveApi = {
  status: () => apiClient.request<DriveLibraryStatus>("/drive/status"),
  sync: () => apiClient.request<{ started: boolean }>("/drive/sync", { method: "POST", body: "{}" }),
  files: (params: { kind?: DriveKind; status?: DriveStatus; month?: string; q?: string }) =>
    apiClient.request<{ items: DriveFile[]; total: number }>(`/drive/files${query(params)}`),
};
