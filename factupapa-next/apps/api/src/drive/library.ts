import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";

export const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
/** Carpeta «01_Gonsol de la Vega - Gestión»: de ahí cuelgan 01_VENTAS, 02_COMPRAS, 03_GASTOS y 99_PENDIENTE_DE_CLASIFICAR. */
export const DEFAULT_DRIVE_ROOT_ID = "1Cf1MxBpJ1UsE4wNh_93-eplycyg69u7T";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_FILES = 8000;
const MAX_FOLDERS = 1500;

export type DriveKind = "compra" | "venta" | "gasto" | "revisar" | "otro";
export type DriveStatus = "registrada" | "sin_registrar" | "duplicado" | "revisar" | "no_aplica";

/** Tipo de documento según la carpeta donde está. */
export function classifyDrivePath(path: string): DriveKind {
  const upper = path.toUpperCase();
  if (upper.includes("DUPLICADOS") || upper.includes("REVISAR_MANUALMENTE") || upper.includes("99_PENDIENTE")) return "revisar";
  if (upper.includes("02_COMPRAS") || upper.includes("FACTURAS_RECIBIDAS")) return "compra";
  if (upper.includes("01_VENTAS") || upper.includes("FACTURAS_EMITIDAS")) return "venta";
  if (upper.includes("03_GASTOS")) return "gasto";
  return "otro";
}

export interface FilenameInfo {
  /** AAAA-MM-DD */
  date: string | null;
  /** Importe total que el organizador pone al final del nombre. */
  total: string | null;
  /** Lo que queda entre «FACTURA_COMPRA» y el importe (proveedor y número, tal como vienen). */
  description: string | null;
}

/** `2026-10-28_FACTURA_COMPRA_GAYCA_006_0002.619_93,60.pdf` → fecha, total y descripción. */
export function parseDriveFilename(name: string): FilenameInfo {
  const date = name.match(/^(\d{4}-\d{2}-\d{2})_/)?.[1] ?? null;
  const parsed = name.match(/^\d{4}-\d{2}-\d{2}_FACTURA_[A-Z]+_(.+)_(\d{1,3}(?:\.\d{3})*,\d{2})\.[A-Za-z0-9]+$/);
  return {
    date,
    total: parsed ? parsed[2]!.replace(/\./g, "").replace(",", ".") : null,
    description: parsed ? parsed[1]!.replace(/_/g, " ").trim() : null,
  };
}

export interface KnownPurchase {
  issueDate: string;
  total: string;
  sourceRegistryUrl: string | null;
}

/** ¿Está ya registrada esta factura de compra? Por enlace al archivo o por fecha + importe. */
export function purchaseStatus(file: { driveId: string; webViewLink: string | null; name: string }, purchases: KnownPurchase[]): DriveStatus {
  if (purchases.some((purchase) => purchase.sourceRegistryUrl && purchase.sourceRegistryUrl.includes(file.driveId))) return "registrada";
  const info = parseDriveFilename(file.name);
  if (!info.date || !info.total) return "sin_registrar";
  const total = Number(info.total);
  return purchases.some((purchase) => purchase.issueDate === info.date && Math.abs(Number(purchase.total) - total) < 0.005) ? "registrada" : "sin_registrar";
}

export function driveFileStatus(
  file: { driveId: string; webViewLink: string | null; name: string; path: string; mimeType: string },
  purchases: KnownPurchase[],
): { kind: DriveKind; status: DriveStatus } {
  const kind = classifyDrivePath(file.path);
  if (file.path.toUpperCase().includes("DUPLICADOS")) return { kind, status: "duplicado" };
  if (kind === "revisar") return { kind, status: "revisar" };
  if (kind === "compra") return { kind, status: purchaseStatus(file, purchases) };
  return { kind, status: "no_aplica" };
}

interface DriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export interface DriveLibraryDeps {
  access(identity: SessionIdentity): Promise<{ token: string; scopes: string[] }>;
  fetchImpl?: typeof fetch;
  rootFolderId?: string;
}

export interface DriveFileRow {
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

/** Lista de archivos de la carpeta de gestión de Drive y su estado de registro. */
export class DriveLibraryService {
  private readonly running = new Set<string>();
  private readonly fetchImpl: typeof fetch;
  private readonly rootFolderId: string;

  constructor(private readonly pool: Pool, private readonly deps: DriveLibraryDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.rootFolderId = deps.rootFolderId ?? DEFAULT_DRIVE_ROOT_ID;
  }

  private async call<T>(token: string, url: URL): Promise<T> {
    const response = await this.fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`drive_${response.status}`);
    return (await response.json()) as T;
  }

  async status(identity: SessionIdentity): Promise<DriveLibraryStatus> {
    let needsPermission = false;
    try {
      const access = await this.deps.access(identity);
      needsPermission = !access.scopes.includes(DRIVE_READ_SCOPE);
    } catch {
      needsPermission = true;
    }
    const row = await withTenantTransaction(this.pool, identity, async (client) =>
      (
        await client.query<{ at: string | null; status: DriveLibraryStatus["lastStatus"]; count: number; error: string | null }>(
          `select last_sync_at::text at, last_status status, last_file_count count, last_error error from drive_library_state where company_id = $1`,
          [identity.companyId],
        )
      ).rows[0],
    );
    return {
      needsPermission,
      lastSyncAt: row?.at ?? null,
      lastStatus: row?.status ?? null,
      lastFileCount: row?.count ?? 0,
      lastError: row?.error ?? null,
    };
  }

  /** Arranca la lectura de Drive en segundo plano (puede tardar). Devuelve false si ya había una en marcha. */
  start(identity: SessionIdentity): boolean {
    if (this.running.has(identity.companyId)) return false;
    this.running.add(identity.companyId);
    void this.sync(identity)
      .catch(() => undefined)
      .finally(() => this.running.delete(identity.companyId));
    return true;
  }

