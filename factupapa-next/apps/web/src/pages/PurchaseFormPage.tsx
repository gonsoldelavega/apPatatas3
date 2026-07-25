import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, FileCheck2, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProductUnit, PurchaseLineInput } from "../api/types";
import { contactsApi, financeApi, productsApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { todayLocal } from "../utils/format";

type DraftPurchaseLine = PurchaseLineInput & { clientId: string };

const emptyLine = (): DraftPurchaseLine => ({
  clientId: crypto.randomUUID(),
  productId: null,
  description: "",
  quantity: "1",
  unit: "kg",
  unitCost: "",
  taxRate: "4",
});

const encoded = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () =>
      resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });

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
  const [lines, setLines] = useState<DraftPurchaseLine[]>([emptyLine()]);
  const selectedDocument = useRef<File | null>(null);

  const suppliers = useQuery({
    queryKey: ["purchase-suppliers"],
    queryFn: () =>
      contactsApi.list({ type: "supplier", isActive: true, pageSize: 100 }),
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

  const upload = useMutation({
    mutationFn: async (file: File) =>
      financeApi.archivePurchaseDocument({
        filename: file.name,
        mimeType: file.type,
        contentBase64: await encoded(file),
      }),
    onSuccess: ({ id }, file) => {
      if (selectedDocument.current === file) setDocumentId(id);
    },
  });

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
      setNewSupplierName("");
      setNewSupplierTaxId("");
      await queryClient.invalidateQueries({ queryKey: ["purchase-suppliers"] });
    },
  });

  const validLines = lines
    .filter((line) => line.description.trim() && line.unitCost.trim())
    .map(({ clientId: _clientId, ...line }) => line);
  const total = useMemo(
    () =>
      validLines.reduce(
        (sum, line) =>
          sum +
          Number(line.quantity || 0) *
            Number(line.unitCost || 0) *
            (1 + Number(line.taxRate || 0) / 100),
        0,
      ),
    [validLines],
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
    upload.reset();
  };

  return (
    <div className="page form-page purchase-form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/gastos" aria-label="Volver">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Gasto o mercancía</p>
          <h1>Nueva compra</h1>
        </div>
      </header>

      <section className="upload-card">
        <p className="eyebrow">Justificante opcional</p>
        <h2>Guardar factura original</h2>
        <p>
          Adjunta el PDF o la foto para conservarla junto a la compra. Los datos
          se introducen manualmente o llegan desde el registro externo.
        </p>
        {!documentFile ? (
          <label className="drop-zone">
            <FileUp />
            <strong>Seleccionar PDF o foto</strong>
            <span>Máximo 10 MB. No se envía a servicios de IA.</span>
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 10_000_000) {
                  setDocumentError("El justificante supera el límite de 10 MB.");
                  return;
                }
                setDocumentError(null);
                selectedDocument.current = file;
                setDocumentFile(file);
                setDocumentId(null);
                upload.mutate(file);
              }}
            />
          </label>
        ) : (
          <div className="attachment-card">
            <FileCheck2 />
            <span>
              <strong>{documentFile.name}</strong>
              <small>{(documentFile.size / 1024).toFixed(1)} KB</small>
            </span>
            <button
              className="icon-button"
              type="button"
              aria-label="Quitar justificante"
              onClick={removeDocument}
            >
              <X />
            </button>
          </div>
        )}
        {upload.isPending && <p role="status">Guardando justificante…</p>}
        {documentId && <p className="success-note">Justificante protegido y vinculado.</p>}
        {documentError && (
          <div className="form-alert" role="alert">
            {documentError}
          </div>
        )}
        {upload.isError && (
          <div className="form-alert" role="alert">
            No se pudo guardar el justificante. Comprueba el formato y el tamaño.
            <Button
              type="button"
              variant="secondary"
              onClick={() => documentFile && upload.mutate(documentFile)}
            >
              Reintentar
            </Button>
          </div>
        )}
        {documentPreview && (
          <details className="document-preview">
            <summary>Ver justificante</summary>
            {documentFile?.type === "application/pdf" ? (
              <iframe src={documentPreview} title="Justificante de compra" />
            ) : (
              <img src={documentPreview} alt="Justificante de compra" />
            )}
          </details>
        )}
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Proveedor</p>
            <h2>Datos de la compra</h2>
          </div>
          <button
            className="compact-action"
            type="button"
            onClick={() => setShowSupplierCreate((current) => !current)}
          >
            <Building2 />
            Nuevo proveedor
          </button>
        </div>
        <SelectField
          label="Proveedor obligatorio"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">Selecciona un proveedor</option>
          {suppliers.data?.items.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.tradeName || supplier.legalName}
            </option>
          ))}
        </SelectField>
        {showSupplierCreate && (
          <div className="inline-create-card">
            <strong>Crear proveedor</strong>
            <Field
              label="Nombre legal"
              value={newSupplierName}
              onChange={(event) => setNewSupplierName(event.target.value)}
            />
            <Field
              label="NIF"
              value={newSupplierTaxId}
              onChange={(event) =>
                setNewSupplierTaxId(event.target.value.toUpperCase())
              }
            />
            {createSupplier.isError && (
              <p className="field-error" role="alert">
                No se pudo crear. Comprueba si ya existe.
              </p>
            )}
            <div className="inline-create-card__actions">
              <button type="button" onClick={() => setShowSupplierCreate(false)}>
                Cancelar
              </button>
              <Button
                type="button"
                disabled={!newSupplierName.trim()}
                busy={createSupplier.isPending}
                onClick={() => createSupplier.mutate()}
              >
                Crear y seleccionar
              </Button>
            </div>
          </div>
        )}
        <Field
          label="Número de factura del proveedor"
          value={supplierInvoiceNumber}
          onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
        />
        <div className="form-grid">
          <Field
            label="Fecha de emisión"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
          <Field
            label="Fecha de vencimiento"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
        <SelectField
          label="Categoría"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="mercancia">Mercancía</option>
          <option value="gestoria">Gestoría</option>
          <option value="transporte">Transporte</option>
          <option value="suministros">Suministros</option>
          <option value="alquiler">Alquiler</option>
          <option value="autonomo">Autónomo</option>
          <option value="impuestos">Impuestos</option>
          <option value="otros">Otros</option>
        </SelectField>
        <label className="field">
          <span className="field__label">Notas</span>
          <textarea
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Detalle</p>
            <h2>Conceptos</h2>
          </div>
          <strong>{total.toFixed(2)} €</strong>
        </div>
        {lines.map((line, index) => (
          <div className="purchase-line-editor" key={line.clientId}>
            <SelectField
              label="Producto de stock"
              value={line.productId ?? ""}
              onChange={(event) => {
                const product = products.data?.items.find(
                  (item) => item.id === event.target.value,
                );
                patchLine(index, {
                  productId: event.target.value || null,
                  description: product?.name ?? line.description,
                  unit: product?.unit ?? line.unit,
                });
              }}
            >
              <option value="">No afecta al stock</option>
              {products.data?.items.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </SelectField>
            <Field
              label="Descripción"
              value={line.description}
              onChange={(event) =>
                patchLine(index, { description: event.target.value })
              }
            />
            <Field
              label="Cantidad"
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) =>
                patchLine(index, { quantity: event.target.value })
              }
            />
            <SelectField
              label="Unidad"
              value={line.unit}
              onChange={(event) =>
                patchLine(index, {
                  unit: event.target.value as ProductUnit,
                })
              }
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="unit">unidad</option>
              <option value="box">caja</option>
              <option value="custom">otra</option>
            </SelectField>
            <Field
              label="Coste unidad sin IVA"
              inputMode="decimal"
              value={line.unitCost}
              onChange={(event) =>
                patchLine(index, { unitCost: event.target.value })
              }
            />
            <Field
              label="IVA %"
              inputMode="decimal"
              value={line.taxRate}
              onChange={(event) =>
                patchLine(index, { taxRate: event.target.value })
              }
            />
            {lines.length > 1 && (
              <button
                className="icon-button"
                type="button"
                aria-label={`Eliminar concepto ${index + 1}`}
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                <Trash2 />
              </button>
            )}
          </div>
        ))}
        <button
          className="compact-action"
          type="button"
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          <Plus />
          Añadir concepto
        </button>
      </section>

      {save.isError && (
        <div className="form-alert" role="alert">
          No se pudo guardar la compra. Revisa proveedor, fechas e importes.
        </div>
      )}
      <div className="sticky-submit">
        <Button
          disabled={
            !supplierId ||
            validLines.length === 0 ||
            upload.isPending ||
            (Boolean(documentFile) && !documentId)
          }
          busy={save.isPending}
          onClick={() => save.mutate()}
        >
          Guardar para revisión
        </Button>
      </div>
    </div>
  );
}
