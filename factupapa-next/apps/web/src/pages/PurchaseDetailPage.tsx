import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Eye, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { formatMoney, formatQuantity } from "../utils/format";
export function PurchaseDetailPage() {
  const { id = "" } = useParams(),
    qc = useQueryClient(),
    q = useQuery({
      queryKey: ["purchase", id],
      queryFn: () => financeApi.purchase(id),
    }),
    action = useMutation({
      mutationFn: (x: "confirm" | "cancel") =>
        financeApi.transitionPurchase(id, x),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase", id] }),
    }),
    view = useMutation({
      mutationFn: financeApi.downloadPurchaseDocument,
      onSuccess: (b) => {
        const u = URL.createObjectURL(b);
        window.open(u, "_blank", "noopener,noreferrer");
      },
    });
  if (!q.data) return <div className="page">Cargando…</div>;
  const x = q.data;
  return (
    <div className="page">
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
      </section>
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
            icon={<CheckCircle2 />}
            onClick={() => action.mutate("confirm")}
          >
            Confirmar compra
          </Button>
          <Button
            variant="danger"
            icon={<XCircle />}
            onClick={() => action.mutate("cancel")}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
