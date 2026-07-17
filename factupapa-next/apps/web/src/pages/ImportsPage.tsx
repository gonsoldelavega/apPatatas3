import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileUp, RotateCcw, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { importsApi } from "../api/services";
import type {
  ImportColumnDetection,
  ImportEntityType,
  ImportPreview,
  ImportSourceFormat,
  ImportStrategy,
} from "../api/types";
import { ImportReview } from "../imports/ImportReview";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { SelectField } from "../ui/SelectField";
import { useToast } from "../ui/ToastProvider";
import { formatDate } from "../utils/format";

const labels: Record<ImportEntityType, string> = {
  contacts: "Contactos",
  products: "Productos",
  contact_product_prices: "Precios por cliente",
};
const statusLabels = {
  pending: "Pendiente",
  validated: "Validada",
  importing: "Procesando",
  completed: "Completada",
  failed: "Fallida",
  cancelled: "Cancelada",
};
const steps = ["Archivo", "Columnas", "Errores", "Estrategia", "Confirmar"];

export function ImportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entityType, setEntityType] = useState<ImportEntityType>("contacts");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [detection, setDetection] = useState<ImportColumnDetection | null>(
    null,
  );
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingId, setMappingId] = useState("");
  const [mappingDirty, setMappingDirty] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy | "">("");
  const [fileError, setFileError] = useState<string | null>(null);
  const sourceFormat: ImportSourceFormat = file?.name
    .toLowerCase()
    .endsWith(".json")
    ? "json"
    : "csv";
  const history = useQuery({
    queryKey: ["imports"],
    queryFn: () => importsApi.list(1, 25),
  });
  const templates = useQuery({
    queryKey: ["import-mappings", entityType],
    queryFn: () => importsApi.mappings(entityType),
  });
  const detect = useMutation({
    mutationFn: () =>
      importsApi.detectColumns({ entityType, sourceFormat, content }),
    onSuccess: (result) => {
      setDetection(result);
      setMapping(result.proposedMapping);
      setMappingId("");
      setMappingDirty(false);
    },
    onError: () =>
      setFileError(
        "No se han podido detectar las columnas. Revisa que el archivo sea válido.",
      ),
  });
  const validate = useMutation({
    mutationFn: async () => {
      let selectedId = !mappingDirty ? mappingId || undefined : undefined;
      if (saveTemplate) {
        if (!templateName.trim()) throw new Error("template_name_required");
        selectedId = (
          await importsApi.saveMapping({
            name: templateName.trim(),
            entityType,
            sourceFormat,
            mapping,
          })
        ).id;
      }
      return importsApi.validate({
        entityType,
        sourceFormat,
        content,
        ...(selectedId ? { mappingId: selectedId } : { mapping }),
      });
    },
    onSuccess: async (result) => {
      setPreview(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["imports"] }),
        queryClient.invalidateQueries({
          queryKey: ["import-mappings", entityType],
        }),
      ]);
    },
    onError: (error) =>
      setFileError(
        error instanceof Error && error.message === "template_name_required"
          ? "Pon un nombre a la plantilla."
          : "No se ha podido validar. Revisa el mapeo y los datos del archivo.",
      ),
  });
  const confirm = useMutation({
    mutationFn: () =>
      importsApi.confirm(preview!.id, strategy as ImportStrategy),
    onSuccess: async () => {
      toast.show("Importación completada");
      reset();
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => importsApi.cancel(preview!.id),
    onSuccess: async () => {
      toast.show("Importación cancelada");
      reset();
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
  });

  function reset() {
    setPreview(null);
    setFile(null);
    setContent("");
    setDetection(null);
    setMapping({});
    setMappingId("");
    setMappingDirty(false);
    setStrategy("");
    setSaveTemplate(false);
    setTemplateName("");
  }
  async function chooseFile(selected?: File) {
    setFileError(null);
    reset();
    if (!selected) return;
    const extension = selected.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "json") {
      setFileError("Selecciona un archivo CSV o JSON.");
      return;
    }
    if (selected.size > 1_048_576) {
      setFileError("El archivo supera el límite actual de 1 MB.");
      return;
    }
    try {
      setFile(selected);
      setContent(await selected.text());
    } catch {
      setFileError("No se ha podido leer el archivo local.");
    }
  }
  function chooseTemplate(id: string) {
    setMappingId(id);
    const selected = templates.data?.items.find((item) => item.id === id);
    setMapping(selected?.mapping ?? detection?.proposedMapping ?? {});
    setMappingDirty(false);
  }
  const duplicates = new Set(
    Object.values(mapping).filter(
      (source, index, all) => source && all.indexOf(source) !== index,
    ),
  );
  const unmappedColumns =
    detection?.columns.filter(
      (column) => !Object.values(mapping).includes(column),
    ) ?? [];
  const mappingValid = Boolean(
    detection &&
    detection.duplicateColumns.length === 0 &&
    detection.requiredFields.every((field) => mapping[field]) &&
    duplicates.size === 0,
  );
  const currentStep = preview ? (strategy ? 5 : 3) : detection ? 2 : 1;

  return (
    <div className="page imports-page">
      <header className="page-heading">
        <p className="eyebrow">Entrada controlada</p>
        <h1>Importar datos</h1>
        <p>Asigna cada columna, revisa y confirma sin perder precisión.</p>
      </header>
      <ol className="import-steps" aria-label="Progreso de importación">
        {steps.map((step, index) => (
          <li
            key={step}
            className={index + 1 <= currentStep ? "is-active" : ""}
          >
            <span>{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      {!preview && !detection && (
        <section className="upload-card" aria-labelledby="upload-title">
          <p className="eyebrow">Paso 1</p>
          <h2 id="upload-title">Selecciona el archivo</h2>
          <SelectField
            label="Qué quieres importar"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value as ImportEntityType);
              reset();
            }}
          >
            <option value="contacts">Contactos</option>
            <option value="products">Productos</option>
            <option value="contact_product_prices">Precios por cliente</option>
          </SelectField>
          <button
            className="drop-zone"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp />
            <strong>{file ? file.name : "Seleccionar CSV o JSON"}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : "Máximo 1 MB. No almacenamos el archivo original."}
            </span>
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            aria-label="Seleccionar archivo CSV o JSON"
            accept=".csv,.json,text/csv,application/json"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          {fileError && (
            <div className="form-alert" role="alert">
              {fileError}
            </div>
          )}
          <Button
            busy={detect.isPending}
            disabled={!file || !content}
            onClick={() => detect.mutate()}
          >
            Detectar columnas
          </Button>
          <p className="security-note">
            No se ejecutan fórmulas ni contenido del archivo.
          </p>
        </section>
      )}
      {!preview && detection && (
        <section className="upload-card mapping-card">
          <p className="eyebrow">Paso 2</p>
          <h2>Asigna las columnas</h2>
          <p>
            Los campos con * son obligatorios. Una columna de origen solo puede
            utilizarse una vez.
          </p>
          {detection.duplicateColumns.length > 0 && (
            <div className="form-alert" role="alert">
              Hay cabeceras duplicadas: {detection.duplicateColumns.join(", ")}.
            </div>
          )}
          <SelectField
            label="Usar una plantilla guardada"
            value={mappingId}
            onChange={(event) => chooseTemplate(event.target.value)}
          >
            <option value="">Sin plantilla</option>
            {templates.data?.items
              .filter((item) => item.sourceFormat === sourceFormat)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </SelectField>
          <div className="mapping-grid">
            {detection.fields.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                <select
                  aria-label={`Columna para ${field.label}`}
                  value={mapping[field.key] ?? ""}
                  className={
                    mapping[field.key] && duplicates.has(mapping[field.key]!)
                      ? "field-invalid"
                      : ""
                  }
                  onChange={(event) => {
                    const source = event.target.value;
                    setMapping((current) =>
                      source
                        ? { ...current, [field.key]: source }
                        : Object.fromEntries(
                            Object.entries(current).filter(
                              ([key]) => key !== field.key,
                            ),
                          ),
                    );
                    setMappingDirty(true);
                    setMappingId("");
                  }}
                >
                  <option value="">No importar</option>
                  {detection.columns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
                {mapping[field.key] && duplicates.has(mapping[field.key]!) && (
                  <small role="alert">Esta columna ya está asignada.</small>
                )}
              </label>
            ))}
          </div>
          {unmappedColumns.length > 0 && (
            <p className="hint">Sin asignar: {unmappedColumns.join(", ")}</p>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={saveTemplate}
              onChange={(event) => setSaveTemplate(event.target.checked)}
            />
            Guardar como plantilla para esta empresa
          </label>
          {saveTemplate && (
            <label className="field">
              <span>Nombre de la plantilla</span>
              <input
                value={templateName}
                maxLength={80}
                onChange={(event) => setTemplateName(event.target.value)}
              />
            </label>
          )}
          {fileError && (
            <div className="form-alert" role="alert">
              {fileError}
            </div>
          )}
          <div className="review-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setDetection(null);
                setMapping({});
              }}
            >
              Atrás
            </Button>
            <Button
              busy={validate.isPending}
              disabled={!mappingValid || (saveTemplate && !templateName.trim())}
              onClick={() => validate.mutate()}
            >
              Validar y previsualizar
            </Button>
          </div>
        </section>
      )}
      {preview && (
        <ImportReview
          preview={preview}
          strategy={strategy}
          setStrategy={setStrategy}
          confirm={() => confirm.mutate()}
          cancel={() => cancel.mutate()}
          busy={confirm.isPending || cancel.isPending}
          error={confirm.isError}
        />
      )}
      <section aria-labelledby="history-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Trazabilidad</p>
            <h2 id="history-title">Historial de lotes</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => void history.refetch()}
            aria-label="Actualizar historial"
          >
            <RotateCcw />
          </button>
        </div>
        {history.data?.items.length === 0 && (
          <EmptyState
            title="Aún no hay importaciones"
            description="Los lotes validados aparecerán aquí."
          />
        )}
        <div className="history-list">
          {history.data?.items.map((batch) => (
            <article key={batch.id}>
              <span className={`history-icon history-icon--${batch.status}`}>
                {batch.status === "completed" ? (
                  <CheckCircle2 />
                ) : batch.status === "failed" ||
                  batch.status === "cancelled" ? (
                  <XCircle />
                ) : (
                  <Clock3 />
                )}
              </span>
              <span>
                <strong>{labels[batch.entityType]}</strong>
                <small>
                  {formatDate(batch.createdAt)} · {batch.totalRows} filas
                </small>
              </span>
              <span className={`status status--${batch.status}`}>
                {statusLabels[batch.status]}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
