(function(global){
  function renderInvoiceCard(invoice, deps){
    const totals = deps.invoiceTotals(invoice);
    const client = deps.getClient(invoice.clientId);
    const paymentStatus = deps.invoicePaymentStatus(invoice);
    const overdue = deps.invoiceIsOverdue(invoice);
    const paymentLabel = paymentStatus === "paid"
      ? "Pagada"
      : paymentStatus === "partial"
        ? "Pago parcial"
        : "Pendiente";
    const paymentClass = paymentStatus === "paid" ? "good" : paymentStatus === "partial" ? "" : "warn";
    return `<article class="card card-tight invoice-card-strong">
      <div class="invoice-card-top">
        <div class="invoice-copy">
          <p class="invoice-card-number">${deps.esc(invoice.number)}</p>
          <h3 class="list-row-title">${deps.esc(client?.name || "Cliente sin asignar")}</h3>
        </div>
        <div class="price">${deps.money(totals.total)}</div>
      </div>
      <p class="invoice-card-dates">Emisión: ${deps.date(invoice.issueDate)}${invoice.dueDate ? ` · Vencimiento: ${deps.date(invoice.dueDate)}` : ""}</p>
      <div class="inline-summary invoice-meta-row">
        <button class="chip payment-chip ${paymentClass}" data-action="update-invoice-payment" data-id="${invoice.id}">
          ${deps.esc(paymentLabel)}
        </button>
        ${overdue ? '<span class="chip danger">Vencida</span>' : ""}
        <span class="chip">Cobrado: ${deps.money(totals.paid)}</span>
        <span class="chip ${totals.pending > 0.009 ? "warn" : "good"}">Pendiente: ${deps.money(totals.pending)}</span>
      </div>
      <div class="card-actions">
        <button data-action="preview-invoice" data-id="${invoice.id}">Ver</button>
        <button data-action="edit-invoice" data-id="${invoice.id}">Editar</button>
        <button data-action="download-invoice-pdf" data-id="${invoice.id}">PDF</button>
        <button data-action="print-invoice" data-id="${invoice.id}">Imprimir</button>
        <button data-action="upload-invoice-drive" data-id="${invoice.id}">Drive</button>
        <button data-action="share-whatsapp" data-id="${invoice.id}">WhatsApp</button>
        <button data-action="share-email" data-id="${invoice.id}">Email</button>
        <button class="danger" data-action="delete-invoice" data-id="${invoice.id}">Eliminar</button>
      </div>
    </article>`;
  }

  global.AppUICardInvoice = { renderInvoiceCard };
})(window);
