import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Eye,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { accountsApi, financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { useToast } from "../ui/ToastProvider";
import { formatMoney, formatQuantity, todayLocal } from "../utils/format";

function normalizedAmount(value: string): number {
  return Number(value.trim().replace(",", "."));
}

export function PurchaseDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showPayment, setShowPayment] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayLocal());

  const purchase = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => financeApi.purchase(id),
  });

  const transition = useMutation({
    mutationFn: (requestedAction: "confirm" | "cancel") =>
      financeApi.transitionPurchase(id, requestedAction),
    onSuccess: async (updatedPurchase, requestedAction) => {
      queryClient.setQueryData(["purchase", id], updatedPurchase);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      toast.show(
        requestedAction === "confirm"
          ? "Compra confirmada y stock actualizado"
          : "Compra cancelada",
      );
    },
  });

  const documentView = useMutation({
    mutationFn: financeApi.downloadPurchaseDocument,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });

  const payments = useQuery({
    queryKey: ["purchase-payments", id],
    queryFn: () => accountsApi.purchasePayments(id),
    enabled: purchase.data?.status === "confirmed",
  });

  const pendingBalance = Number(purchase.data?.balanceDue ?? 0);
  const enteredAmount = normalizedAmount(amount);
  const paymentAmountIsValid =
    Number.isFinite(enteredAmount) &&
    enteredAmount > 0 &&
    enteredAmount <= pendingBalance + 0.0001;

  const addPayment = useMutation({
    mutationFn: () => {
      if (!paymentAmountIsValid) {
        throw new Error("invalid_payment_amount");
      }
      return accountsApi.addPurchasePayment(id, {
        amount: enteredAmount.toFixed(2),
        paidAt: `${paidOn}T12:00:00`,
        method: "transfer",
        reference: null,
        notes: null,
      });
    },
    onSuccess: async () => {
      setShowPayment(false);
      setAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase", id] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-payments", id] }),
        queryClient.invalidateQueries({ queryKey: ["purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      toast.show("Pago registrado");
    },
  });

  if (purchase.isLoading) {
    return (
      <div className="page">
        <div className="loading-card" role="status">
          Cargando compra…
        </div>
      </div>
    );
  }

  if (purchase.isError || !purchase.data) {
    return (
      <div className="page">
        <div className="form-alert" role="alert">
          <p>No se ha podido cargar la compra.</p>
          <Button
            type="button"
            variant="secondary"
            icon={<RotateCcw />}
            onClick={() => void purchase.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const item = purchase.data;

  const requestTransition = (requestedAction: "confirm" | "cancel") => {
    if (transition.isPending) return;
    const confirmed = window.confirm(
      requestedAction === "confirm"
        ? "La compra se confirmará y afectará al stock y a los saldos. ¿Continuar?"
        : "La compra quedará cancelada. ¿Continuar?",
    );
    if (confirmed) transition.mutate(requestedAction);
  };

  return (
    <div className="page purchase-detail-page">
      <header className="detail-header">
        <Link className="icon-button" to="/gastos" aria-label="Volver a gastos">
          <ArrowLeft />
        </Link>
        <div className="detail-header__title">
          <p className="eyebrow">Compra</p>
          <h1>{item.supplierInvoiceNumber || "Pendiente de revisar"}</h1>
          <span className={`status status--${item.status}`}>
            {item.status === "draft"
              ? "Borrador"
              : item.status === "confirmed"
                ? "Confirmada"
                : "Cancelada"}
          </span>
        </div>
      </header>

      <section className="detail-card">
        <p>
          <strong>Proveedor:</strong> {item.supplierName}
        </p>
        <p>
          <strong>Emisión:</strong> {item.issueDate}
        </p>
        {item.documentId && (
          <Button
            type="button"
            variant="secondary"
            icon={<Eye />}
            busy={documentView.isPending}
            onClick={() => documentView.mutate(item.documentId!)}
          >
            Ver documento original
          </Button>
        )}
        {documentView.isError && (
          <p className="field-error" role="alert">
            No se ha podido abrir el documento original.
          </p>
        )}
        {item.sourceRegistryUrl && (
          <a
            className="compact-action"
            href={item.sourceRegistryUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink />
            {item.sourceRegistryFilename || "Abrir original en Drive"}
          </a>
        )}
      </section>

      {item.status === "confirmed" && (
        <section className="detail-card payment-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pago al proveedor</p>
              <h2>
                {item.paymentStatus === "paid"
                  ? "Compra pagada"
                  : `${formatMoney(item.balanceDue)} pendientes`}
              </h2>
            </div>
            {item.paymentStatus !== "paid" && (
              <button
                type="button"
                className="compact-action"
                aria-expanded={showPayment}
                onClick={() => {
                  setAmount(formatQuantity(item.balanceDue));
                  setShowPayment((current) => !current);
                  addPayment.reset();
                }}
              >
                <Banknote />
                Registrar pago
              </button>
            )}
          </div>

          {showPayment && (
            <div className="inline-payment-form">
              <label className="field">
                <span>Importe</span>
                <span className="field__control">
                  <input
                    inputMode="decimal"
                    value={amount}
                    aria-invalid={Boolean(amount) && !paymentAmountIsValid}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      addPayment.reset();
                    }}
                  />
                </span>
              </label>
              <small className="field-help">
                Máximo pendiente: {formatMoney(item.balanceDue)}.
              </small>
              {amount && !paymentAmountIsValid && (
                <p className="field-error" role="alert">
                  Introduce un importe mayor que 0 y no superior a lo pendiente.
                </p>
              )}
              <label className="field">
                <span>Fecha</span>
                <span className="field__control">
                  <input
                    type="date"
                    value={paidOn}
                    onChange={(event) => setPaidOn(event.target.value)}
                  />
                </span>
              </label>
              <Button
                type="button"
                busy={addPayment.isPending}
                disabled={!paymentAmountIsValid || !paidOn}
                onClick={() => addPayment.mutate()}
              >
                Guardar pago
              </Button>
              {addPayment.isError && paymentAmountIsValid && (
                <p className="field-error" role="alert">
                  No se pudo registrar el pago. Actualiza la compra y vuelve a
                  intentarlo.
                </p>
              )}
            </div>
          )}

          {payments.isError && (
            <p className="field-error" role="alert">
              No se ha podido cargar el historial de pagos.
            </p>
          )}
          {payments.data?.map((payment) => (
            <p className="payment-row" key={payment.id}>
              <span>
                {new Date(payment.paidAt).toLocaleDateString("es-ES")}
              </span>
              <strong>{formatMoney(payment.amount)}</strong>
            </p>
          ))}
        </section>
      )}

      <section className="detail-card">
        <h2>Conceptos</h2>
        {item.lines?.map((line) => (
          <div className="sales-line" key={line.id}>
            <span>
              {line.description}
              <small>
                {formatQuantity(line.quantity)} {line.unit}
              </small>
            </span>
            <strong>{formatMoney(line.lineTotal)}</strong>
          </div>
        ))}
        <h2>Total: {formatMoney(item.total)}</h2>
      </section>

      {item.status === "draft" && (
        <div className="document-actions">
          <Button
            type="button"
            icon={<CheckCircle2 />}
            busy={transition.isPending && transition.variables === "confirm"}
            disabled={transition.isPending || !item.lines?.length}
            onClick={() => requestTransition("confirm")}
          >
            Confirmar compra
          </Button>
          <Button
            type="button"
            variant="danger"
            icon={<XCircle />}
            busy={transition.isPending && transition.variables === "cancel"}
            disabled={transition.isPending}
            onClick={() => requestTransition("cancel")}
          >
            Cancelar
          </Button>
        </div>
      )}

      {item.status === "draft" && !item.lines?.length && (
        <div className="form-alert" role="alert">
          Añade al menos un concepto antes de confirmar la compra.
        </div>
      )}

      {transition.isError && (
        <div className="form-alert" role="alert">
          <p>
            No se ha podido cambiar el estado. Puede deberse a una pérdida de
            conexión o a que la sesión se haya renovado.
          </p>
          <Button
            type="button"
            variant="secondary"
            icon={<RotateCcw />}
            disabled={transition.isPending}
            onClick={() => void purchase.refetch()}
          >
            Actualizar compra
          </Button>
        </div>
      )}
    </div>
  );
}
