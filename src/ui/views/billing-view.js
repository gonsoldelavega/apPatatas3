(function(global){
  function renderBillingView(ctx){
    const query = String(ctx.ui.search.invoicesQuery || "").trim().toLowerCase();
    const statusFilter = ctx.ui.search.invoicesStatus || "";
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
      .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));
    const grouped = ctx.groupInvoices(invoiceList);
    const months = [...new Set(ctx.state.invoices.map(x => ctx.monthKey(x.issueDate)).filter(Boolean))];
    const filterItems = [
      { id:"", label:"Todas" },
      { id:"paid", label:"Pagadas" },
      { id:"pending", label:"Pendientes" },
      { id:"partial", label:"Parciales" },
      { id:"overdue", label:"Vencidas" }
    ];

    return `<div class="panel">
      <div class="panel-h">
        <div>
          <h2>Facturas</h2>
          <div class="sub">Control mensual de cobro, cliente y vencimientos</div>
        </div>
        <div class="actions"><button class="primary" data-action="new-invoice">Nueva factura</button></div>
      </div>
      <div class="panel-b">
        <div class="search-shell">
          <div class="search-row">
            <input placeholder="Buscar por cliente" value="${ctx.esc(ctx.ui.search.invoicesQuery || "")}" data-search="invoicesQuery">
            <select data-search="invoicesClient"><option value="">Todos los clientes</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${ctx.ui.search.invoicesClient === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select>
            <select data-search="invoicesMonth"><option value="">Todos los meses</option>${months.map(m => `<option value="${m}" ${ctx.ui.search.invoicesMonth === m ? "selected" : ""}>${m}</option>`).join("")}</select>
          </div>
          <div class="filter-chip-row">
            ${filterItems.map(item => `<button type="button" class="filter-chip ${statusFilter === item.id ? "active" : ""}" data-invoice-status="${item.id}">${item.label}</button>`).join("")}
          </div>
        </div>
        ${grouped.length ? grouped.map(g => `<section class="entity-stack month-stack"><article class="dashboard-block month-header"><div class="list-row-top"><div><h3 class="list-row-title">${ctx.esc(g.label)}</h3><p class="list-row-sub">${g.items.length} factura(s) emitida(s)</p></div><span class="chip good">${ctx.money(g.total)}</span></div></article><div class="entity-stack">${g.items.map(ctx.invoiceCard).join("")}</div></section>`).join("") : '<div class="empty"><p>No hay facturas para los filtros actuales.</p></div>'}
      </div>
    </div>`;
  }

  global.AppUIViewBilling = { renderBillingView };
})(window);
