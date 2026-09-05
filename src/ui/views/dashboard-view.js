(function(global){
  function invoiceSequence(value){
    const match = String(value || "").match(/(\d+)(?=\/)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function plural(count, singular, pluralForm){
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  function bindMonthNavigator(){
    if(global.__factupapaDashboardMonthNavigatorBound) return;
    global.__factupapaDashboardMonthNavigatorBound = true;
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-dashboard-month-step]");
      if(!button) return;
      const navigator = button.closest(".month-navigator");
      const select = navigator?.querySelector('[data-search="dashboardMonth"]');
      if(!select || select.disabled) return;
      const step = Number(button.dataset.dashboardMonthStep || 0);
      const nextIndex = select.selectedIndex + step;
      if(!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= select.options.length) return;
      select.selectedIndex = nextIndex;
      select.dispatchEvent(new Event("change", { bubbles:true }));
    });
  }

  bindMonthNavigator();

  function renderDashboardView(ctx){
    const availableMonths = Array.from(new Set([
      ...ctx.state.invoices.map(x => ctx.monthKey(x.issueDate)),
      ...ctx.state.expenses.map(x => ctx.monthKey(x.date)),
      ...ctx.state.purchases.map(x => ctx.monthKey(x.date))
    ].filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a)));
    const fallbackMonth = availableMonths[0] || ctx.today().slice(0, 7);
    const requestedMonth = ctx.ui.search.dashboardMonth || fallbackMonth;
    const month = availableMonths.includes(requestedMonth) ? requestedMonth : fallbackMonth;
    const monthOptions = availableMonths.length ? availableMonths : [month];
    const monthIndex = monthOptions.indexOf(month);

    const invoicesMonth = ctx.state.invoices
      .filter(x => ctx.monthKey(x.issueDate) === month)
      .slice()
      .sort((a, b) => {
        const seqA = invoiceSequence(a.number);
        const seqB = invoiceSequence(b.number);
        if(seqB !== seqA) return seqB - seqA;
        return (b.issueDate || "").localeCompare(a.issueDate || "");
      });

    const monthRevenue = invoicesMonth.reduce((sum, invoice) => sum + ctx.invoiceTotals(invoice).total, 0);
    const monthExpenses = ctx.state.expenses
      .filter(x => ctx.monthKey(x.date) === month)
      .reduce((sum, item) => sum + ctx.expenseTotal(item), 0);
    const monthPurchases = ctx.state.purchases
      .filter(x => ctx.monthKey(x.date) === month)
      .reduce((sum, item) => sum + ctx.purchaseTotal(item), 0);
    const monthBalance = monthRevenue - monthExpenses - monthPurchases;

    const alertsHtml = (typeof AppAlertsPanel !== "undefined")
      ? AppAlertsPanel.renderAlertsPanel(ctx.state, {
          n: ctx.n,
          money: ctx.money,
          date: ctx.date,
          today: ctx.today,
          invoiceTotals: ctx.invoiceTotals,
          invoiceIsOverdue: ctx.invoiceIsOverdue,
          expenseTotal: ctx.expenseTotal,
          purchaseTotal: ctx.purchaseTotal
        })
      : "";

    const featuredInvoices = invoicesMonth.slice(0, 5).map(invoice => {
      const totals = ctx.invoiceTotals(invoice);
      const paymentStatus = ctx.invoicePaymentStatus(invoice);
      const overdue = ctx.invoiceIsOverdue(invoice);
      return {
        invoice,
        totals,
        overdue,
        status: paymentStatus === "paid" ? "Pagada" : paymentStatus === "partial" ? "Pago parcial" : "Pendiente",
        tone: paymentStatus === "paid" ? "good" : paymentStatus === "partial" ? "" : "warn"
      };
    });

    return `<div class="view-stack dashboard-home">
      <section class="home-top-grid">
        <article class="hero-primary hero-primary-compact">
          <div class="month-navigator" aria-label="Navegar por meses">
            <button type="button" data-dashboard-month-step="1" aria-label="Mes anterior" ${monthIndex >= monthOptions.length - 1 ? "disabled" : ""}>‹</button>
            <div class="month-navigator-select">
              <select data-search="dashboardMonth" aria-label="Mes del balance">
                ${monthOptions.map(key => `<option value="${ctx.esc(key)}" ${key === month ? "selected" : ""}>${ctx.esc(ctx.formatMonthLabel(key))}</option>`).join("")}
              </select>
            </div>
            <button type="button" data-dashboard-month-step="-1" aria-label="Mes siguiente" ${monthIndex <= 0 ? "disabled" : ""}>›</button>
          </div>
          <h2>${ctx.money(monthBalance)}</h2>
          <p>BALANCE DE ${ctx.esc(String(ctx.formatMonthLabel(month) || month).toUpperCase())}</p>
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
            <div>
              <h3>BALANCE</h3>
              <p>${ctx.esc(ctx.formatMonthLabel(month))}</p>
            </div>
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

      ${alertsHtml ? `<section class="dashboard-block soft-block">${alertsHtml}</section>` : ""}

      <section class="dashboard-block soft-block invoices-month-block">
        <div class="section-title">
          <div>
            <h3>FACTURAS DEL MES</h3>
            <p>${plural(invoicesMonth.length, "factura", "facturas")} en ${ctx.esc(ctx.formatMonthLabel(month))}</p>
          </div>
          <button class="ghost" data-view="billing">VER TODAS</button>
        </div>
        ${featuredInvoices.length ? `
          <div class="dashboard-list">
            ${featuredInvoices.map(({ invoice, totals, status, tone, overdue }) => `
              <article class="list-row list-row-interactive invoice-list-card" data-dashboard-invoice="${invoice.id}">
                <div class="invoice-card-top">
                  <div class="invoice-copy">
                    <p class="invoice-card-number">${ctx.esc(invoice.number)}</p>
                    <h3 class="list-row-title">${ctx.esc(ctx.getClient(invoice.clientId)?.name || "Cliente sin asignar")}</h3>
                  </div>
                  <div class="price">${ctx.money(totals.total)}</div>
                </div>
                <p class="invoice-card-dates">EMISIÓN: ${ctx.date(invoice.issueDate)}${invoice.dueDate ? ` · VENCE: ${ctx.date(invoice.dueDate)}` : ""}</p>
                <div class="inline-summary invoice-meta-row">
                  <button class="chip payment-chip ${tone}" data-action="update-invoice-payment" data-id="${invoice.id}">${ctx.esc(status)}</button>
                  ${overdue ? '<span class="chip danger">Vencida</span>' : ""}
                  <span class="chip ${totals.pending > 0.009 ? "warn" : "good"}">PENDIENTE: ${ctx.money(totals.pending)}</span>
                </div>
                <div class="card-actions">
                  <button data-action="preview-invoice" data-id="${invoice.id}" aria-label="Ver factura ${ctx.esc(invoice.number)}">Ver</button>
                  <button data-action="edit-invoice" data-id="${invoice.id}">Editar</button>
                  <button data-action="download-invoice-pdf" data-id="${invoice.id}">PDF</button>
                  <button data-action="print-invoice" data-id="${invoice.id}">Imprimir</button>
                  <button data-action="share-whatsapp" data-id="${invoice.id}">WhatsApp</button>
                  <button data-action="share-email" data-id="${invoice.id}">Email</button>
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
