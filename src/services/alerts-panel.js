/* ============================================================
   FACTUPAPA — Alerts & Insights Panel
   Genera alertas inteligentes basadas en los datos del negocio.
   Se llama desde dashboard-view.js pasándole el estado.
   ============================================================ */

(function(global){

  function buildAlerts(state, helpers){
    const { n, money, date, today, invoiceTotals, invoiceIsOverdue } = helpers;
    const alerts = [];
    const todayStr = today();
    const currentMonth = todayStr.slice(0, 7);
    const prevMonth = getPrevMonth(currentMonth);

    /* ── Utilidades ── */
    function invoiceMonth(inv){ return (inv.issueDate || inv.date || "").slice(0, 7); }
    function invoiceTotal(inv){ return n(invoiceTotals ? invoiceTotals(inv).total : (inv.total || 0)); }
    function sum(list, fn){ return list.reduce((acc, x) => acc + fn(x), 0); }

    /* ── 1. Comparativa ventas mes actual vs anterior ── */
    const invoicesThisMonth = (state.invoices || []).filter(i => invoiceMonth(i) === currentMonth);
    const invoicesPrevMonth = (state.invoices || []).filter(i => invoiceMonth(i) === prevMonth);
    const salesThis = sum(invoicesThisMonth, invoiceTotal);
    const salesPrev = sum(invoicesPrevMonth, invoiceTotal);

    if(salesPrev > 0){
      const diff = salesThis - salesPrev;
      const pct  = Math.round((diff / salesPrev) * 100);
      if(Math.abs(pct) >= 10){
        alerts.push({
          type: diff >= 0 ? "good" : "warn",
          icon: diff >= 0 ? "📈" : "📉",
          title: diff >= 0
            ? `Ventas +${pct}% vs el mes pasado`
            : `Ventas ${pct}% vs el mes pasado`,
          detail: `Este mes: ${money(salesThis)} · Mes anterior: ${money(salesPrev)}`
        });
      } else {
        alerts.push({
          type: "neutral",
          icon: "↔️",
          title: `Ventas similares al mes anterior`,
          detail: `Este mes: ${money(salesThis)} · Anterior: ${money(salesPrev)}`
        });
      }
    } else if(salesThis > 0) {
      alerts.push({
        type: "good",
        icon: "🚀",
        title: `Primer mes con ventas registradas`,
        detail: `Total facturado: ${money(salesThis)}`
      });
    }

    /* ── 2. Facturas pendientes de cobro ── */
    const pendingInvoices = (state.invoices || []).filter(inv => {
      const status = inv.status || "pending";
      return status === "pending" || status === "partial";
    });
    const pendingTotal = sum(pendingInvoices, invoiceTotal);

    if(pendingInvoices.length > 0){
      alerts.push({
        type: pendingTotal > 500 ? "warn" : "info",
        icon: "💰",
        title: `${pendingInvoices.length} factura${pendingInvoices.length > 1 ? "s" : ""} pendiente${pendingInvoices.length > 1 ? "s" : ""} de cobro`,
        detail: `Total por cobrar: ${money(pendingTotal)}`
      });
    }

    /* ── 3. Facturas vencidas (dueDate < hoy y no pagadas) ── */
    const overdueInvoices = (state.invoices || []).filter(inv => {
      if(inv.status === "paid") return false;
      const due = inv.dueDate || inv.issueDate || "";
      if(!due) return false;
      return due < todayStr;
    });

    if(overdueInvoices.length > 0){
      const overdueTotal = sum(overdueInvoices, invoiceTotal);
      alerts.push({
        type: "danger",
        icon: "⚠️",
        title: `${overdueInvoices.length} factura${overdueInvoices.length > 1 ? "s" : ""} vencida${overdueInvoices.length > 1 ? "s" : ""}`,
        detail: `Importe vencido: ${money(overdueTotal)} — Revisa los cobros`
      });
    }

    /* ── 4. Balance del mes (gastos vs ingresos) ── */
    const expensesThis = sum(
      (state.expenses || []).filter(e => (e.date || "").slice(0, 7) === currentMonth),
      e => n(e.base) + n(e.iva)
    );
    const purchasesThis = sum(
      (state.purchases || []).filter(p => (p.date || "").slice(0, 7) === currentMonth),
      p => n(p.total || p.totalAmount || 0)
    );
    const totalCostsThis = expensesThis + purchasesThis;
    const balance = salesThis - totalCostsThis;

    if(salesThis > 0 && totalCostsThis > 0){
      const marginPct = Math.round((balance / salesThis) * 100);
      if(marginPct < 20){
        alerts.push({
          type: "warn",
          icon: "📊",
          title: `Margen ajustado este mes: ${marginPct}%`,
          detail: `Ingresos: ${money(salesThis)} · Costes: ${money(totalCostsThis)}`
        });
      } else {
        alerts.push({
          type: "good",
          icon: "📊",
          title: `Margen saludable este mes: ${marginPct}%`,
          detail: `Balance: ${money(balance)}`
        });
      }
    }

    /* ── 5. Sin facturas este mes (si hay meses anteriores) ── */
    if(invoicesThisMonth.length === 0 && (state.invoices || []).length > 0){
      const dayOfMonth = parseInt(todayStr.slice(8, 10), 10);
      if(dayOfMonth > 5){
        alerts.push({
          type: "info",
          icon: "📋",
          title: `Aún no hay facturas este mes`,
          detail: `Último mes con actividad: ${prevMonth}`
        });
      }
    }

    /* ── 6. Clientes con deuda acumulada ── */
    const clientDebt = {};
    (state.invoices || []).forEach(inv => {
      if(inv.status === "paid") return;
      const total = invoiceTotal(inv);
      const paid = n(inv.amountPaid);
      const pending = total - paid;
      if(pending > 0.01 && inv.clientId){
        clientDebt[inv.clientId] = (clientDebt[inv.clientId] || 0) + pending;
      }
    });
    const debtors = Object.entries(clientDebt)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);

    if(debtors.length > 0){
      const topDebtor = debtors[0];
      const client = (state.clients || []).find(c => c.id === topDebtor[0]);
      if(client && topDebtor[1] > 50){
        alerts.push({
          type: "warn",
          icon: "👤",
          title: `${client.name} debe ${money(topDebtor[1])}`,
          detail: debtors.length > 1
            ? `${debtors.length} clientes con deuda pendiente`
            : `Mayor deuda pendiente`
        });
      }
    }

    return alerts;
  }

  function getPrevMonth(monthKey){
    const [year, month] = monthKey.split("-").map(Number);
    if(month === 1) return `${year - 1}-12`;
    return `${year}-${String(month - 1).padStart(2, "0")}`;
  }

  function renderAlertsPanel(state, helpers){
    const alerts = buildAlerts(state, helpers);

    if(alerts.length === 0){
      return `<div class="alerts-panel alerts-empty">
        <span class="alerts-icon">✅</span>
        <span>Todo en orden por ahora</span>
      </div>`;
    }

    const colorMap = {
      good:    { bg: "rgba(90,122,58,.10)",  border: "rgba(90,122,58,.22)",  text: "#3A5C20" },
      warn:    { bg: "rgba(196,137,42,.10)", border: "rgba(196,137,42,.28)", text: "#7A5010" },
      danger:  { bg: "rgba(184,48,48,.10)",  border: "rgba(184,48,48,.24)",  text: "#882020" },
      info:    { bg: "rgba(80,120,180,.08)", border: "rgba(80,120,180,.20)", text: "#2A4A80" },
      neutral: { bg: "rgba(120,110,100,.08)",border: "rgba(120,110,100,.18)",text: "#5A5048" }
    };

    const items = alerts.map(alert => {
      const c = colorMap[alert.type] || colorMap.neutral;
      return `
        <div class="alert-item" style="
          padding: 13px 16px;
          border-radius: 12px;
          border: 1px solid ${c.border};
          background: ${c.bg};
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 10px;
          align-items: start;
        ">
          <span style="font-size: 1.15rem; line-height: 1.4;">${alert.icon}</span>
          <div style="display:grid; gap:3px;">
            <strong style="
              font-size: .92rem;
              font-weight: 700;
              color: ${c.text};
              line-height: 1.3;
              letter-spacing: -.01em;
            ">${alert.title}</strong>
            <span style="
              font-size: .80rem;
              color: var(--muted);
              line-height: 1.4;
            ">${alert.detail}</span>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section style="display:grid; gap:10px;">
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        ">
          <span style="
            font-size: .72rem;
            font-weight: 700;
            letter-spacing: .12em;
            text-transform: uppercase;
            color: var(--muted);
          ">Alertas e insights</span>
          <span style="
            background: var(--accent);
            color: #fff;
            font-size: .68rem;
            font-weight: 700;
            border-radius: 999px;
            padding: 1px 7px;
            line-height: 1.6;
          ">${alerts.length}</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${items}
        </div>
      </section>
    `;
  }

  global.AppAlertsPanel = { renderAlertsPanel, buildAlerts };

})(window);
