(function(global){
  function invoiceSequence(invoice){
    const value = String(invoice?.number || "").trim();
    const numericMatch = value.match(/(\d+)(?!.*\d)/);
    const yearMatch = value.match(/(?:\/|-)(20\d{2})\b/) || value.match(/\b(20\d{2})\b/);
    return {
      year:yearMatch ? Number(yearMatch[1]) : 0,
      number:numericMatch ? Number(numericMatch[1]) : 0,
      raw:value
    };
  }

  function compareInvoicesByNumberDesc(a, b){
    const left = invoiceSequence(a);
    const right = invoiceSequence(b);
    if(right.year !== left.year) return right.year - left.year;
    if(right.number !== left.number) return right.number - left.number;
    return String(b.issueDate || "").localeCompare(String(a.issueDate || ""));
  }

  function renderBillingView(ctx){
    const query = String(ctx.ui.search.invoicesQuery || "").trim().toLowerCase();
    const statusFilter = ctx.ui.search.invoicesStatus || "";
    const hasActiveFilters = !!(query || ctx.ui.search.invoicesClient || ctx.ui.search.invoicesMonth || statusFilter);
    const invoiceList = ctx.state.invoices
      .filter(x => !ctx.ui.search.invoicesClient || x.clientId === ctx.ui.search.invoicesClient)
      .filter(x => !ctx.ui.search.invoicesMonth || ctx.monthKey(x.issueDate) === ctx.ui.search.invoicesMonth)
      .filter(x => {
        if(!query) return true;
        const clientName = String(ctx.getClient(x.clientId)?.name || "").toLowerCase();
        return clientName.includes(query);
      })
      .filter(x => {
        if(!statusFilter) return true;
        const status = ctx.invoicePaymentStatus(x);
        const overdue = ctx.invoiceIsOverdue(x);
        if(statusFilter === "paid") return status === "paid";
        if(statusFilter === "pending") return status === "pending";
        if(statusFilter === "partial") return status === "partial";
        if(statusFilter === "overdue") return overdue;
        return true;
      })
      .sort(compareInvoicesByNumberDesc);
    const grouped = ctx.groupInvoices(invoiceList);
    const months = [...new Set(ctx.state.invoices.map(x => ctx.monthKey(x.issueDate)).filter(Boolean))];
    const filterItems = [
      { id:"", label:"Todas" },
      { id:"paid", label:"Pagadas" },
      { id:"pending", label:"Pendientes" },
      { id:"partial", label:"Parciales" },
      { id:"overdue", label:"Vencidas" }
    ];
    const activeFilterLabel = hasActiveFilters ? `${invoiceList.length} resultado(s) filtrado(s)` : "Sin filtros activos";

    return `<div class="panel billing-panel-compact">
      <div class="panel-h billing-panel-head">
        <div>
          <h2>Facturas</h2>
          <div class="sub">Ordenadas por número de factura, de mayor a menor</div>
        </div>
        <div class="actions"><button class="primary" data-action="new-invoice">Nueva factura</button></div>
      </div>
      <div class="panel-b billing-panel-body">
        <details class="invoice-filter-drawer" ${hasActiveFilters ? "open" : ""}>
          <summary>
            <div>
              <strong>Filtros</strong>
              <span>${ctx.esc(activeFilterLabel)}</span>
            </div>
            <span class="chip">Abrir</span>
          </summary>
          <div class="search-shell invoice-filter-content">
            <div class="search-row">
              <input placeholder="Buscar por cliente" value="${ctx.esc(ctx.ui.search.invoicesQuery || "")}" data-search="invoicesQuery">
              <select data-search="invoicesClient"><option value="">Todos los clientes</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${ctx.ui.search.invoicesClient === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select>
              <select data-search="invoicesMonth"><option value="">Todos los meses</option>${months.map(m => `<option value="${m}" ${ctx.ui.search.invoicesMonth === m ? "selected" : ""}>${m}</option>`).join("")}</select>
            </div>
            <div class="filter-chip-row">
              ${filterItems.map(item => `<button type="button" class="filter-chip ${statusFilter === item.id ? "active" : ""}" data-invoice-status="${item.id}">${item.label}</button>`).join("")}
            </div>
          </div>
        </details>
        ${grouped.length ? grouped.map(g => `<section class="entity-stack month-stack"><article class="dashboard-block month-header"><div class="list-row-top"><div><h3 class="list-row-title">${ctx.esc(g.label)}</h3><p class="list-row-sub">${g.items.length} factura(s) emitida(s)</p></div><span class="chip good">${ctx.money(g.total)}</span></div></article><div class="entity-stack">${g.items.map(ctx.invoiceCard).join("")}</div></section>`).join("") : '<div class="empty"><p>No hay facturas para los filtros actuales.</p></div>'}
      </div>
    </div>`;
  }

  global.AppUIViewBilling = { renderBillingView };
})(window);