  async sync(identity: SessionIdentity): Promise<number> {
    const access = await this.deps.access(identity);
    if (!access.scopes.includes(DRIVE_READ_SCOPE)) throw new HttpError("conflict", 409);
    await this.setState(identity, "running", null, null);
    try {
      const startedAt = new Date();
      const files: Array<DriveApiFile & { path: string }> = [];
      const queue: Array<{ id: string; path: string }> = [{ id: this.rootFolderId, path: "" }];
      let folders = 0;
      while (queue.length > 0) {
        const folder = queue.shift()!;
        if (++folders > MAX_FOLDERS) break;
        let pageToken: string | undefined;
        do {
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("q", `'${folder.id}' in parents and trashed = false`);
          url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)");
          url.searchParams.set("pageSize", "1000");
          url.searchParams.set("supportsAllDrives", "true");
          url.searchParams.set("includeItemsFromAllDrives", "true");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const page = await this.call<{ files?: DriveApiFile[]; nextPageToken?: string }>(access.token, url);
          for (const entry of page.files ?? []) {
            const path = folder.path ? `${folder.path}/${entry.name}` : entry.name;
            if (entry.mimeType === FOLDER_MIME) queue.push({ id: entry.id, path });
            else files.push({ ...entry, path: folder.path });
          }
          pageToken = page.nextPageToken;
        } while (pageToken && files.length < MAX_FILES);
        if (files.length >= MAX_FILES) break;
      }
      await withTenantTransaction(this.pool, identity, async (client) => {
        for (let offset = 0; offset < files.length; offset += 500) {
          const chunk = files.slice(offset, offset + 500);
          await client.query(
            `insert into drive_files (company_id, drive_id, name, mime_type, path, modified_at, size_bytes, web_view_link, seen_at)
             select $1, t.drive_id, t.name, t.mime_type, t.path, t.modified_at, t.size_bytes, t.web_view_link, now()
             from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::bigint[], $8::text[])
               as t(drive_id, name, mime_type, path, modified_at, size_bytes, web_view_link)
             on conflict (company_id, drive_id) do update set name = excluded.name, mime_type = excluded.mime_type,
               path = excluded.path, modified_at = excluded.modified_at, size_bytes = excluded.size_bytes,
               web_view_link = excluded.web_view_link, seen_at = now()`,
            [
              identity.companyId,
              chunk.map((file) => file.id),
              chunk.map((file) => file.name.slice(0, 500)),
              chunk.map((file) => file.mimeType),
              chunk.map((file) => file.path.slice(0, 1000)),
              chunk.map((file) => file.modifiedTime ?? null),
              chunk.map((file) => (file.size ? Number(file.size) : null)),
              chunk.map((file) => file.webViewLink ?? null),
            ],
          );
        }
        // Lo que ya no está en Drive (movido o borrado) deja de aparecer.
        await client.query("delete from drive_files where company_id = $1 and seen_at < $2", [identity.companyId, startedAt]);
      });
      await this.setState(identity, "ok", files.length, null);
      return files.length;
    } catch (error) {
      await this.setState(identity, "error", null, error instanceof Error ? error.message : "error").catch(() => undefined);
      throw error;
    }
  }

  private async setState(identity: SessionIdentity, status: "running" | "ok" | "error", count: number | null, error: string | null): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        `insert into drive_library_state (company_id, last_sync_at, last_status, last_file_count, last_error)
         values ($1, now(), $2, coalesce($3, 0), $4)
         on conflict (company_id) do update set last_sync_at = now(), last_status = excluded.last_status,
           last_file_count = case when $3::int is null then drive_library_state.last_file_count else $3::int end, last_error = excluded.last_error`,
        [identity.companyId, status, count, error?.slice(0, 300) ?? null],
      );
    });
  }

  async list(identity: SessionIdentity, filters: { kind?: DriveKind; status?: DriveStatus; search?: string; month?: string }): Promise<{ items: DriveFileRow[]; total: number }> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const files = (
        await client.query<{ driveId: string; name: string; mimeType: string; path: string; modifiedAt: string | null; sizeBytes: string | null; webViewLink: string | null }>(
          `select drive_id "driveId", name, mime_type "mimeType", path, modified_at::text "modifiedAt", size_bytes::text "sizeBytes", web_view_link "webViewLink"
           from drive_files where company_id = $1 and ($2::text is null or name ilike '%' || $2 || '%') order by name desc limit 5000`,
          [identity.companyId, filters.search ? filters.search.replace(/[\\%_]/g, "\\$&") : null],
        )
      ).rows;
      const purchases = (
        await client.query<KnownPurchase>(
          `select issue_date::text "issueDate", total::text total, source_registry_url "sourceRegistryUrl"
           from purchase_invoices where deleted_at is null and status <> 'cancelled'`,
        )
      ).rows;
      const rows: DriveFileRow[] = [];
      for (const file of files) {
        const { kind, status } = driveFileStatus(file, purchases);
        if (filters.kind && kind !== filters.kind) continue;
        if (filters.status && status !== filters.status) continue;
        const info = parseDriveFilename(file.name);
        if (filters.month && !(info.date ?? file.modifiedAt ?? "").startsWith(filters.month)) continue;
        rows.push({
          driveId: file.driveId,
          name: file.name,
          mimeType: file.mimeType,
          path: file.path,
          modifiedAt: file.modifiedAt,
          sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
          webViewLink: file.webViewLink,
          kind,
          status,
          date: info.date,
          total: info.total,
          description: info.description,
        });
      }
      return { items: rows.slice(0, 500), total: rows.length };
    });
  }
}
