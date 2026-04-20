(function(global){
  function esc(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function rowValue(row, key){
    return row?.[key] ?? "";
  }

  function renderLineRow(line, index){
    return `<div class="scanner-result-line">
      <div class="field" style="grid-column:1/-1;"><label>Descripción línea ${index + 1}</label><input name="line-description-${index}" value="${esc(rowValue(line, "descripcion"))}"></div>
      <div class="field"><label>Cantidad</label><input name="line-cantidad-${index}" type="number" step="0.01" value="${esc(rowValue(line, "cantidad"))}"></div>
      <div class="field"><label>Precio unitario</label><input name="line-precio-${index}" type="number" step="0.01" value="${esc(rowValue(line, "precio_unitario"))}"></div>
      <div class="field"><label>Base</label><input name="line-base-${index}" type="number" step="0.01" value="${esc(rowValue(line, "base"))}"></div>
      <div class="field"><label>IVA %</label><input name="line-iva-${index}" type="number" step="0.01" value="${esc(rowValue(line, "iva_pct"))}"></div>
      <div class="field"><label>Total</label><input name="line-total-${index}" type="number" step="0.01" value="${esc(rowValue(line, "total"))}"></div>
    </div>`;
  }

  function renderScannerPreview(state, options = {}){
    const result = state.result || {};
    const extracted = result.extracted || {};
    const lines = Array.isArray(extracted.lineas) && extracted.lineas.length ? extracted.lineas : [{}];
    const saveLabel = options.mode === "purchase" ? "Guardar como compra" : "Usar imagen";
    return `<section class="scanner-screen">
      <div class="scanner-preview scanner-result-screen">
        <div class="scanner-editor-top">
          <div>
            <h2>Resultado del escaneo</h2>
            <p>Revisa los datos detectados por IA antes de guardarlos.</p>
          </div>
          <div class="scanner-top-actions">
            <button type="button" class="ghost" data-scanner-action="discard">Descartar</button>
          </div>
        </div>
        ${state.error ? `<div class="scanner-warning">${esc(state.error)}</div>` : ""}
        <div class="scanner-result-layout">
          <div class="scanner-result-image-wrap">
            ${result.processedDataUrl ? `<img src="${result.processedDataUrl}" class="scanner-preview-image" alt="Documento procesado">` : `<div class="empty"><p>No hay imagen procesada.</p></div>`}
          </div>
          <form id="scannerResultForm" class="sheet-grid scanner-result-form">
            <div class="field"><label>Número factura</label><input name="numero_factura" value="${esc(extracted.numero_factura)}"></div>
            <div class="field"><label>Fecha</label><input name="fecha" type="date" value="${esc(extracted.fecha)}"></div>
            <div class="field"><label>Proveedor</label><input name="proveedor_nombre" value="${esc(extracted.proveedor_nombre)}"></div>
            <div class="field"><label>NIF proveedor</label><input name="proveedor_nif" value="${esc(extracted.proveedor_nif)}"></div>
            <div class="field"><label>Cliente</label><input name="cliente_nombre" value="${esc(extracted.cliente_nombre)}"></div>
            <div class="field"><label>NIF cliente</label><input name="cliente_nif" value="${esc(extracted.cliente_nif)}"></div>
            <div class="field"><label>Base total</label><input name="base_total" type="number" step="0.01" value="${esc(extracted.base_total)}"></div>
            <div class="field"><label>IVA total</label><input name="iva_total" type="number" step="0.01" value="${esc(extracted.iva_total)}"></div>
            <div class="field"><label>Total factura</label><input name="total_factura" type="number" step="0.01" value="${esc(extracted.total_factura)}"></div>
            <div class="field" style="grid-column:1/-1;"><label>Líneas</label></div>
            <div class="scanner-result-lines" style="grid-column:1/-1;">
              ${lines.map((line, index) => renderLineRow(line, index)).join("")}
            </div>
          </form>
        </div>
        <div class="scanner-preview-footer">
          <div class="scanner-preview-footer-inner">
            <button type="button" class="ghost" data-scanner-action="retake">Repetir</button>
            <button type="button" class="primary scanner-primary-action" data-scanner-action="save">${saveLabel}</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  function mountScannerPreview(root, deps){
    const form = root.querySelector("#scannerResultForm");

    function readForm(){
      const formData = new FormData(form);
      const lineas = [];
      let index = 0;
      while(form.elements[`line-description-${index}`]){
        lineas.push({
          descripcion: String(formData.get(`line-description-${index}`) || ""),
          cantidad: Number(formData.get(`line-cantidad-${index}`) || 0),
          precio_unitario: Number(formData.get(`line-precio-${index}`) || 0),
          base: Number(formData.get(`line-base-${index}`) || 0),
          iva_pct: Number(formData.get(`line-iva-${index}`) || 0),
          total: Number(formData.get(`line-total-${index}`) || 0)
        });
        index += 1;
      }
      return {
        numero_factura: String(formData.get("numero_factura") || ""),
        fecha: String(formData.get("fecha") || ""),
        proveedor_nombre: String(formData.get("proveedor_nombre") || ""),
        proveedor_nif: String(formData.get("proveedor_nif") || ""),
        cliente_nombre: String(formData.get("cliente_nombre") || ""),
        cliente_nif: String(formData.get("cliente_nif") || ""),
        base_total: Number(formData.get("base_total") || 0),
        iva_total: Number(formData.get("iva_total") || 0),
        total_factura: Number(formData.get("total_factura") || 0),
        lineas
      };
    }

    root.querySelector('[data-scanner-action="discard"]').addEventListener("click", () => deps.onDiscard());
    root.querySelector('[data-scanner-action="retake"]').addEventListener("click", () => deps.onRetake());
    root.querySelector('[data-scanner-action="save"]').addEventListener("click", async () => {
      await deps.onSave(readForm());
    });

    return {
      teardown(){ /* no-op */ }
    };
  }

  global.AppUIScannerPreview = {
    renderScannerPreview,
    mountScannerPreview
  };
})(window);
