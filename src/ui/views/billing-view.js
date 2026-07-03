(function(global){
  function invoiceSequence(invoice){
    const value = String(invoice?.number || "").trim();
    // Formato esperado: PREFIJO-SEQ/AÑO (p.ej. FAC-111/2026). La secuencia es el
    // grupo de digitos justo antes de "/AÑO", no el ultimo numero (que es el año).
    const full = value.match(/(\d+)\s*\/\s*(20\d{2})\b/);
    if(full){
      return { year:Number(full[2]), number:Number(full[1]), raw:value };
    }
    const yearMatch = value.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : 0;
    const nums = (value.match(/\d+/g) || []).map(Number).filter(num => num !== year);
    return {
      year,
      number:nums.length ? nums[0] : 0,
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

  function renderDeliveryCard(item, ctx){
    const totals = ctx.invoiceTotals({ lines:item.lines || [], amountPaid:0 });
    const valued = (item.lines || []).some(line => Number(line.price) > 0);
    const statusClass = item.status === "firmado" ? "good" : item.status === "entregado" ? "good" : item.status === "pendiente" ? "warn" : "";
    return `<article class="card card-tight invoice-card-strong">
      <div class="invoice-card-top">
        <div class="invoice-copy">
          <p class="invoice-card-number">${ctx.esc(item.number)}</p>
          <h3 class="list-row-title">${ctx.esc(ctx.getClient(item.clientId)?.name || "Cliente sin asignar")}</h3>
        </div>
        ${valued ? `<div class="price">${ctx.money(totals.total)}</div>` : ""}
      </div>
      <p class="invoice-card-dates">Fecha: ${ctx.date(item.date)}</p>
      <div class="inline-summary invoice-meta-row">
        <span class="chip ${statusClass}">${ctx.esc(item.status || "Sin estado")}</span>
        <span class="chip">${(item.lines || []).length} línea(s)</span>
        ${item.notes ? `<span class="chip">${ctx.esc(item.notes)}</span>` : ""}
      </div>
      <div class="card-actions">
        <button data-action="preview-delivery-note" data-id="${item.id}">Ver</button>
        <button data-action="edit-delivery-note" data-id="${item.id}">Editar</button>
        <button data-action="download-delivery-pdf" data-id="${item.id}">PDF</button>
        <button data-action="print-delivery-note" data-id="${item.id}">Imprimir</button>
        <button data-action="share-delivery-whatsapp" data-id="${item.id}">WhatsApp</button>
        <button data-action="share-delivery-email" data-id="${item.id}">Email</button>
        <button class="danger" data-action="delete-delivery-note" data-id="${item.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderDeliveryTab(ctx){
    const notes = (ctx.state.deliveryNotes || [])
      .filter(x => !ctx.ui.search.deliveryNotesClient || x.clientId === ctx.ui.search.deliveryNotesClient)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return `
      <div class="search-shell"><div class="search-row"><select data-search="deliveryNotesClient"><option value="">Todos los clientes</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${ctx.ui.search.deliveryNotesClient === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div></div>
      <div class="entity-stack">${notes.length ? notes.map(item => renderDeliveryCard(item, ctx)).join("") : '<div class="empty"><p>No hay albaranes todavía. Crea el primero con "Nuevo albarán".</p></div>'}</div>`;
  }

  function renderBillingView(ctx){
    const tab = ctx.ui.search.billingTab === "deliveryNotes" ? "deliveryNotes" : "invoices";
    const tabsHtml = `<div class="filter-chip-row billing-tabs" style="margin-bottom:14px;">
      <button type="button" class="filter-chip ${tab === "invoices" ? "active" : ""}" data-billing-tab="invoices">Facturas</button>
      <button type="button" class="filter-chip ${tab === "deliveryNotes" ? "active" : ""}" data-billing-tab="deliveryNotes">Albaranes</button>
      <button type="button" class="filter-chip" disabled style="opacity:.5;" title="Próximamente">Presupuestos · pronto</button>
    </div>`;

    if(tab === "deliveryNotes"){
      return `<div class="panel billing-panel-compact">
        <div class="panel-h billing-panel-head">
          <div>
            <h2>Albaranes</h2>
            <div class="sub">Documentos de entrega, con o sin importes</div>
          </div>
          <div class="actions"><button class="primary" data-action="new-delivery-note">Nuevo albarán</button></div>
        </div>
        <div class="panel-b billing-panel-body">
          ${tabsHtml}
          ${renderDeliveryTab(ctx)}
        </div>
      </div>`;
    }

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
        ${tabsHtml}
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
