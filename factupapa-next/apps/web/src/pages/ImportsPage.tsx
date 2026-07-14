import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileUp, RotateCcw, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { importsApi } from "../api/services";
import type { ImportEntityType, ImportPreview, ImportSourceFormat, ImportStrategy } from "../api/types";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { SelectField } from "../ui/SelectField";
import { useToast } from "../ui/ToastProvider";
import { formatDate } from "../utils/format";
import { ImportReview } from "../imports/ImportReview";

const labels: Record<ImportEntityType, string> = { contacts: "Contactos", products: "Productos", contact_product_prices: "Precios por cliente" };
const statusLabels = { pending: "Pendiente", validated: "Validada", importing: "Procesando", completed: "Completada", failed: "Fallida", cancelled: "Cancelada" };

export function ImportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entityType, setEntityType] = useState<ImportEntityType>("contacts");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy | "">("");
  const [fileError, setFileError] = useState<string | null>(null);
  const history = useQuery({ queryKey: ["imports"], queryFn: () => importsApi.list(1, 25) });
  const validate = useMutation({ mutationFn: () => importsApi.validate({ entityType, sourceFormat: file!.name.toLowerCase().endsWith(".json") ? "json" : "csv", content }), onSuccess: async (result) => { setPreview(result); await queryClient.invalidateQueries({ queryKey: ["imports"] }); }, onError: () => setFileError("No se ha podido validar. Revisa el formato, el tamaño y los datos del archivo.") });
  const confirm = useMutation({ mutationFn: () => importsApi.confirm(preview!.id, strategy as ImportStrategy), onSuccess: async () => { toast.show("Importación completada"); setPreview(null); setFile(null); setContent(""); setStrategy(""); await queryClient.invalidateQueries({ queryKey: ["imports"] }); } });
  const cancel = useMutation({ mutationFn: () => importsApi.cancel(preview!.id), onSuccess: async () => { toast.show("Importación cancelada"); setPreview(null); setStrategy(""); await queryClient.invalidateQueries({ queryKey: ["imports"] }); } });

  const chooseFile = async (selected?: File) => {
    setFileError(null); setPreview(null); setStrategy("");
    if (!selected) return;
    const extension = selected.name.toLowerCase().split(".").pop() as ImportSourceFormat | undefined;
    if (extension !== "csv" && extension !== "json") { setFileError("Selecciona un archivo CSV o JSON."); return; }
    if (selected.size > 1_048_576) { setFileError("El archivo supera el límite actual de 1 MB."); return; }
    try { const text = await selected.text(); setFile(selected); setContent(text); } catch { setFileError("No se ha podido leer el archivo local."); }
  };
  const approximateRows = content ? (file?.name.endsWith(".json") ? (() => { try { const parsed = JSON.parse(content) as unknown; return Array.isArray(parsed) ? parsed.length : 1; } catch { return 0; } })() : Math.max(0, content.split(/\r?\n/).filter(Boolean).length - 1)) : 0;

  return (
    <div className="page imports-page"><header className="page-heading"><p className="eyebrow">Entrada controlada</p><h1>Importar datos</h1><p>Primero validamos. Tú decides qué entra y cuándo.</p></header>
      {!preview ? <section className="upload-card" aria-labelledby="upload-title"><h2 id="upload-title">Nueva importación</h2><SelectField label="Qué quieres importar" value={entityType} onChange={(event) => setEntityType(event.target.value as ImportEntityType)}><option value="contacts">Contactos</option><option value="products">Productos</option><option value="contact_product_prices">Precios por cliente</option></SelectField><button className="drop-zone" type="button" onClick={() => fileRef.current?.click()}><FileUp /><strong>{file ? file.name : "Seleccionar CSV o JSON"}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · unas ${approximateRows} filas` : "Máximo 1 MB. El archivo solo se lee localmente hasta validar."}</span></button><input ref={fileRef} className="sr-only" type="file" aria-label="Seleccionar archivo CSV o JSON" accept=".csv,.json,text/csv,application/json" onChange={(event) => void chooseFile(event.target.files?.[0])} />{fileError && <div className="form-alert" role="alert">{fileError}</div>}<Button busy={validate.isPending} disabled={!file || !content} onClick={() => validate.mutate()}>Validar archivo</Button><p className="security-note">No se ejecutan fórmulas ni se confirma nada automáticamente.</p></section> : <ImportReview preview={preview} strategy={strategy} setStrategy={setStrategy} confirm={() => confirm.mutate()} cancel={() => cancel.mutate()} busy={confirm.isPending || cancel.isPending} error={confirm.isError} />}
      <section aria-labelledby="history-title"><div className="section-heading"><div><p className="eyebrow">Trazabilidad</p><h2 id="history-title">Historial de lotes</h2></div><button className="icon-button" onClick={() => void history.refetch()} aria-label="Actualizar historial"><RotateCcw /></button></div>{history.data?.items.length === 0 && <EmptyState title="Aún no hay importaciones" description="Los lotes validados aparecerán aquí." />}<div className="history-list">{history.data?.items.map((batch) => <article key={batch.id}><span className={`history-icon history-icon--${batch.status}`}>{batch.status === "completed" ? <CheckCircle2 /> : batch.status === "failed" || batch.status === "cancelled" ? <XCircle /> : <Clock3 />}</span><span><strong>{labels[batch.entityType]}</strong><small>{formatDate(batch.createdAt)} · {batch.totalRows} filas</small></span><span className={`status status--${batch.status}`}>{statusLabels[batch.status]}</span></article>)}</div></section>
    </div>
  );
}
