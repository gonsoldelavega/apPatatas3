(function(global){
  function renderScannerWorkspaceView(ctx){
    const documentCount = ctx.state.documents.length;
    const latestDocuments = ctx.state.documents
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 3);

    return `<div class="view-stack workspace-stack">
      <section class="workspace-hero scanner-hero">
        <div class="workspace-hero-copy">
          <span class="eyebrow">Escaner</span>
          <h2>Escanea facturas y tickets con una entrada propia y mas clara.</h2>
          <p>El flujo queda separado del resto para que capturar, corregir, leer OCR y guardar documentos sea mas natural desde movil.</p>
        </div>
        <div class="workspace-hero-side">
          <div class="hero-stat">
            <span>Documentos guardados</span>
            <strong>${documentCount}</strong>
          </div>
          <div class="hero-stat">
            <span>Ultimo movimiento</span>
            <strong>${ctx.esc(latestDocuments[0]?.title || "Sin registros")}</strong>
          </div>
        </div>
      </section>

      <section class="dashboard-block soft-block">
        <div class="section-title">
          <div>
            <h3>Entradas rapidas</h3>
            <p>Elige el tipo de captura y deja el documento listo para trabajar.</p>
          </div>
        </div>
        <div class="scanner-entry-grid">
          <button class="scanner-entry primary" data-action="new-scanned-supplier-invoice">
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

      <section class="ops-grid">
        <article class="dashboard-block soft-block">
          <div class="section-title">
            <div>
              <h3>Capacidades</h3>
              <p>El escaner ya esta preparado para un trabajo documental serio.</p>
            </div>
          </div>
          <div class="feature-list">
            <div class="feature-row"><strong>Deteccion de bordes</strong><span>Encuadra el papel antes del recorte final.</span></div>
            <div class="feature-row"><strong>Correccion de perspectiva</strong><span>Mejora la legibilidad de facturas fotografiadas desde angulo.</span></div>
            <div class="feature-row"><strong>OCR</strong><span>Lee texto para ayudarte a identificar importe, fecha y proveedor.</span></div>
            <div class="feature-row"><strong>PDF</strong><span>Genera una copia lista para archivo, Drive o envio.</span></div>
          </div>
        </article>

        <article class="dashboard-block soft-block">
          <div class="section-title">
            <div>
              <h3>Ultimos documentos</h3>
              <p>Acceso directo a lo que acabas de capturar o subir.</p>
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
        </article>
      </section>
    </div>`;
  }

  global.AppUIViewScannerWorkspace = { renderScannerWorkspaceView };
})(window);
