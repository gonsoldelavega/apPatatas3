import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, FileCheck2, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProductUnit, PurchaseLineInput } from "../api/types";
import { contactsApi, financeApi, productsApi } from "../api/services";
import { apiClient, ApiError } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";

type DraftPurchaseLine = PurchaseLineInput & { clientId: string };
type ArchivedDocument = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: string;
  status: string;
};

const emptyLine = (): DraftPurchaseLine => ({
  clientId: crypto.randomUUID(),
  productId: null,
  description: "",
  quantity: "",
  unit: "kg",
  unitCost: "",
  taxRate: "4",
});

const decimal = (value: string) => value.replace(",", ".");
const documentAccept = "application/pdf,image/jpeg,image/png,image/heic,image/heif";

const encoded = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });

function mimeFor(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

function lineIsValid(line: DraftPurchaseLine) {
  const quantity = Number(decimal(line.quantity));
  const unitCost = Number(decimal(line.unitCost));
  const taxRate = Number(decimal(line.taxRate));
  return Boolean(
    line.description.trim() &&
      line.quantity.trim() &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      line.unitCost.trim() &&
      Number.isFinite(unitCost) &&
      unitCost >= 0 &&
      line.taxRate.trim() &&
      Number.isFinite(taxRate) &&
      taxRate >= 0 &&
      taxRate <= 100,
  );
}

export function PurchaseFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierTaxId, setNewSupplierTaxId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("mercancia");
  const [notes, setNotes] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<DraftPurchaseLine[]>([emptyLine()]);

  const suppliers = useQuery({
    queryKey: ["purchase-suppliers"],
    queryFn: () => contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
  });
  const products = useQuery({
    queryKey: ["purchase-products"],
    queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
  });

  const patchLine = (index: number, value: Partial<PurchaseLineInput>) =>
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...value } : line,
      ),
    );

  const createSupplier = useMutation({
    mutationFn: () =>
      contactsApi.create({
        type: "supplier",
        legalName: newSupplierName.trim(),
        tradeName: null,
        taxId: newSupplierTaxId.trim().toUpperCase() || null,
        email: null,
        phone: null,
        address: {},
        notes: null,
      }),
    onSuccess: async (supplier) => {
      setSupplierId(supplier.id);
      setShowSupplierCreate(false);
      await queryClient.invalidateQueries({ queryKey: ["purchase-suppliers"] });
    },
  });

  const validLines = lines.every(lineIsValid)
    ? lines.map(({ clientId: _clientId, ...line }) => ({
        ...line,
        quantity: decimal(line.quantity),
        unitCost: decimal(line.unitCost),
        taxRate: decimal(line.taxRate),
      }))
    : [];

  const totals = useMemo(
    () =>
      validLines.reduce(
        (result, line) => {
          const base = Number(line.quantity) * Number(line.unitCost);
          const tax = base * (Number(line.taxRate) / 100);
          return {
            base: result.base + base,
            tax: result.tax + tax,
            total: result.total + base + tax,
          };
        },
        { base: 0, tax: 0, total: 0 },
      ),
    [validLines],
  );

  const validateForm = () => {
    const next: Record<string, string> = {};
    if (!supplierId) next.supplierId = "Selecciona un proveedor.";
    if (!issueDate) next.issueDate = "Indica la fecha de la factura.";
    lines.forEach((line) => {
      if (!line.description.trim()) next[`${line.clientId}.description`] = "Indica el concepto.";
      if (!line.quantity.trim() || !Number.isFinite(Number(decimal(line.quantity))) || Number(decimal(line.quantity)) <= 0)
        next[`${line.clientId}.quantity`] = "Indica una cantidad válida.";
      if (!line.unitCost.trim() || !Number.isFinite(Number(decimal(line.unitCost))) || Number(decimal(line.unitCost)) < 0)
        next[`${line.clientId}.unitCost`] = "Indica un coste válido.";
      if (!line.taxRate.trim() || !Number.isFinite(Number(decimal(line.taxRate))) || Number(decimal(line.taxRate)) < 0 || Number(decimal(line.taxRate)) > 100)
        next[`${line.clientId}.taxRate`] = "Indica un IVA válido.";
    });
    setFieldErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.querySelector<HTMLElement>(`[data-field-key="${first}"]`)?.focus();
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      let linkedDocumentId = documentId;
      if (documentFile && !linkedDocumentId) {
        const archived = await apiClient.request<ArchivedDocument>(
          "/purchase-documents/archive",
          {
            method: "POST",
            body: JSON.stringify({
              filename: documentFile.name,
              mimeType: mimeFor(documentFile),
              contentBase64: await encoded(documentFile),
            }),
            timeoutMs: 30_000,
          },
        );
        linkedDocumentId = archived.id;
        setDocumentId(archived.id);
      }

      const create = () =>
        financeApi.createPurchase({
          supplierId,
          documentId: linkedDocumentId,
          supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
          issueDate,
          dueDate: dueDate || null,
          category,
          notes: notes.trim() || null,
          lines: validLines,
        });
      try {
        return await create();
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "session_renewed_retry_required"
        )
          return create();
        throw error;
      }
    },
    onSuccess: async (purchase) => {
      await queryClient.invalidateQueries({ queryKey: ["purchases"] });
      navigate(`/gastos/${purchase.id}`);
    },
  });

  const saveErrorMessage = (() => {
    const error = save.error;
    if (!(error instanceof ApiError))
      return "No se pudo guardar la compra. Tus datos siguen en pantalla; vuelve a intentarlo.";
    if (error.code === "conflict")
      return "Esta compra parece estar ya registrada. Revisa proveedor y número de factura antes de repetirla.";
    if (error.code === "not_found")
      return "El proveedor seleccionado ya no está disponible. Vuelve a elegirlo.";
    if (error.code === "invalid_request")
      return "Hay un dato con formato incorrecto. Revisa fecha, cantidad, coste, IVA y el adjunto.";
    if (error.code === "request_timeout" || error.code === "network_error")
      return "No se pudo conectar. Tus datos siguen en pantalla; comprueba la conexión y vuelve a guardar.";
    return "No se pudo guardar la compra. Tus datos siguen en pantalla; vuelve a intentarlo.";
  })();

  useEffect(() => {
    if (!documentFile) {
      setDocumentPreview(null);
      return;
    }
    const url = URL.createObjectURL(documentFile);
    setDocumentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [documentFile]);

  const selectDocument = (file?: File) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      setDocumentError("El documento supera el límite de 10 MB.");
      return;
    }
    setDocumentError(null);
    setDocumentId(null);
    setDocumentFile(file);
  };

  const removeDocument = () => {
    setDocumentFile(null);
    setDocumentId(null);
    setDocumentError(null);
  };

  return (
    <div className="page form-page purchase-form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/gastos" aria-label="Volver a gastos">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Compra manual</p>
          <h1>Nueva compra</h1>
        </div>
      </header>

      <section className="form-card purchase-manual-intro">
        <strong>Solo necesitas proveedor, fecha, cantidad y coste.</strong>
        <p>
          Las compras automáticas llegan desde el Registro de Google Sheets. Aquí puedes registrar una compra manual y, si quieres, conservar el PDF o imagen original sin lectura automática.
        </p>
      </section>

      <section className="form-card purchase-main-fields">
        <div className="section-heading">
          <div><p className="eyebrow">Proveedor</p><h2>Datos principales</h2></div>
          <button className="compact-action" type="button" onClick={() => setShowSupplierCreate((current) => !current)}>
            <Building2 /> Nuevo proveedor
          </button>
        </div>
        <SelectField
          label="Proveedor"
          error={fieldErrors.supplierId}
          value={supplierId}
          data-field-key="supplierId"
          onChange={(event) => {
            setSupplierId(event.target.value);
            setFieldErrors((current) => ({ ...current, supplierId: "" }));
          }}
        >
          <option value="">Selecciona un proveedor</option>
          {suppliers.data?.items.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.tradeName || supplier.legalName}</option>
          ))}
        </SelectField>

        {showSupplierCreate && (
          <div className="inline-create-card">
            <strong>Nuevo proveedor</strong>
            <Field label="Nombre legal" value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} />
            <Field label="NIF/CIF (opcional)" value={newSupplierTaxId} onChange={(event) => setNewSupplierTaxId(event.target.value.toUpperCase())} />
            {createSupplier.isError && <p className="field-error" role="alert">No se pudo crear. Comprueba si ya existe.</p>}
            <div className="inline-create-card__actions">
              <button type="button" onClick={() => setShowSupplierCreate(false)}>Cancelar</button>
              <Button type="button" disabled={!newSupplierName.trim()} busy={createSupplier.isPending} onClick={() => createSupplier.mutate()}>
                Crear y seleccionar
              </Button>
            </div>
          </div>
        )}

        <div className="form-grid">
          <Field
            label="Fecha"
            error={fieldErrors.issueDate}
            type="date"
            value={issueDate}
            data-field-key="issueDate"
            onChange={(event) => {
              setIssueDate(event.target.value);
              setFieldErrors((current) => ({ ...current, issueDate: "" }));
            }}
            required
          />
          <Field
            label="Nº factura proveedor (opcional)"
            value={supplierInvoiceNumber}
            onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
          />
        </div>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">Mercancía</p><h2>Conceptos</h2></div>
          <strong>{new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(totals.total)}</strong>
        </div>
        {lines.map((line, index) => (
          <div className="purchase-line-editor purchase-line-editor--compact" key={line.clientId}>
            <SelectField
              label="Producto de stock (opcional)"
              value={line.productId ?? ""}
              onChange={(event) => {
                const product = products.data?.items.find((item) => item.id === event.target.value);
                patchLine(index, {
                  productId: event.target.value || null,
                  description: product?.name ?? line.description,
                  unit: product?.unit ?? line.unit,
                });
              }}
            >
              <option value="">No vincular a stock</option>
              {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </SelectField>
            <Field
              label="Descripción"
              error={fieldErrors[`${line.clientId}.description`]}
              value={line.description}
              data-field-key={`${line.clientId}.description`}
              onChange={(event) => patchLine(index, { description: event.target.value })}
            />
            <div className="purchase-line-numbers">
              <Field
                label="Cantidad"
                error={fieldErrors[`${line.clientId}.quantity`]}
                inputMode="decimal"
                value={line.quantity}
                data-field-key={`${line.clientId}.quantity`}
                onChange={(event) => patchLine(index, { quantity: event.target.value })}
              />
              <SelectField label="Unidad" value={line.unit} onChange={(event) => patchLine(index, { unit: event.target.value as ProductUnit })}>
                <option value="kg">kg</option><option value="g">g</option><option value="unit">unidad</option>
                <option value="box">caja</option><option value="custom">otra</option>
              </SelectField>
              <Field
                label="Coste sin IVA"
                error={fieldErrors[`${line.clientId}.unitCost`]}
                inputMode="decimal"
                value={line.unitCost}
                data-field-key={`${line.clientId}.unitCost`}
                onChange={(event) => patchLine(index, { unitCost: event.target.value })}
              />
              <Field
                label="IVA %"
                error={fieldErrors[`${line.clientId}.taxRate`]}
                inputMode="decimal"
                value={line.taxRate}
                data-field-key={`${line.clientId}.taxRate`}
                onChange={(event) => patchLine(index, { taxRate: event.target.value })}
              />
            </div>
            {lines.length > 1 && (
              <button className="compact-action compact-action--danger" type="button" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                <Trash2 /> Quitar concepto
              </button>
            )}
          </div>
        ))}
        <button className="compact-action" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
          <Plus /> Añadir concepto
        </button>
        <div className="purchase-total-summary" aria-live="polite">
          <span><small>Base</small><strong>{totals.base.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></span>
          <span><small>IVA</small><strong>{totals.tax.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></span>
          <span className="purchase-total-summary__total"><small>Total</small><strong>{totals.total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></span>
        </div>
      </section>

      <details className="form-card form-options purchase-optional-card">
        <summary>Más datos y documento · opcional</summary>
        <div className="conditional-fields">
          <div className="form-grid">
            <Field label="Vencimiento" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            <SelectField label="Categoría" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="mercancia">Mercancía</option><option value="gestoria">Gestoría</option>
              <option value="transporte">Transporte</option><option value="suministros">Suministros</option>
              <option value="alquiler">Alquiler</option><option value="autonomo">Autónomo</option>
              <option value="impuestos">Impuestos</option><option value="otros">Otros</option>
            </SelectField>
          </div>
          <label className="field"><span className="field__label">Notas</span>
            <textarea rows={3} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div className="purchase-archive-block">
            <div>
              <strong>Documento original</strong>
              <p>Se archiva tal cual. Factupapa no lo interpreta ni crea datos desde el archivo.</p>
            </div>
            {!documentFile ? (
              <label className="purchase-capture-option purchase-capture-option--file">
                <FileUp />
                <span><strong>Adjuntar PDF o imagen</strong><small>Máximo 10 MB</small></span>
                <input
                  className="sr-only"
                  type="file"
                  accept={documentAccept}
                  onChange={(event) => {
                    selectDocument(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : (
              <div className="attachment-card">
                <FileCheck2 />
                <span><strong>{documentFile.name}</strong><small>{(documentFile.size / 1024).toFixed(1)} KB</small></span>
                <button className="icon-button" type="button" aria-label="Quitar documento" onClick={removeDocument}><X /></button>
              </div>
            )}
            {documentError && <div className="form-alert" role="alert">{documentError}</div>}
            {documentPreview && (
              <details className="document-preview">
                <summary>Ver documento</summary>
                {mimeFor(documentFile!) === "application/pdf" ? (
                  <iframe src={documentPreview} title="Documento original" />
                ) : (
                  <img src={documentPreview} alt="Documento original" />
                )}
              </details>
            )}
          </div>
        </div>
      </details>

      {save.isError && <div className="form-alert" role="alert">{saveErrorMessage}</div>}
      <div className="sticky-submit purchase-sticky-submit">
        <span className="invoice-sticky-total"><small>Total</small><strong>{totals.total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></span>
        <Button busy={save.isPending} disabled={!supplierId || !issueDate || !validLines.length} onClick={() => { if (validateForm()) save.mutate(); }}>
          Guardar compra
        </Button>
      </div>
    </div>
  );
}
