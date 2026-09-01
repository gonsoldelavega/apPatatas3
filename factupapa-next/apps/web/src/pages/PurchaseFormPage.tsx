import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Camera,
  FileCheck2,
  FileUp,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ProductUnit, PurchaseLineInput } from "../api/types";
import { contactsApi, financeApi, productsApi } from "../api/services";
import { apiClient } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";

type DraftPurchaseLine = PurchaseLineInput & { clientId: string };
type Confidence = "high" | "medium" | "low";
type DocumentType =
  | "supplier_invoice"
  | "issued_sales_invoice"
  | "supplier_credit_note"
  | "bank_transfer_receipt"
  | "bank_deposit_receipt"
  | "payment_confirmation"
  | "delivery_note"
  | "account_statement"
  | "non_fiscal_document"
  | "unknown";
type ExtractedPurchase = {
  documentType?: DocumentType;
  classificationConfidence?: number;
  classificationEvidence?: Array<{ page?: number; field?: string; quote: string }>;
  classificationReasons?: string[];
  purchaseEligible?: boolean;
  blockingReasons?: string[];
  issuerName?: string;
  issuerTaxId?: string;
  recipientName?: string;
  recipientTaxId?: string;
  currency?: string;
  supplierId?: string;
  supplierName?: string;
  supplierTaxId?: string;
  supplierInvoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  subtotal?: string;
  taxTotal?: string;
  total?: string;
  concept?: string;
  purchasedSacks?: number;
  purchasedQuantityKg?: string;
  lines?: Array<{
    description: string;
    quantity: string;
    unit: "kg" | "g" | "unit";
    unitCost: string;
    taxRate: string;
    discount?: string;
    lineTotal?: string;
  }>;
  ocrConfidence?: number;
  source?: "pdf_text" | "ocr" | "vision";
  fieldConfidence?: Record<string, Confidence>;
  warnings?: string[];
};
type PurchaseDocumentResponse = { id: string; extractedData: ExtractedPurchase };

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
const lineIsValid = (line: DraftPurchaseLine) => {
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
};
const encoded = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });

const documentTypeLabel = (type?: DocumentType) =>
  ({
    supplier_invoice: "Factura de proveedor",
    issued_sales_invoice: "Factura de venta emitida por nosotros",
    supplier_credit_note: "Factura rectificativa / abono de proveedor",
    bank_transfer_receipt: "Justificante de transferencia bancaria",
    bank_deposit_receipt: "Justificante de ingreso o abono bancario",
    payment_confirmation: "Confirmación o recibo de pago",
    delivery_note: "Albarán",
    account_statement: "Extracto bancario",
    non_fiscal_document: "Documento no fiscal",
    unknown: "Documento sin clasificar",
  } satisfies Record<DocumentType, string>)[type ?? "unknown"];

const blockingReasonLabel = (reason: string) =>
  ({
    document_type_not_supplier_invoice: "No es una factura normal de proveedor.",
    external_issuer_not_proven: "No se ha demostrado que el emisor sea un proveedor externo.",
    own_company_recipient_not_proven: "No se ha demostrado que nuestra empresa sea el receptor de la factura.",
    invoice_number_missing: "Falta el número de factura.",
    issue_date_missing: "Falta la fecha de emisión.",
    total_missing: "Falta el total.",
    totals_mismatch: "Base, IVA y total no cuadran.",
    classification_confidence_low: "La clasificación documental no tiene confianza suficiente.",
    own_company_is_issuer: "Nuestra empresa figura como emisora: este documento nunca puede ser una compra.",
  })[reason] ?? reason;

