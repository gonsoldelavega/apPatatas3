(function(global){

  function renderScannerWorkspaceView(ctx){
    const latestDocuments = ctx.state.documents
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 4);

    return `<div class="view-stack workspace-stack">

      <!-- Acciones principales — lo primero que ve el usuario -->
      <section class="dashboard-block soft-block">
        <div class="section-title" style="margin-bottom:16px;">
          <h3>Escanear documento</h3>
        </div>
        <div class="scanner-entry-grid">
          <button class="scanner-entry primary" data-action="new-scanned-supplier-invoice" style="grid-column:1/-1;min-height:80px;">
            <strong style="font-size:1.05rem;">📄 Escanear con IA</strong>
            <span>Factura proveedor — lee el importe, fecha y proveedor automáticamente</span>
          </button>
          <button class="scanner-entry" data-action="new-scanned-ticket">
            <strong>🧾 Ticket / gasto</strong>
            <span>Captura rápida para justificar gastos</span>
          </button>
          <button class="scanner-entry" data-action="open-scanner-pdf">
            <strong>📑 PDF multipágina</strong>
            <span>Escaneo libre para archivar</span>
          </button>
          <button class="scanner-entry" data-action="new-document">
            <strong>🖼 Subir imagen</strong>
            <span>Usar foto ya hecha</span>
          </button>
        </div>
      </section>

      <!-- Últimos documentos -->
      <section class="dashboard-block soft-block">
        <div class="section-title">
          <h3>Últimos documentos</h3>
          <button class="ghost" style="min-height:34px;padding:0 12px;font-size:.82rem;" data-view="operations">Ver todos</button>
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
        ` : '<div class="empty"><p>Todavía no hay documentos escaneados.</p></div>'}
      </section>

    </div>`;
  }

  global.AppUIViewScannerWorkspace = { renderScannerWorkspaceView };
})(window);
