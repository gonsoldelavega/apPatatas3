import { ArrowLeft, FileDown } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Invoice } from "../api/types";
import { financeApi, invoicesApi } from "../api/services";
import { Button } from "../ui/Button";
import { PeriodPicker } from "../ui/PeriodPicker";
import { currentPeriod, periodLabel, periodRange } from "../utils/period";
import { csvBody } from "../utils/csv";

const euros = (value: string) => value.replace(".", ",");

function downloadCsv(filename: string, rows: string[][]) {
  const body = csvBody(rows);
  const blob = new Blob(["\ufeff", body], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const salesStatus: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitida",
  cancelled: "Cancelada",
};
const purchaseStatus: Record<string, string> = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

async function allInvoices(range: { from?: string; to?: string }) {
  const items: Invoice[] = [];
  for (let page = 1; ; page++) {
    const result = await invoicesApi.list({
      ...range,
      status: "issued",
      pageSize: 100,
      page,
    });
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) break;
  }
  return items;
}

export function ExportPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState<"sales" | "purchases" | null>(null);
  const [error, setError] = useState(false);
  const range = periodRange(period);
  const header = [
    "Número",
    "Fecha",
    "Cliente/Proveedor",
    "NIF",
    "Base",
    "IVA",
    "Total",
    "Estado",
  ];
  const exportSales = async () => {
    setBusy("sales");
    setError(false);
    try {
      const invoices = await allInvoices(range);
      downloadCsv(`facturas-emitidas_${periodLabel(period)}.csv`, [
        header,
        ...invoices.map((invoice) => [
          invoice.number != null ? `${invoice.series}-${invoice.number}` : "",
          invoice.issueDate,
          invoice.contactLegalName,
          invoice.contactTaxId ?? "",
          euros(invoice.subtotal),
          euros(invoice.taxTotal),
          euros(invoice.total),
          salesStatus[invoice.status] ?? invoice.status,
        ]),
      ]);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };
  const exportPurchases = async () => {
    setBusy("purchases");
    setError(false);
    try {
      const purchases = await financeApi.confirmedPurchasesForExport(
        range.from,
        range.to,
      );
      downloadCsv(`compras_${periodLabel(period)}.csv`, [
        header,
        ...purchases.map((purchase) => [
          purchase.supplierInvoiceNumber ?? "",
          purchase.issueDate,
          purchase.supplierName ?? "",
          purchase.supplierTaxId ?? "",
          euros(purchase.subtotal),
          euros(purchase.taxTotal),
          euros(purchase.total),
          purchaseStatus[purchase.status] ?? purchase.status,
        ]),
      ]);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page form-page export-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/mas">
          <ArrowLeft />
        </Link>
        <h1>Exportar para la gestoría</h1>
      </header>
      <section className="form-card">
        <p>
          Descarga en CSV (compatible con Excel) únicamente las facturas emitidas
          y las compras confirmadas del periodo elegido, con número, fecha, NIF,
          base, IVA, total y estado.
        </p>
        <PeriodPicker value={period} onChange={setPeriod} />
        {error && (
          <p className="field-error" role="alert">
            No se pudo generar la exportación. Inténtalo de nuevo.
          </p>
        )}
        <div className="finance-actions">
          <Button
            icon={<FileDown />}
            busy={busy === "sales"}
            disabled={busy !== null || !range.from}
            onClick={() => void exportSales()}
          >
            Facturas emitidas (CSV)
          </Button>
          <Button
            icon={<FileDown />}
            busy={busy === "purchases"}
            disabled={busy !== null || !range.from}
            onClick={() => void exportPurchases()}
          >
            Compras (CSV)
          </Button>
        </div>
      </section>
    </div>
  );
}