export function PurchaseFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const importedDocumentId = searchParams.get("document");
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
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(Boolean(importedDocumentId));
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<ExtractedPurchase | null>(null);
  const [lines, setLines] = useState<DraftPurchaseLine[]>([emptyLine()]);
  const selectedDocument = useRef<File | null>(null);
  const appliedImportedDocument = useRef<string | null>(null);

  const suppliers = useQuery({
    queryKey: ["purchase-suppliers"],
    queryFn: () => contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
  });
  const products = useQuery({
    queryKey: ["purchase-products"],
    queryFn: () => productsApi.list({ isActive: true, pageSize: 100 }),
  });
  const importedDocument = useQuery({
    queryKey: ["pending-purchase-document", importedDocumentId],
    queryFn: () => financeApi.pendingPurchaseDocument(importedDocumentId!),
    enabled: Boolean(importedDocumentId),
  });

  const patchLine = (index: number, value: Partial<PurchaseLineInput>) =>
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...value } : line,
      ),
    );

  const suggestProductId = (description: string, unit: ProductUnit) => {
    const normalized = description.trim().toLowerCase();
    if (!normalized) return null;
    const exact = products.data?.items.find(
      (product) =>
        product.unit === unit &&
        normalized.includes(product.name.trim().toLowerCase()),
    );
    if (exact) return exact.id;
    const sameUnit = products.data?.items.filter((product) => product.unit === unit) ?? [];
    return sameUnit.length === 1 && unit === "kg" ? sameUnit[0].id : null;
  };

  const applyExtractedData = (id: string, extractedData: ExtractedPurchase) => {
    setDocumentId(id);
    setOcr(extractedData);
    const purchaseAllowed =
      extractedData.documentType === "supplier_invoice" &&
      extractedData.purchaseEligible === true;
    if (!purchaseAllowed) return;
    if (extractedData.supplierId) setSupplierId(extractedData.supplierId);
    setNewSupplierName(extractedData.supplierName ?? "");
    setNewSupplierTaxId(extractedData.supplierTaxId ?? "");
    if (extractedData.supplierInvoiceNumber)
      setSupplierInvoiceNumber(extractedData.supplierInvoiceNumber);
    if (extractedData.issueDate) setIssueDate(extractedData.issueDate);
    if (extractedData.dueDate) setDueDate(extractedData.dueDate);
    if (extractedData.lines?.length) {
      setLines(
        extractedData.lines.map(({ discount, lineTotal, ...line }) => ({
          clientId: crypto.randomUUID(),
          productId: suggestProductId(line.description, line.unit),
          ...line,
          unitCost:
            lineTotal && Number(line.quantity) > 0 && Number(discount ?? 0) !== 0
              ? String(Math.round((Number(lineTotal) / Number(line.quantity)) * 10_000) / 10_000)
              : line.unitCost,
        })),
      );
    } else if (
      extractedData.concept ||
      extractedData.subtotal ||
      extractedData.purchasedQuantityKg
    ) {
      const quantity = extractedData.purchasedQuantityKg ?? "1";
      const subtotal = extractedData.subtotal ?? "";
      const taxRate =
        subtotal && extractedData.taxTotal
          ? String(Math.round((Number(extractedData.taxTotal) / Number(subtotal)) * 10_000) / 100)
          : "4";
      setLines([{
        clientId: crypto.randomUUID(),
        productId: suggestProductId(
          extractedData.concept ?? extractedData.supplierName ?? "",
          extractedData.purchasedQuantityKg ? "kg" : "unit",
        ),
        description: extractedData.concept ?? extractedData.supplierName ?? "Compra según factura",
        quantity,
        unit: extractedData.purchasedQuantityKg ? "kg" : "unit",
        unitCost:
          subtotal && Number(quantity) > 0
            ? String(Math.round((Number(subtotal) / Number(quantity)) * 10_000) / 10_000)
            : "",
        taxRate,
      }]);
    }
  };

  const upload = useMutation({
    mutationFn: async (file: File) =>
      apiClient.request<PurchaseDocumentResponse>("/purchase-documents", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          contentBase64: await encoded(file),
        }),
        timeoutMs: 120_000,
      }),
    onSuccess: ({ id, extractedData }, file) => {
      if (selectedDocument.current !== file) return;
      applyExtractedData(id, extractedData);
    },
  });

  useEffect(() => {
    const document = importedDocument.data;
    if (!document || appliedImportedDocument.current === document.id || !products.data) return;
    appliedImportedDocument.current = document.id;
    applyExtractedData(document.id, document.extractedData as ExtractedPurchase);
    void financeApi.downloadPurchaseDocument(document.id).then((blob) => {
      setDocumentFile(new File([blob], document.filename, { type: document.mimeType }));
    }).catch(() => setDocumentError("No se pudo abrir el adjunto original."));
  }, [importedDocument.data, products.data]);

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

  const allLinesValid = lines.length > 0 && lines.every(lineIsValid);
  const validLines = allLinesValid
    ? lines.map(({ clientId: _clientId, ...line }) => ({
        ...line,
        quantity: decimal(line.quantity),
        unitCost: decimal(line.unitCost),
        taxRate: decimal(line.taxRate),
      }))
    : [];
  const total = useMemo(
    () =>
      validLines.reduce(
        (sum, line) =>
          sum +
          Number(line.quantity) *
            Number(line.unitCost) *
            (1 + Number(line.taxRate) / 100),
        0,
      ),
    [validLines],
  );
  const documentBlocksPurchase = Boolean(
    documentId && ocr && ["issued_sales_invoice", "bank_transfer_receipt", "bank_deposit_receipt", "payment_confirmation", "account_statement", "supplier_credit_note"].includes(ocr.documentType ?? ""),
  );
  const save = useMutation({
    mutationFn: () =>
      financeApi.createPurchase({
        supplierId,
        documentId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
        issueDate,
        dueDate: dueDate || null,
        category,
        notes: notes.trim() || null,
        lines: validLines,
      }),
    onSuccess: (purchase) => navigate(`/gastos/${purchase.id}`),
  });
  const rejectImportedDocument = useMutation({
    mutationFn: () => financeApi.rejectPendingPurchaseDocument(importedDocumentId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pending-purchase-documents"] });
      navigate("/gastos#recibidas-gmail", { replace: true });
    },
  });

  useEffect(() => {
    if (!documentFile) {
      setDocumentPreview(null);
      return;
    }
    const url = URL.createObjectURL(documentFile);
    setDocumentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [documentFile]);

  const removeDocument = () => {
    selectedDocument.current = null;
    setDocumentFile(null);
    setDocumentId(null);
    setDocumentError(null);
    setOcr(null);
    upload.reset();
  };

  const selectDocument = (file?: File) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      setDocumentError("La factura supera el límite de 10 MB.");
      return;
    }
    setDocumentError(null);
    selectedDocument.current = file;
    setDocumentFile(file);
    setDocumentId(null);
    setOcr(null);
    upload.mutate(file);
  };

  const warningLabel = (warning: string) =>
    ({
      totals_mismatch: "Los importes no cuadran: revisa base, IVA y total.",
      supplier_tax_id_missing: "No se reconoció el NIF del proveedor.",
      supplier_tax_id_own: "Se detectó el NIF propio como emisor; no se permite registrarlo como compra.",
      document_not_purchase_eligible: "El documento está bloqueado para compras hasta que su clasificación sea inequívoca.",
      line_amount_mismatch: "Alguna línea no cuadra con cantidad, precio y descuento.",
      vision_unavailable: "La visión no estaba disponible y se usó el OCR alternativo; queda pendiente de clasificación segura.",
      vision_budget_exhausted: "Se alcanzó el límite de lectura inteligente; el OCR alternativo no autoriza compras automáticamente.",
      total_missing: "No se reconoció el total.",
      issue_date_missing: "No se reconoció la fecha.",
      possible_duplicate: "Posible factura duplicada.",
      ocr_failed: "La imagen no pudo leerse.",
      low_confidence: "Lectura poco nítida: revisa todos los campos.",
    })[warning] ?? "Campo pendiente de revisión.";
  const confidenceFor = (field: string) => ocr?.fieldConfidence?.[field];
  const confidenceClass = (field: string) => {
    const confidence = confidenceFor(field);
    return confidence ? `field--confidence-${confidence}` : "";
  };
  const confidenceHint = (field: string) => {
    const confidence = confidenceFor(field);
    return confidence === "low"
      ? "Dato dudoso: compruébalo en la factura original."
      : confidence === "medium"
        ? "Conviene comprobar este dato."
        : undefined;
  };

  return (
    <div className="page form-page purchase-form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/gastos" aria-label="Volver a gastos">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Gasto o mercancía</p>
          <h1>Nueva compra</h1>
        </div>
      </header>

      <section className="upload-card purchase-capture-card">
        <p className="eyebrow">Lectura automática</p>
        <h2>Añade el documento</h2>
        <p>
          Primero se identifica qué tipo de documento es. Solo una factura inequívoca de un proveedor externo dirigida a tu empresa puede convertirse en compra.
        </p>
        {!documentFile ? (
          <div className="purchase-capture-picker">
            <div className="purchase-capture-actions">
              <label className="purchase-capture-option purchase-capture-option--file">
                <FileUp />
                <span>
                  <strong>Elegir archivo</strong>
                  <small>PDF o imagen guardada</small>
                </span>
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
              <label className="purchase-capture-option purchase-capture-option--camera">
                <Camera />
                <span>
                  <strong>Hacer foto</strong>
                  <small>Abrir la cámara</small>
                </span>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    selectDocument(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <p className="purchase-capture-hint">JPG, PNG, HEIC o PDF · máximo 10 MB</p>
          </div>
        ) : (
          <div className="attachment-card">
            <FileCheck2 />
            <span>
              <strong>{documentFile.name}</strong>
              <small>{(documentFile.size / 1024).toFixed(1)} KB</small>
            </span>
            <button className="icon-button" type="button" aria-label="Quitar documento" onClick={removeDocument}>
              <X />
            </button>
          </div>
        )}
        {upload.isPending && (
          <p className="ai-reading-status" role="status">
            <Sparkles /> Leyendo y clasificando el documento…
          </p>
        )}
        {documentId && !documentBlocksPurchase && <p className="success-note">Factura de proveedor clasificada, protegida y vinculada.</p>}
        {documentError && <div className="form-alert" role="alert">{documentError}</div>}
        {upload.isError && (
          <div className="form-alert" role="alert">
            No se pudo leer ni adjuntar el documento. Puedes reintentarlo o quitarlo y registrar una compra manual sin adjunto.
            <Button type="button" variant="secondary" onClick={() => documentFile && upload.mutate(documentFile)}>
              <RefreshCw /> Reintentar lectura
            </Button>
          </div>
        )}
        {importedDocumentId && (
          <button
            type="button"
            className="purchase-document-reject"
            disabled={rejectImportedDocument.isPending || save.isPending}
            onClick={() => rejectImportedDocument.mutate()}
          >
            <Trash2 aria-hidden="true" />
            {rejectImportedDocument.isPending ? "Descartando…" : "No es una compra · conservar como revisado"}
          </button>
        )}
        {rejectImportedDocument.isError && (
          <p className="field-error" role="alert">
            No se pudo cerrar la revisión. El documento sigue intacto y pendiente.
          </p>
        )}
        {ocr && (
          <div className="ocr-review" aria-label="Resultado de la lectura automática">
            <strong>{documentTypeLabel(ocr.documentType)}</strong>
            <span>
              Clasificación: {Math.round((ocr.classificationConfidence ?? 0) * 100)}% · Lectura: {ocr.ocrConfidence ?? 0}%
            </span>
            <span>{ocr.source === "vision" ? "Anthropic Vision" : ocr.source === "pdf_text" ? "Texto del PDF interpretado" : "OCR alternativo"}</span>
            {ocr.issuerName && <span>Emisor: {ocr.issuerName}{ocr.issuerTaxId ? ` · ${ocr.issuerTaxId}` : ""}</span>}
            {ocr.recipientName && <span>Receptor: {ocr.recipientName}{ocr.recipientTaxId ? ` · ${ocr.recipientTaxId}` : ""}</span>}
            {ocr.total && <span>Total detectado: {ocr.total} {ocr.currency ?? "EUR"}</span>}
            {documentBlocksPurchase && (
              <div className="form-alert" role="alert">
                <strong>Bloqueado para compras.</strong>
                {(ocr.blockingReasons?.length ? ocr.blockingReasons : ["document_type_not_supplier_invoice"]).map((reason) => (
                  <span key={reason}>{blockingReasonLabel(reason)}</span>
                ))}
              </div>
            )}
            {ocr.classificationReasons?.map((reason) => <span key={reason}>{reason}</span>)}
            {ocr.classificationEvidence?.slice(0, 4).map((evidence, index) => (
              <span key={`${evidence.page ?? 0}-${index}`}>
                {evidence.page ? `Pág. ${evidence.page}: ` : ""}{evidence.quote}
              </span>
            ))}
            {!documentBlocksPurchase && ocr.supplierName && <span>Proveedor: {ocr.supplierName}</span>}
            {!documentBlocksPurchase && ocr.lines?.length ? <span>{ocr.lines.length} conceptos detectados para revisar.</span> : null}
            <span className="confidence-legend">
              <i className="confidence-dot confidence-dot--high" />Seguro
              <i className="confidence-dot confidence-dot--medium" />Revisar
              <i className="confidence-dot confidence-dot--low" />Dudoso
            </span>
            {ocr.warnings?.map((warning) => <span className="field-error" key={warning}>{warningLabel(warning)}</span>)}
          </div>
        )}
        {documentPreview && (
          <details
            className="document-preview"
            open={documentPreviewOpen}
            onToggle={(event) => setDocumentPreviewOpen(event.currentTarget.open)}
          >
            <summary>Documento original</summary>
            {documentFile?.type === "application/pdf" ? (
              <iframe src={documentPreview} title="Documento original" />
            ) : (
              <img src={documentPreview} alt="Documento original" />
            )}
          </details>
        )}
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">Proveedor</p><h2>Datos de la compra</h2></div>
          <button className="compact-action" type="button" disabled={documentBlocksPurchase} onClick={() => setShowSupplierCreate((current) => !current)}>
            <Building2 /> Nuevo proveedor
          </button>
        </div>
        {documentBlocksPurchase && (
          <p className="field-help">Los campos de compra permanecen separados del documento bloqueado. Quita el documento si necesitas registrar una compra manual independiente.</p>
        )}
        <SelectField label="Proveedor obligatorio" value={supplierId} disabled={documentBlocksPurchase} onChange={(event) => setSupplierId(event.target.value)}>
          <option value="">Selecciona un proveedor</option>
          {suppliers.data?.items.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.tradeName || supplier.legalName}</option>
          ))}
        </SelectField>
        {ocr?.supplierName && !ocr.supplierId && !showSupplierCreate && !documentBlocksPurchase && (
          <button className="compact-action" type="button" onClick={() => setShowSupplierCreate(true)}>
            <Building2 /> Crear proveedor detectado
          </button>
        )}
        {showSupplierCreate && !documentBlocksPurchase && (
          <div className="inline-create-card">
            <strong>Revisar proveedor nuevo</strong>
            <Field className={confidenceClass("supplierName")} hint={confidenceHint("supplierName")} label="Nombre legal" value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} />
            <Field className={confidenceClass("supplierTaxId")} hint={confidenceHint("supplierTaxId")} label="NIF" value={newSupplierTaxId} onChange={(event) => setNewSupplierTaxId(event.target.value.toUpperCase())} />
            {createSupplier.isError && <p className="field-error" role="alert">No se pudo crear. Comprueba si ya existe.</p>}
            <div className="inline-create-card__actions">
              <button type="button" onClick={() => setShowSupplierCreate(false)}>Cancelar</button>
              <Button type="button" disabled={!newSupplierName.trim()} busy={createSupplier.isPending} onClick={() => createSupplier.mutate()}>
                Crear y seleccionar
              </Button>
            </div>
          </div>
        )}
        <Field className={confidenceClass("supplierInvoiceNumber")} hint={confidenceHint("supplierInvoiceNumber")} label="Número de factura del proveedor" disabled={documentBlocksPurchase} value={supplierInvoiceNumber} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} />
        <div className="form-grid">
          <Field className={confidenceClass("issueDate")} hint={confidenceHint("issueDate")} label="Fecha de emisión" type="date" disabled={documentBlocksPurchase} value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required />
          <Field className={confidenceClass("dueDate")} hint={confidenceHint("dueDate")} label="Fecha de vencimiento" type="date" disabled={documentBlocksPurchase} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
        <SelectField label="Categoría" value={category} disabled={documentBlocksPurchase} onChange={(event) => setCategory(event.target.value)}>
          <option value="mercancia">Mercancía</option><option value="gestoria">Gestoría</option>
          <option value="transporte">Transporte</option><option value="suministros">Suministros</option>
          <option value="alquiler">Alquiler</option><option value="autonomo">Autónomo</option>
          <option value="impuestos">Impuestos</option><option value="otros">Otros</option>
        </SelectField>
        <label className="field"><span className="field__label">Notas</span>
          <textarea rows={3} maxLength={4000} disabled={documentBlocksPurchase} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">Detalle</p><h2>Conceptos</h2></div>
          <strong>{new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(total)}</strong>
        </div>
        {lines.map((line, index) => (
          <div className="purchase-line-editor" key={line.clientId}>
            <SelectField
              label="Producto de stock"
              value={line.productId ?? ""}
              disabled={documentBlocksPurchase}
              onChange={(event) => {
                const product = products.data?.items.find((item) => item.id === event.target.value);
                patchLine(index, {
                  productId: event.target.value || null,
                  description: product?.name ?? line.description,
                  unit: product?.unit ?? line.unit,
                });
              }}
            >
              <option value="">No afecta al stock</option>
              {products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </SelectField>
            <Field label="Descripción" disabled={documentBlocksPurchase} value={line.description} onChange={(event) => patchLine(index, { description: event.target.value })} />
            <Field label="Cantidad" inputMode="decimal" disabled={documentBlocksPurchase} value={line.quantity} onChange={(event) => patchLine(index, { quantity: event.target.value })} />
            <SelectField label="Unidad" value={line.unit} disabled={documentBlocksPurchase} onChange={(event) => patchLine(index, { unit: event.target.value as ProductUnit })}>
              <option value="kg">kg</option><option value="g">g</option><option value="unit">unidad</option>
              <option value="box">caja</option><option value="custom">otra</option>
            </SelectField>
            <Field label="Coste unidad sin IVA" inputMode="decimal" disabled={documentBlocksPurchase} value={line.unitCost} onChange={(event) => patchLine(index, { unitCost: event.target.value })} />
            <Field label="IVA %" inputMode="decimal" disabled={documentBlocksPurchase} value={line.taxRate} onChange={(event) => patchLine(index, { taxRate: event.target.value })} />
            {lines.length > 1 && !documentBlocksPurchase && (
              <button className="icon-button" type="button" aria-label={`Eliminar concepto ${index + 1}`} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                <Trash2 />
              </button>
            )}
          </div>
        ))}
        {!allLinesValid && !documentBlocksPurchase && <p className="field-help" role="status">Completa descripción, cantidad, coste e IVA de todos los conceptos.</p>}
        {!documentBlocksPurchase && (
          <button className="compact-action" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus /> Añadir concepto
          </button>
        )}
      </section>

      {save.isError && <div className="form-alert" role="alert">No se pudo guardar la compra. Revisa proveedor, clasificación, fechas e importes.</div>}
      <div className="sticky-submit">
        <Button
          disabled={documentBlocksPurchase || !supplierId || !issueDate || !allLinesValid || upload.isPending}
          busy={save.isPending}
          onClick={() => save.mutate()}
        >
          {documentBlocksPurchase ? "Documento bloqueado para compras" : "Guardar para revisión"}
        </Button>
      </div>
    </div>
  );
}
