(function(global){
  function renderDocumentCard(item, deps){
    const image = item.images?.[0];
    return `<article class="card card-tight">
      <div class="doc-cover">
        ${image ? `<img src="${image.dataUrl}" alt="${deps.esc(item.title || "Documento")}">` : `<div class="placeholder">Sin foto</div>`}
        <div>
          <div class="list-row-top">
            <div>
              <h3 class="list-row-title">${deps.esc(item.title || deps.documentTypeLabel(item.type))}</h3>
              <p class="list-row-sub">${deps.date(item.date)} \u00b7 ${deps.esc(deps.documentTypeLabel(item.type))}</p>
            </div>
            <span class="chip">${(item.images || []).length} foto(s)</span>
          </div>
          <div class="inline-summary">
            ${item.supplierId ? `<span class="chip">Proveedor: ${deps.esc(deps.getSupplier(item.supplierId)?.name || "-")}</span>` : ""}
            ${item.relatedType && item.relatedId ? `<span class="chip">Vinculado: ${deps.esc(deps.relatedLabel(item.relatedType, item.relatedId))}</span>` : `<span class="chip">Sin vincular</span>`}
            ${item.ocrText ? `<span class="chip good">OCR listo</span>` : ""}
            ${item.notes ? `<span class="chip">${deps.esc(item.notes)}</span>` : ""}
          </div>
          <div class="card-actions">
            <button data-action="view-document" data-id="${item.id}">Ver</button>
            <button data-action="edit-document" data-id="${item.id}">Editar</button>
            <button class="danger" data-action="delete-document" data-id="${item.id}">Eliminar</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  global.AppUICardDocument = { renderDocumentCard };
})(window);
