import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CheckCircle2, ExternalLink, Eye, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { accountsApi, financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { useToast } from "../ui/ToastProvider";
import { formatMoney, formatQuantity, todayLocal } from "../utils/format";
export function PurchaseDetailPage() {
  const { id = "" } = useParams(),
    qc = useQueryClient(),
    [showPayment,setShowPayment]=useState(false),
    [amount,setAmount]=useState(""),
    [paidOn,setPaidOn]=useState(todayLocal()),
    toast = useToast(),
    q = useQuery({
      queryKey: ["purchase", id],
      queryFn: () => financeApi.purchase(id),
    }),
    action = useMutation({
      mutationFn: (x: "confirm" | "cancel") =>
        financeApi.transitionPurchase(id, x),
      onSuccess: async (purchase, requestedAction) => {
        qc.setQueryData(["purchase", id], purchase);
        await qc.invalidateQueries({ queryKey: ["purchases"] });
        toast.show(
          requestedAction === "confirm" ? "Compra confirmada" : "Compra cancelada",
        );
      },
    }),
    view = useMutation({
      mutationFn: financeApi.downloadPurchaseDocument,
      onSuccess: (b) => {
        const u = URL.createObjectURL(b);
        window.open(u, "_blank", "noopener,noreferrer");
      },
    }),
    payments=useQuery({queryKey:["purchase-payments",id],queryFn:()=>accountsApi.purchasePayments(id),enabled:q.data?.status==="confirmed"}),
    addPayment=useMutation({
      mutationFn:()=>accountsApi.addPurchasePayment(id,{amount:amount.replace(",","."),paidAt:`${paidOn}T12:00:00`,method:"transfer",reference:null,notes:null}),
      onSuccess:async()=>{setShowPayment(false);setAmount("");await Promise.all([
        qc.invalidateQueries({queryKey:["purchase",id]}),qc.invalidateQueries({queryKey:["purchase-payments",id]}),qc.invalidateQueries({queryKey:["purchases"]})
      ]);}
    });
  if (!q.data) return <div className="page">Cargando…</div>;
  const x = q.data;
  return (
    <div className="page purchase-detail-page">
      <header className="detail-header">
        <Link to="/gastos">
          <ArrowLeft />
        </Link>
        <h1>{x.supplierInvoiceNumber || "Por revisar"}</h1>
      </header>
      <section className="detail-card">
        <p>
          <strong>Proveedor:</strong> {x.supplierName}
        </p>
        <p>
          <strong>Emisión:</strong> {x.issueDate}
        </p>
        {x.documentId && (
          <Button icon={<Eye />} onClick={() => view.mutate(x.documentId!)}>
            Ver documento original
          </Button>
        )}
        {x.sourceRegistryUrl && (
          <a
            className="compact-action"
            href={x.sourceRegistryUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink />
            {x.sourceRegistryFilename || "Abrir original en Drive"}
          </a>
        )}
      </section>
      {x.status === "confirmed" && (
        <section className="detail-card payment-card">
          <div className="section-heading">
            <div><p className="eyebrow">Pago al proveedor</p>
              <h2>{x.paymentStatus==="paid" ? "Compra pagada" : `${formatMoney(x.balanceDue)} pendientes`}</h2>
            </div>
            {x.paymentStatus!=="paid" && <button className="compact-action" onClick={()=>{setAmount(formatQuantity(x.balanceDue));setShowPayment(!showPayment);}}><Banknote/>Registrar pago</button>}
          </div>
          {showPayment && <div className="inline-payment-form">
            <label className="field"><span>Importe</span><span className="field__control"><input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)}/></span></label>
            <label className="field"><span>Fecha</span><span className="field__control"><input type="date" value={paidOn} onChange={(e)=>setPaidOn(e.target.value)}/></span></label>
            <Button busy={addPayment.isPending} onClick={()=>addPayment.mutate()}>Guardar pago</Button>
          </div>}
          {payments.data?.map((payment)=><p className="payment-row" key={payment.id}><span>{new Date(payment.paidAt).toLocaleDateString("es-ES")}</span><strong>{formatMoney(payment.amount)}</strong></p>)}
        </section>
      )}
      <section className="detail-card">
        <h2>Conceptos</h2>
        {x.lines?.map((l) => (
          <div className="sales-line" key={l.id}>
            <span>
              {l.description}
              <small>
                {formatQuantity(l.quantity)} {l.unit}
              </small>
            </span>
            <strong>{formatMoney(l.lineTotal)}</strong>
          </div>
        ))}
        <h2>Total: {formatMoney(x.total)}</h2>
      </section>
      {x.status === "draft" && (
        <div className="document-actions">
          <Button
            type="button"
            icon={<CheckCircle2 />}
            busy={action.isPending && action.variables === "confirm"}
            disabled={action.isPending}
            onClick={() => action.mutate("confirm")}
          >
            Confirmar compra
          </Button>
          <Button
            type="button"
            variant="danger"
            icon={<XCircle />}
            busy={action.isPending && action.variables === "cancel"}
            disabled={action.isPending}
            onClick={() => action.mutate("cancel")}
          >
            Cancelar
          </Button>
        </div>
      )}
      {action.isError && (
        <div className="form-alert" role="alert">
          No se ha podido cambiar el estado de la compra. Recarga la página y
          vuelve a intentarlo.
        </div>
      )}
    </div>
  );
}
