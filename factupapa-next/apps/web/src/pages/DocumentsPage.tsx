import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, FolderOpen, Image as ImageIcon, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { driveApi, type DriveFile, type DriveKind, type DriveStatus } from "../api/drive";
import { gmailApi } from "../api/services";
import { createPurchaseLink, formatSize, monthsOf, STATUS_LABEL } from "../documents/helpers";
import { Button } from "../ui/Button";
import { SelectField } from "../ui/SelectField";
import { formatMoney } from "../utils/format";

const KIND_OPTIONS: Array<{ value: DriveKind | ""; label: string }> = [
  { value: "", label: "Todo" },
  { value: "compra", label: "Compras" },
  { value: "venta", label: "Ventas" },
  { value: "gasto", label: "Gastos" },
  { value: "revisar", label: "Por revisar" },
];

function FileRow({ file }: { file: DriveFile }) {
  const isImage = file.mimeType.startsWith("image/");
  return (
    <li className={`doc-row doc-row--${file.status}`}>
      <span className="doc-row__icon">{isImage ? <ImageIcon aria-hidden="true" /> : <FileText aria-hidden="true" />}</span>
      <span className="doc-row__main">
        <strong>{file.description ?? file.name}</strong>
        <small>
          {[file.date, file.total ? formatMoney(file.total) : null, file.path || null, formatSize(file.sizeBytes)].filter(Boolean).join(" · ")}
        </small>
        {file.description && <small className="doc-row__name">{file.name}</small>}
      </span>
      <span className="doc-row__side">
        {file.status !== "no_aplica" && <span className={`doc-badge doc-badge--${file.status}`}>{STATUS_LABEL[file.status]}</span>}
        <span className="doc-row__actions">
          {file.webViewLink && (
            <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${file.name} en Drive`}>
              <ExternalLink aria-hidden="true" /> Abrir
            </a>
          )}
          {file.kind === "compra" && file.status === "sin_registrar" && (
            <Link to={createPurchaseLink(file)} className="doc-row__create">
              Crear compra
            </Link>
          )}
        </span>
      </span>
    </li>
  );
}

/** Todo lo que hay en la carpeta de gestión de Drive, con su estado de registro. */
export function DocumentsPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DriveKind | "">("");
  const [status, setStatus] = useState<DriveStatus | "">("");
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");

  const state = useQuery({
    queryKey: ["drive-status"],
    queryFn: driveApi.status,
    // Mientras se está leyendo Drive, se vuelve a preguntar cada pocos segundos.
    refetchInterval: (query) => (query.state.data?.lastStatus === "running" ? 3000 : false),
  });
  const files = useQuery({
    queryKey: ["drive-files", kind, status, month, search.trim()],
    queryFn: () =>
      driveApi.files({
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        ...(month ? { month } : {}),
        ...(search.trim() ? { q: search.trim() } : {}),
      }),
    enabled: state.data?.needsPermission === false,
  });
  const allMonths = useQuery({
    queryKey: ["drive-files", "months"],
    queryFn: () => driveApi.files({ kind: "compra" }),
    enabled: state.data?.needsPermission === false,
  });

  const sync = useMutation({
    mutationFn: driveApi.sync,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["drive-status"] }),
  });
  const grant = useMutation({
    mutationFn: gmailApi.connect,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const running = state.data?.lastStatus === "running";
  useEffect(() => {
    if (state.data?.lastStatus === "ok") void queryClient.invalidateQueries({ queryKey: ["drive-files"] });
  }, [state.data?.lastStatus, state.data?.lastSyncAt, queryClient]);

  const items = files.data?.items ?? [];
  const pending = (allMonths.data?.items ?? []).filter((file) => file.status === "sin_registrar").length;

  return (
    <div className="page documents-page">
      <header className="page-heading">
        <div>
          <Link to="/mas" className="back-link">
            <ArrowLeft aria-hidden="true" /> Otros
          </Link>
          <h1>
            <FolderOpen aria-hidden="true" /> Documentos
          </h1>
          <p className="form-hint">Todo lo que hay en tu carpeta de gestión de Drive, y qué falta por registrar.</p>
        </div>
      </header>

      {state.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : state.data?.needsPermission ? (
        <section className="detail-card">
          <h2>Falta un permiso</h2>
          <p className="form-hint">
            Para enseñarte lo que hay en Drive, la app necesita permiso de <strong>solo lectura</strong> sobre tu Drive. No puede
            borrar ni cambiar nada. Se da una sola vez.
          </p>
          <Button busy={grant.isPending} onClick={() => grant.mutate()}>
            Dar permiso de lectura de Drive
          </Button>
          {grant.isError && (
            <p className="action-feedback action-feedback--error" role="alert">
              No se pudo abrir Google. Inténtalo de nuevo.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="documents-toolbar">
            <p className="form-hint">
              {running
                ? "Leyendo Drive…"
                : state.data?.lastStatus === "error"
                  ? "La última lectura de Drive falló. Reinténtalo; si sigue igual, vuelve a dar permiso."
                  : state.data?.lastSyncAt
                    ? `${state.data.lastFileCount} archivos · actualizado ${new Date(state.data.lastSyncAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : "Todavía no se ha leído Drive."}
              {pending > 0 && ` · ${pending} compras sin registrar`}
            </p>
            <Button variant="secondary" icon={<RefreshCw className={running ? "spin" : ""} />} busy={sync.isPending || running} onClick={() => sync.mutate()}>
              Actualizar
            </Button>
          </section>

          <div className="segmented" role="tablist" aria-label="Tipo de documento">
            {KIND_OPTIONS.map((option) => (
              <button key={option.value} type="button" role="tab" aria-selected={kind === option.value} className={kind === option.value ? "active" : ""} onClick={() => setKind(option.value)}>
                {option.label}
              </button>
            ))}
          </div>

          <section className="detail-card documents-filters">
            <label className="search-box">
              <Search aria-hidden="true" />
              <span className="sr-only">Buscar documento</span>
              <input type="search" placeholder="Buscar por proveedor, número…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="documents-filters__row">
              <SelectField label="Estado" value={status} onChange={(event) => setStatus(event.target.value as DriveStatus | "")}>
                <option value="">Todos</option>
                <option value="sin_registrar">Sin registrar</option>
                <option value="registrada">Registradas</option>
                <option value="duplicado">Duplicados</option>
                <option value="revisar">Por revisar</option>
              </SelectField>
              <SelectField label="Mes" value={month} onChange={(event) => setMonth(event.target.value)}>
                <option value="">Todos</option>
                {monthsOf(allMonths.data?.items ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectField>
            </div>
          </section>

          {files.isLoading ? (
            <p className="form-hint">Cargando…</p>
          ) : files.isError ? (
            <div className="inline-error" role="alert">
              No se pudo cargar la lista.
              <button type="button" onClick={() => void files.refetch()}>
                Reintentar
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="workspace-empty">No hay documentos con ese filtro.</p>
          ) : (
            <>
              <p className="form-hint">
                {files.data!.total} documentos{files.data!.total > items.length ? ` (se muestran ${items.length})` : ""}
              </p>
              <ul className="doc-list">
                {items.map((file) => (
                  <FileRow key={file.driveId} file={file} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
