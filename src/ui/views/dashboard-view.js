(function(global){

  function invoiceSequence(value){
    const match = String(value || "").match(/(\d+)(?=\/)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function renderDashboardView(ctx){
    const month = ctx.today().slice(0, 7);

    /* ── Datos del mes actual ── */
    const invoicesMonth = ctx.state.invoices
      .filter(x => ctx.monthKey(x.issueDate) === month)
      .slice()
      .sort((a, b) => {
        const seqA = invoiceSequence(a.number);
        const seqB = invoiceSequence(b.number);
        if(seqB !== seqA) return seqB - seqA;
        return (b.issueDate || "").localeCompare(a.issueDate || "");
      });

    const monthRevenue   = invoicesMonth.reduce((s, i) => s + ctx.invoiceTotals(i).total, 0);
    const monthExpenses  = ctx.state.expenses
      .filter(x => ctx.monthKey(x.date) === month)
      .reduce((s, i) => s + ctx.expenseTotal(i), 0);
    const monthPurchases = ctx.state.purchases
      .filter(x => ctx.monthKey(x.date) === month)
      .reduce((s, i) => s + ctx.purchaseTotal(i), 0);
    const monthBalance   = monthRevenue - monthExpenses - monthPurchases;

    /* ── Alertas inteligentes ── */
    const alertsHtml = (typeof AppAlertsPanel !== "undefined")
      ? AppAlertsPanel.renderAlertsPanel(ctx.state, {
          n: ctx.n,
          money: ctx.money,
          date: ctx.date,
          today: ctx.today,
          invoiceTotals: ctx.invoiceTotals,
          invoiceIsOverdue: ctx.invoiceIsOverdue
        })
      : "";

    /* ── Facturas destacadas del mes (máx 5) ── */
    const featuredInvoices = invoicesMonth.slice(0, 5).map(invoice => {
      const totals        = ctx.invoiceTotals(invoice);
      const paymentStatus = ctx.invoicePaymentStatus(invoice);
      const overdue       = ctx.invoiceIsOverdue(invoice);
      return {
        invoice,
        totals,
        overdue,
        status: paymentStatus === "paid"    ? "Pagada"
               : paymentStatus === "partial" ? "Pago parcial"
               : "Pendiente",
        tone: paymentStatus === "paid"    ? "good"
            : paymentStatus === "partial" ? ""
            : "warn"
      };
    });

    return `<div class="view-stack dashboard-home">

      <!-- ── Hero principal ── -->
      <section class="home-top-grid">

        <article class="hero-primary hero-primary-compact">
          <h2>${ctx.money(monthBalance)}</h2>
          <p>BALANCE DEL MES</p>
          <button class="primary primary-xl" data-action="new-invoice">CREAR FACTURA</button>
          <div class="hero-inline-stats">
            <div class="hero-inline-stat">
              <span>FACTURADO</span>
              <strong>${ctx.money(monthRevenue)}</strong>
            </div>
            <div class="hero-inline-stat">
              <span>GASTOS</span>
              <strong>${ctx.money(monthExpenses + monthPurchases)}</strong>
            </div>
          </div>
        </article>

        <article class="dashboard-block soft-block balance-focus-card">
          <div class="section-title">
            <h3>BALANCE</h3>
          </div>
          <div class="balance-focus-grid">
            <div class="mini-stat">
              <span>INGRESOS</span>
              <strong>${ctx.money(monthRevenue)}</strong>
            </div>
            <div class="mini-stat">
              <span>COMPRAS</span>
              <strong>${ctx.money(monthPurchases)}</strong>
            </div>
            <div class="mini-stat">
              <span>GASTOS</span>
              <strong>${ctx.money(monthExpenses)}</strong>
            </div>
            <div class="mini-stat accent-stat">
              <span>BALANCE</span>
              <strong>${ctx.money(monthBalance)}</strong>
            </div>
          </div>
        </article>

      </section>

      <!-- ── Panel de alertas e insights ── -->
      ${alertsHtml ? `<section class="dashboard-block soft-block">${alertsHtml}</section>` : ""}

      <!-- ── Facturas del mes ── -->
      <section class="dashboard-block soft-block invoices-month-block">
        <div class="section-title">
          <div>
            <h3>FACTURAS DEL MES</h3>
            <p>${invoicesMonth.length} factura(s) en ${month}</p>
          </div>
          <button class="ghost" data-view="billing">VER TODAS</button>
        </div>
        ${featuredInvoices.length ? `
          <div class="dashboard-list">
            ${featuredInvoices.map(({ invoice, totals, status, tone, overdue }) => `
              <article
                class="list-row list-row-interactive invoice-list-card"
                data-dashboard-invoice="${invoice.id}"
                role="button"
                tabindex="0"
              >
                <div class="invoice-card-top">
                  <div class="invoice-copy">
                    <p class="invoice-card-number">${ctx.esc(invoice.number)}</p>
                    <h3 class="list-row-title">${ctx.esc(ctx.getClient(invoice.clientId)?.name || "Cliente sin asignar")}</h3>
                  </div>
                  <div class="price">${ctx.money(totals.total)}</div>
                </div>
                <p class="invoice-card-dates">EMISIÓN: ${ctx.date(invoice.issueDate)}${invoice.dueDate ? ` · VENCE: ${ctx.date(invoice.dueDate)}` : ""}</p>
                <div class="inline-summary invoice-meta-row">
                  <button
                    class="chip payment-chip ${tone}"
                    data-action="update-invoice-payment"
                    data-id="${invoice.id}"
                  >${ctx.esc(status)}</button>
                  ${overdue ? '<span class="chip danger">Vencida</span>' : ""}
                  <span class="chip ${totals.pending > 0.009 ? "warn" : "good"}">
                    PENDIENTE: ${ctx.money(totals.pending)}
                  </span>
                </div>
              </article>
            `).join("")}
          </div>
        ` : '<div class="empty"><p>No hay facturas emitidas este mes.</p></div>'}
      </section>

    </div>`;
  }

  global.AppUIViewDashboard = { renderDashboardView };
})(window);
