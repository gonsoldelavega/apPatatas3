(function(global){
  function pageThumb(page, active){
    const filter = page.selectedFilter || "document";
    const src = page.variants?.[filter] || page.variants?.document || page.source || "";
    const modeLabel = filter === "document" ? "Documento" : filter === "grayscale" ? "Grises" : "Color";
    return `<button class="scanner-thumb ${active ? "active" : ""}" data-page-id="${page.id}">
      <img src="${src}" alt="Página escaneada">
      <span>${modeLabel}</span>
    </button>`;
  }

  function filterButton(filter, label, active){
    return `<button type="button" class="scanner-filter-btn ${active ? "active" : ""}" data-filter="${filter}">${label}</button>`;
  }

  function renderScannerPreview(state){
    const activePage = state.pages.find(page => page.id === state.activePageId) || state.pages[0];
    const activeFilter = activePage?.selectedFilter || state.options.selectedFilter || "document";
    const previewSrc = activePage ? (activePage.variants?.[activeFilter] || activePage.variants?.document || activePage.source) : "";
    return `<section class="scanner-screen">
      <div class="scanner-preview">
        <div class="scanner-editor-top">
          <div>
            <h2>Revisar escaneo</h2>
            <p>Comprueba el resultado, elige el filtro más legible y confirma la imagen cuando esté lista.</p>
          </div>
          <div class="scanner-top-actions">
            <span class="chip">${state.pages.length} pág.</span>
            <button type="button" class="ghost" data-scanner-action="close-preview">Salir</button>
          </div>
        </div>

        <div class="scanner-preview-main">
          <div class="scanner-preview-primary">
            <div class="scanner-preview-canvas-wrap">
              ${previewSrc ? `<img src="${previewSrc}" class="scanner-preview-image" alt="Documento procesado">` : `<div class="empty"><p>No hay páginas todavía.</p></div>`}
            </div>

            <div class="scanner-filter-panel">
              <div class="scanner-filter-copy">
                <strong>Filtro</strong>
                <span>Documento para máxima legibilidad, color para conservar tonos y grises para revisión neutra.</span>
              </div>
              <div class="scanner-filter-group">
                ${filterButton("document", "Documento", activeFilter === "document")}
                ${filterButton("grayscale", "Grises", activeFilter === "grayscale")}
                ${filterButton("color", "Color", activeFilter === "color")}
              </div>
            </div>
          </div>

          <div class="scanner-preview-sidebar">
            <div class="scanner-thumb-list">
              ${state.pages.map(page => pageThumb(page, page.id === activePage?.id)).join("")}
            </div>

            <div class="scanner-page-actions">
              <button type="button" class="ghost" data-scanner-action="add-page">Añadir página</button>
              <button type="button" class="ghost" data-scanner-action="page-up">Subir</button>
              <button type="button" class="ghost" data-scanner-action="page-down">Bajar</button>
              <button type="button" class="ghost" data-scanner-action="remove-page">Eliminar</button>
            </div>

            <div class="scanner-page-actions">
              <button type="button" class="ghost" data-scanner-action="ocr-page">OCR</button>
              <button type="button" class="ghost" data-scanner-action="export-pdf">PDF</button>
            </div>

            ${activePage?.ocr ? `<div class="summary"><div class="summary-row"><span>Confianza OCR</span><strong>${Math.round(activePage.ocr.confidence || 0)}%</strong></div><div class="hint">${(activePage.ocr.text || "").slice(0, 240) || "Sin texto"}</div></div>` : ""}
          </div>
        </div>

        <div class="scanner-preview-footer">
          <div class="scanner-preview-footer-inner">
            <button type="button" class="primary scanner-primary-action" data-scanner-action="use-scan">Usar imagen</button>
            <button type="button" class="ghost" data-scanner-action="retake-page">Repetir foto</button>
            <button type="button" class="ghost" data-scanner-action="edit-corners">Editar bordes</button>
            <button type="button" class="ghost" data-scanner-action="close-preview">Cerrar</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  function mountScannerPreview(root, deps){
    root.querySelectorAll("[data-page-id]").forEach(button => button.addEventListener("click", () => deps.onSelectPage(button.dataset.pageId)));
    root.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => deps.onFilter(button.dataset.filter)));
    root.querySelectorAll('[data-scanner-action="close-preview"]').forEach(button => button.addEventListener("click", () => deps.onClose()));
    root.querySelector('[data-scanner-action="add-page"]').addEventListener("click", () => deps.onAddPage());
    root.querySelector('[data-scanner-action="use-scan"]').addEventListener("click", () => deps.onUseScan());
    root.querySelector('[data-scanner-action="remove-page"]').addEventListener("click", () => deps.onRemovePage());
    root.querySelector('[data-scanner-action="page-up"]').addEventListener("click", () => deps.onReorder(-1));
    root.querySelector('[data-scanner-action="page-down"]').addEventListener("click", () => deps.onReorder(1));
    root.querySelector('[data-scanner-action="edit-corners"]').addEventListener("click", () => deps.onEditCorners());
    root.querySelector('[data-scanner-action="retake-page"]').addEventListener("click", () => deps.onRetakePage());
    root.querySelector('[data-scanner-action="ocr-page"]').addEventListener("click", () => deps.onRunOcr());
    root.querySelector('[data-scanner-action="export-pdf"]').addEventListener("click", () => deps.onExportPdf());
    return {
      teardown(){ /* no-op */ }
    };
  }

  global.AppUIScannerPreview = {
    renderScannerPreview,
    mountScannerPreview
  };
})(window);
