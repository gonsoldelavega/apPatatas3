(function(global){
  function renderScannerWorkspaceView(ctx){
    const documentCount = ctx.state.documents.length;
    const latestDocuments = ctx.state.documents
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 3);

    return `<div class="view-stack workspace-stack">
      <section class="dashboard-block soft-block">
        <div class="section-title">
          <div>
            <h3>ESCANEAR CON IA</h3>
            <p>Empieza por aqui para capturar o importar el documento.</p>
          </div>
        </div>
        <div class="scanner-entry-grid">
          <button class="scanner-entry primary" data-action="new-scanned-supplier-invoice" style="grid-column:1/-1;">
            <span>Factura proveedor</span>
            <strong>Escanear y guardar documento de compra</strong>
          </button>
          <button class="scanner-entry" data-action="new-scanned-ticket">
            <span>Ticket o gasto</span>
            <strong>Captura para justificar gastos rapidamente</strong>
          </button>
          <button class="scanner-entry" data-action="open-scanner-pdf">
            <span>Escaneo libre</span>
            <strong>Generar PDF multipagina y revisar despues</strong>
          </button>
          <button class="scanner-entry" data-action="new-document">
            <span>Subir imagen</span>
            <strong>Usar fotos ya hechas desde galeria</strong>
          </button>
        </div>
      </section>

      <section class="dashboard-block soft-block">
        <div class="section-title">
          <div>
            <h3>ULTIMOS DOCUMENTOS</h3>
            <p>${documentCount} guardado(s). Acceso rapido a lo ultimo capturado o subido.</p>
          </div>
        </div>
        ${latestDocuments.length ? `
          <div class="dashboard-list">
            ${latestDocuments.map(item => `
              <article class="list-row list-row-interactive" data-action="view-document" data-id="${item.id}">
                <div class="list-row-top">
                  <div>
                    <h3 class="list-row-title">${ctx.esc(item.title || "Documento")}</h3>
                    <p class="list-row-sub">${ctx.esc(ctx.documentTypeLabel(item.type))} · ${ctx.date(item.date)}</p>
                  </div>
                  <span class="chip">${ctx.esc(ctx.getSupplier(item.supplierId)?.name || "Sin proveedor")}</span>
                </div>
              </article>
            `).join("")}
          </div>
        ` : '<div class="empty"><p>Todavia no hay documentos escaneados.</p></div>'}
      </section>
    </div>`;
  }

  global.AppUIViewScannerWorkspace = { renderScannerWorkspaceView };
})(window);
