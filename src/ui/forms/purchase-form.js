(function(global){
  function openPurchaseForm(ctx, id){
    const source = id
      ? ctx.state.purchases.find(x => x.id === id)
      : { id:ctx.uid("buy"), date:ctx.today(), supplierId:"", notes:"", attachment:null, lines:[ctx.blankLine()] };
    const item = { ...source, attachment:source?.attachment || null };
    const derivedBase = ctx.n(item.quantity) * ctx.n(item.unitCost);
    const storedBase = Number.isFinite(Number(item.baseAmount)) ? ctx.n(item.baseAmount) : Number.isFinite(Number(item.base)) ? ctx.n(item.base) : derivedBase;
    const storedTax = Number.isFinite(Number(item.ivaAmount)) ? ctx.n(item.ivaAmount) : item.type === "invoice" ? ctx.n(item.iva) : derivedBase * (ctx.n(item.iva) / 100);
    const storedTotal = Number.isFinite(Number(item.totalAmount)) ? ctx.n(item.totalAmount) : Number.isFinite(Number(item.amount)) ? ctx.n(item.amount) : Number.isFinite(Number(item.total)) ? ctx.n(item.total) : ctx.purchaseTotal(item);
    const draft = {
      ...item,
      totalAmount: storedTotal ? String(Number(storedTotal.toFixed(2))) : "",
      taxAmount: storedTax ? String(Number(storedTax.toFixed(2))) : "",
      baseAmount: storedBase ? String(Number(storedBase.toFixed(2))) : ""
    };

    global.AppUIModal.openModal(
      id ? "Editar compra" : "Nueva compra",
      "Registra la compra manualmente o escanea la factura con IA para rellenar automaticamente",
      `<form id="purchaseForm" class="sheet-grid">
        <div class="field" style="grid-column:1/-1;">
          <button type="button" class="primary" id="scanInvoiceBtn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;">
            Escanear factura con IA
          </button>
          <input id="scanInvoiceInput" type="file" accept="image/*" capture="environment" class="hidden">
          <div id="scanInvoiceStatus" style="display:none;padding:8px;text-align:center;font-size:0.9em;opacity:0.7;">Analizando factura...</div>
        </div>
        <div class="field"><label>Fecha emision</label><input name="date" type="date" value="${ctx.esc(draft.date)}"></div>
        <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">Selecciona proveedor</option>${ctx.state.suppliers.map(s => `<option value="${s.id}" ${draft.supplierId === s.id ? "selected" : ""}>${ctx.esc(s.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Total documento</label><input name="totalAmount" type="number" step="0.01" min="0" value="${ctx.esc(draft.totalAmount)}" placeholder="0.00" readonly></div>
        <div class="field"><label>IVA / impuesto</label><input name="taxAmount" type="number" step="0.01" min="0" value="${ctx.esc(draft.taxAmount)}" placeholder="0.00" readonly></div>
        <div class="field" style="grid-column:1/-1;">
          <label>Lineas de compra</label>
          <div id="purchaseLines" class="line-list"></div>
        </div>
        <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes" placeholder="Observaciones, referencia del proveedor, etc.">${ctx.esc(draft.notes || "")}</textarea></div>
        <div class="field" style="grid-column:1/-1;">
          <label>Documento adjunto</label>
          <div class="actions">
            <button type="button" class="primary" id="purchaseAttachmentTrigger">Importar PDF o imagen</button>
            <button type="button" class="ghost ${draft.attachment ? "" : "hidden"}" id="purchaseAttachmentRemove">Quitar adjunto</button>
          </div>
          <input id="purchaseAttachmentInput" type="file" accept="application/pdf,image/*,.pdf" class="hidden">
          <div class="hint">Adjunta aqui el PDF o la imagen exportada desde Adobe Scan.</div>
          <div id="purchaseAttachmentPreview">${renderAttachment(draft.attachment, ctx)}</div>
        </div>
        <div class="summary" style="grid-column:1/-1;">
          <div class="summary-row"><span>Base</span><strong id="purchaseBasePreview">0,00 €</strong></div>
          <div class="summary-row"><span>IVA</span><strong id="purchaseTaxPreview">0,00 €</strong></div>
          <div class="summary-row"><span>Total compra</span><strong id="purchasePreview">0,00 €</strong></div>
        </div>
      </form>`,
      (body, actions) => {
        const form = body.querySelector("#purchaseForm");
        const linesRoot = body.querySelector("#purchaseLines");
        const initialLines = Array.isArray(item.lines) && item.lines.length ? item.lines : [ctx.blankLine()];
        let currentAttachment = draft.attachment || null;

        const syncSummary = () => {
          const lines = global.AppUILineEditor.collectLines(linesRoot, "purchase", ctx);
          const base = lines.reduce((sum, line) => sum + ctx.n(line.quantity) * ctx.n(line.price), 0);
          const iva = lines.reduce((sum, line) => sum + ctx.lineTotal(line) - ctx.n(line.quantity) * ctx.n(line.price), 0);
          const total = base + iva;
          body.querySelector("#purchaseBasePreview").textContent = ctx.money(base);
          body.querySelector("#purchaseTaxPreview").textContent = ctx.money(iva);
          body.querySelector("#purchasePreview").textContent = ctx.money(total);
          form.elements.totalAmount.value = total.toFixed(2);
          form.elements.taxAmount.value = iva.toFixed(2);
        };

        const drawAttachment = () => {
          body.querySelector("#purchaseAttachmentPreview").innerHTML = renderAttachment(currentAttachment, ctx);
          body.querySelector("#purchaseAttachmentRemove").classList.toggle("hidden", !currentAttachment);
        };

        global.AppUILineEditor.setupLineEditor(linesRoot, initialLines, "purchase", syncSummary, ctx);

        body.querySelector("#scanInvoiceBtn").addEventListener("click", () => body.querySelector("#scanInvoiceInput").click());
        body.querySelector("#scanInvoiceInput").addEventListener("change", async e => {
          const file = e.target.files?.[0];
          if(!file) return;
          const statusEl = body.querySelector("#scanInvoiceStatus");
          statusEl.style.display = "block";
          statusEl.textContent = "Analizando factura...";
          try{
            const dataUrl = await new Promise((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(String(reader.result || ""));
              reader.onerror = () => rej(new Error("No se pudo leer la imagen"));
              reader.readAsDataURL(file);
            });
            const response = await fetch("/api/anthropic-ocr", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                imageDataUrl:dataUrl
              })
            });
            const payload = await response.json().catch(() => ({}));
            if(!response.ok || payload?.ok === false){
              throw new Error(payload?.error || `anthropic-${response.status}`);
            }
            const extracted = payload?.result || {};
            if(extracted.fecha) form.elements.date.value = extracted.fecha;
            if(extracted.total_factura != null) form.elements.totalAmount.value = Number(extracted.total_factura).toFixed(2);
            if(extracted.iva_total != null) form.elements.taxAmount.value = Number(extracted.iva_total).toFixed(2);
            if(extracted.proveedor_nombre){
              const supplierMatch = ctx.state.suppliers.find(s => s.name.toLowerCase().includes(extracted.proveedor_nombre.toLowerCase()) || extracted.proveedor_nombre.toLowerCase().includes(s.name.toLowerCase()));
              if(supplierMatch) form.elements.supplierId.value = supplierMatch.id;
            }
            if(extracted.lineas?.[0]?.descripcion){
              const firstExtractedLine = extracted.lineas[0];
              const productMatch = ctx.state.products.find(p => p.name.toLowerCase().includes(firstExtractedLine.descripcion.toLowerCase()) || firstExtractedLine.descripcion.toLowerCase().includes(p.name.toLowerCase()));
              if(productMatch){
                const firstLine = linesRoot.querySelector('.line[data-index="0"]');
                if(firstLine){
                  const productSelect = firstLine.querySelector('[name="productId"]');
                  const quantityInput = firstLine.querySelector('[name="quantity"]');
                  const priceInput = firstLine.querySelector('[name="price"]');
                  const ivaInput = firstLine.querySelector('[name="iva"]');
                  const descriptionInput = firstLine.querySelector('[name="description"]');
                  if(productSelect) productSelect.value = productMatch.id;
                  if(descriptionInput) descriptionInput.value = productMatch.name;
                  if(quantityInput && firstExtractedLine.cantidad != null) quantityInput.value = firstExtractedLine.cantidad;
                  if(priceInput && firstExtractedLine.precio_unitario != null) priceInput.value = firstExtractedLine.precio_unitario;
                  if(ivaInput && firstExtractedLine.iva_pct != null) ivaInput.value = firstExtractedLine.iva_pct;
                  productSelect?.dispatchEvent(new Event("change", { bubbles:true }));
                  quantityInput?.dispatchEvent(new Event("input", { bubbles:true }));
                  priceInput?.dispatchEvent(new Event("input", { bubbles:true }));
                  ivaInput?.dispatchEvent(new Event("input", { bubbles:true }));
                  descriptionInput?.dispatchEvent(new Event("input", { bubbles:true }));
                }
              }
            }
            syncSummary();
            statusEl.textContent = "Factura analizada. Revisa los datos.";
          }catch(error){
            body.querySelector("#scanInvoiceStatus").textContent = "No se pudo analizar la factura. Rellena manualmente.";
            console.error("Scan error:", error);
          }
          e.target.value = "";
        });

        body.querySelector("#purchaseAttachmentTrigger").addEventListener("click", () => body.querySelector("#purchaseAttachmentInput").click());
        body.querySelector("#purchaseAttachmentInput").addEventListener("change", async e => {
          const file = e.target.files?.[0];
          if(!file) return;
          try{
            currentAttachment = await ctx.processAttachmentFile(file);
            drawAttachment();
          }catch{
            ctx.toast("No se pudo leer el documento adjunto");
          }
          e.target.value = "";
        });

        body.addEventListener("click", e => {
          if(e.target.closest("#purchaseAttachmentRemove")){
            currentAttachment = null;
            drawAttachment();
            return;
          }
          if(e.target.closest("[data-open-purchase-attachment]") && currentAttachment){
            ctx.openAttachment(currentAttachment);
          }
        });

        syncSummary();

        actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
          if(btn.dataset.modalAction !== "save") return;
          if(!form.reportValidity()) return;
          const lines = global.AppUILineEditor.collectLines(linesRoot, "purchase", ctx);
          const data = Object.fromEntries(new FormData(form).entries());
          const base = lines.reduce((sum, line) => sum + ctx.n(line.quantity) * ctx.n(line.price), 0);
          const ivaAmount = lines.reduce((sum, line) => sum + ctx.lineTotal(line) - ctx.n(line.quantity) * ctx.n(line.price), 0);
          const total = base + ivaAmount;
          const firstLine = lines[0] || {};
          const stockLines = lines.filter(line => line.productId && ctx.n(line.quantity) > 0);
          const unitCost = ctx.n(firstLine.price || firstLine.unitCost);
          const selectedSupplierName = data.supplierId ? (ctx.getSupplier(data.supplierId)?.name || "") : "";
          const normalizedLines = lines.map(line => ({
            ...line,
            description: String(line.description || ctx.getProduct(line.productId)?.name || "").trim(),
            quantity: ctx.n(line.quantity),
            price: ctx.n(line.price),
            iva: ctx.n(line.iva),
            ivaPct: ctx.n(line.ivaPct ?? line.iva)
          }));

          ctx.saveEntity("purchases", {
            ...item,
            date:data.date,
            supplierId:data.supplierId,
            productId:firstLine.productId || "",
            quantity:firstLine.quantity || 0,
            unitCost,
            iva:ivaAmount,
            ivaPct:ctx.n(firstLine.ivaPct ?? firstLine.iva),
            base,
            total,
            amount:total,
            baseAmount:base,
            ivaAmount:ivaAmount,
            totalAmount:total,
            supplier:selectedSupplierName || item.supplier || "",
            supplierName:selectedSupplierName || item.supplierName || item.supplier || "",
            lines:normalizedLines,
            notes:data.notes,
            attachment:currentAttachment,
            stockLines:stockLines.map(line => ({ productId:line.productId, quantity:ctx.n(line.quantity) }))
          }, id);
          global.AppUIModal.closeModal();
          ctx.toast("Compra guardada");
        }));
      },
      [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar compra",className:"primary"}]
    );
  }

  function renderAttachment(attachment, ctx){
    if(!attachment){
      return '<div class="hint">Aun no has anadido ningun documento.</div>';
    }
    const isImage = String(attachment.mimeType || "").startsWith("image/");
    return `<div class="card" style="padding:12px;">
      ${isImage ? `<img src="${attachment.dataUrl}" alt="${ctx.esc(attachment.name || "Documento adjunto")}" style="display:block;width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin-bottom:10px;">` : ""}
      <div class="summary-row"><span>${ctx.esc(attachment.name || "Documento adjunto")}</span><strong>${isImage ? "Imagen" : "PDF"}</strong></div>
      <div class="actions" style="margin-top:10px;"><button type="button" class="ghost" data-open-purchase-attachment="true">Abrir adjunto</button></div>
    </div>`;
  }

  global.AppUIFormPurchase = { openPurchaseForm };
})(window);
