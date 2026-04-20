(function(global){
  function renderPurchaseCard(item, ctx){
    const hasAttachment = !!item.attachment?.dataUrl;
    const base = Number.isFinite(Number(item.baseAmount)) ? ctx.n(item.baseAmount) : ctx.n(item.quantity) * ctx.n(item.unitCost);
    const taxAmount = Number.isFinite(Number(item.ivaAmount)) ? ctx.n(item.ivaAmount) : base * (ctx.n(item.iva) / 100);
    const total = Number.isFinite(Number(item.totalAmount)) ? ctx.n(item.totalAmount) : Number.isFinite(Number(item.amount)) ? ctx.n(item.amount) : ctx.purchaseTotal(item);
    const title = ctx.getProduct(item.productId)?.name || item.attachment?.name || "Compra manual";
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${ctx.esc(title)}</h3>
          <p class="list-row-sub">${ctx.esc(ctx.getSupplier(item.supplierId)?.name || "Proveedor")} \u00b7 ${ctx.date(item.date)}</p>
        </div>
        <div class="price">${ctx.money(total)}</div>
      </div>
      <div class="inline-summary">
        ${item.productId ? `<span class="chip">Cantidad: ${ctx.n(item.quantity)}</span>` : `<span class="chip">Compra manual</span>`}
        <span class="chip">Base: ${ctx.money(base)}</span>
        <span class="chip">IVA: ${ctx.money(taxAmount)}</span>
        ${hasAttachment ? `<span class="chip good">Adjunto listo</span>` : ""}
      </div>
      <div class="card-actions">
        ${hasAttachment ? `<button data-action="open-purchase-attachment" data-id="${item.id}">Ver adjunto</button>` : ""}
        <button data-action="edit-purchase" data-id="${item.id}">Editar</button>
        <button class="danger" data-action="delete-purchase" data-id="${item.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderExpenseCard(item, ctx){
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${ctx.esc(item.concept || item.category || "Gasto")}</h3>
          <p class="list-row-sub">${ctx.esc(item.category || "Sin categor\u00eda")} \u00b7 ${ctx.date(item.date)}</p>
        </div>
        <div class="price">${ctx.money(ctx.expenseTotal(item))}</div>
      </div>
      <div class="inline-summary">
        <span class="chip">Proveedor: ${ctx.esc(ctx.getSupplier(item.supplierId)?.name || "-")}</span>
        <span class="chip">Base: ${ctx.money(item.base)}</span>
        <span class="chip">IVA: ${ctx.n(item.iva)}%</span>
      </div>
      <div class="card-actions">
        <button data-action="edit-expense" data-id="${item.id}">Editar</button>
        <button class="danger" data-action="delete-expense" data-id="${item.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderDeliveryCard(item, ctx){
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${ctx.esc(item.number)}</h3>
          <p class="list-row-sub">${ctx.esc(ctx.getClient(item.clientId)?.name || "Cliente")} \u00b7 ${ctx.date(item.date)}</p>
        </div>
        <span class="chip ${item.status === "firmado" ? "good" : item.status === "pendiente" ? "warn" : ""}">${ctx.esc(item.status)}</span>
      </div>
      <div class="inline-summary">
        <span class="chip">${(item.lines || []).length} l\u00edneas</span>
        ${item.notes ? `<span class="chip">${ctx.esc(item.notes)}</span>` : ""}
      </div>
      <div class="card-actions">
        <button data-action="print-delivery-note" data-id="${item.id}">Imprimir</button>
        <button data-action="edit-delivery-note" data-id="${item.id}">Editar</button>
        <button class="danger" data-action="delete-delivery-note" data-id="${item.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderOperationsView(ctx){
    const purchases = ctx.state.purchases.filter(x => !ctx.ui.search.purchasesSupplier || x.supplierId === ctx.ui.search.purchasesSupplier).sort((a,b) => (b.date || "").localeCompare(a.date || ""));
    const expenses = ctx.state.expenses.filter(x => !ctx.ui.search.expensesCategory || x.category === ctx.ui.search.expensesCategory).sort((a,b) => (b.date || "").localeCompare(a.date || ""));
    const notes = ctx.state.deliveryNotes.filter(x => !ctx.ui.search.deliveryNotesClient || x.clientId === ctx.ui.search.deliveryNotesClient).sort((a,b) => (b.date || "").localeCompare(a.date || ""));
    const documents = ctx.state.documents.filter(x => {
      const text = [x.title, x.notes, ctx.documentTypeLabel(x.type), ctx.getSupplier(x.supplierId)?.name, ctx.relatedLabel(x.relatedType, x.relatedId)].join(" ").toLowerCase();
      return text.includes(ctx.ui.search.documents.toLowerCase()) && (!ctx.ui.search.documentsType || x.type === ctx.ui.search.documentsType);
    }).sort((a,b) => (b.date || "").localeCompare(a.date || ""));
    return `<div class="cards">
      <div class="panel" id="operations-purchases">
        <div class="panel-h">
          <div><h2>Compras</h2><div class="sub">Entrada de mercanc\u00eda y subida de stock</div></div>
          <div class="actions"><button class="primary" data-action="new-purchase">Nueva compra</button></div>
        </div>
        <div class="panel-b">
          <div class="search-shell"><div class="search-row"><select data-search="purchasesSupplier"><option value="">Todos los proveedores</option>${ctx.state.suppliers.map(s => `<option value="${s.id}" ${ctx.ui.search.purchasesSupplier === s.id ? "selected" : ""}>${ctx.esc(s.name)}</option>`).join("")}</select></div></div>
          <div class="entity-stack">${purchases.length ? purchases.map(item => renderPurchaseCard(item, ctx)).join("") : '<div class="empty"><p>No hay compras registradas.</p></div>'}</div>
        </div>
      </div>
      <div class="panel" id="operations-expenses">
        <div class="panel-h">
          <div><h2>Gastos</h2><div class="sub">Registro interno y justificantes</div></div>
          <div class="actions"><button class="primary" data-action="new-expense">Nuevo gasto</button></div>
        </div>
        <div class="panel-b">
          <div class="search-shell"><div class="search-row"><select data-search="expensesCategory"><option value="">Todas las categor\u00edas</option>${["gasolina","agua","luz","bolsas","gestoria","autonomo","mantenimiento"].map(c => `<option value="${c}" ${ctx.ui.search.expensesCategory === c ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
          <div class="entity-stack">${expenses.length ? expenses.map(item => renderExpenseCard(item, ctx)).join("") : '<div class="empty"><p>No hay gastos registrados.</p></div>'}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h">
          <div><h2>Albaranes</h2><div class="sub">Entregas sin precios, listas para imprimir</div></div>
          <div class="actions"><button class="primary" data-action="new-delivery-note">Nuevo albar\u00e1n</button></div>
        </div>
        <div class="panel-b">
          <div class="search-shell"><div class="search-row"><select data-search="deliveryNotesClient"><option value="">Todos los clientes</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${ctx.ui.search.deliveryNotesClient === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div></div>
          <div class="entity-stack">${notes.length ? notes.map(item => renderDeliveryCard(item, ctx)).join("") : '<div class="empty"><p>No hay albaranes todav\u00eda.</p></div>'}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h">
          <div><h2>Documentos</h2><div class="sub">Tickets, facturas proveedor y justificantes registrados manualmente</div></div>
          <div class="actions"><button class="primary" data-action="new-document">Nuevo documento</button></div>
        </div>
        <div class="panel-b">
          <div class="search-shell"><div class="search-row"><input placeholder="Buscar documento, proveedor o nota" value="${ctx.esc(ctx.ui.search.documents)}" data-search="documents"><select data-search="documentsType"><option value="">Todos los tipos</option>${[{id:"ticket",name:"Ticket"},{id:"supplierInvoice",name:"Factura proveedor"},{id:"deliveryProof",name:"Albar\u00e1n proveedor"},{id:"receipt",name:"Justificante"},{id:"other",name:"Otro"}].map(t => `<option value="${t.id}" ${ctx.ui.search.documentsType === t.id ? "selected" : ""}>${t.name}</option>`).join("")}</select></div></div>
          <div class="entity-stack">${documents.length ? documents.map(item => global.AppUICardDocument.renderDocumentCard(item, ctx)).join("") : '<div class="empty"><p>No hay documentos registrados todav\u00eda.</p></div>'}</div>
        </div>
      </div>
    </div>`;
  }

  global.AppUIViewOperations = { renderOperationsView };
})(window);
