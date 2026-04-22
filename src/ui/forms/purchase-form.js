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
        <div class="field"><label>Total documento</label><input name="totalAmount" type="number" step="0.01" min="0" value="${ctx.esc(draft.totalAmount)}" placeholder="0.00"></div>
        <div class="field"><label>IVA / impuesto</label><input name="taxAmount" type="number" step="0.01" min="0" value="${ctx.esc(draft.taxAmount)}" placeholder="0.00"></div>
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
          <div class="summary-row"><span>Base estimada</span><strong id="purchaseBasePreview">${ctx.money(Math.max(0, ctx.n(draft.totalAmount) - ctx.n(draft.taxAmount)))}</strong></div>
          <div class="summary-row"><span>Total compra</span><strong id="purchasePreview">${ctx.money(ctx.n(draft.totalAmount))}</strong></div>
        </div>
      </form>`,
      (body, actions) => {
        const form = body.querySelector("#purchaseForm");
        const linesRoot = body.querySelector("#purchaseLines");
        const initialLines = Array.isArray(item.lines) && item.lines.length ? item.lines : [ctx.blankLine()];
        let currentAttachment = draft.attachment || null;

        const syncSummary = () => {
          const total = ctx.n(form.elements.totalAmount.value);
          const tax = ctx.n(form.elements.taxAmount.value);
          body.querySelector("#purchaseBasePreview").textContent = ctx.money(Math.max(0, total - tax));
          body.querySelector("#purchasePreview").textContent = ctx.money(total);
        };

        const drawAttachment = () => {
          body.querySelector("#purchaseAttachmentPreview").innerHTML = renderAttachment(currentAttachment, ctx);
          body.querySelector("#purchaseAttachmentRemove").classList.toggle("hidden", !currentAttachment);
        };

        global.AppUILineEditor.setupLineEditor(linesRoot, initialLines, false, syncSummary, ctx);

        body.querySelector("#scanInvoiceBtn").addEventListener("click", () => body.querySelector("#scanInvoiceInput").click());
        body.querySelector("#scanInvoiceInput").addEventListener("change", async e => {
          const file = e.target.files?.[0];
          if(!file) return;
          const statusEl = body.querySelector("#scanInvoiceStatus");
          statusEl.style.display = "block";
          statusEl.textContent = "Analizando factura...";
          try{
            const base64 = await new Promise((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(String(reader.result || "").split(",")[1]);
              reader.onerror = () => rej(new Error("No se pudo leer la imagen"));
              reader.readAsDataURL(file);
            });
            const productNames = ctx.state.products.map(p => p.name).join(", ");
            const supplierNames = ctx.state.suppliers.map(s => s.name).join(", ");
            const response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": ctx.getAnthropicKey(),
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-5",
                max_tokens: 1000,
                messages: [{
                  role: "user",
                  content: [
                    {
                      type: "image",
                      source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 }
                    },
                    {
                      type: "text",
                      text: `Analiza esta factura de compra y extrae los datos. Responde SOLO con un objeto JSON sin texto adicional ni backticks, con estos campos exactos:
{
  "date": "YYYY-MM-DD o null",
  "supplierName": "nombre del proveedor tal como aparece o null",
  "totalAmount": numero total de la factura con IVA o null,
  "taxAmount": importe del IVA en euros o null,
  "productName": "nombre del producto principal comprado o null",
  "quantity": numero de kg o unidades compradas o null,
  "notes": "cualquier referencia o dato adicional relevante o null"
}
Proveedores conocidos: ${supplierNames}
Productos conocidos: ${productNames}
Si el proveedor o producto de la factura coincide aproximadamente con alguno de la lista, usa el nombre exacto de la lista.`
                    }
                  ]
                }]
              })
            });
            const data = await response.json();
            const text = data.content.map(block => block.text || "").join("");
            const extracted = JSON.parse(text.replace(/```json|```/g, "").trim());
            if(extracted.date) form.elements.date.value = extracted.date;
            if(extracted.totalAmount != null) form.elements.totalAmount.value = Number(extracted.totalAmount).toFixed(2);
            if(extracted.taxAmount != null) form.elements.taxAmount.value = Number(extracted.taxAmount).toFixed(2);
            if(extracted.notes) form.elements.notes.value = extracted.notes;
            if(extracted.supplierName){
              const supplierMatch = ctx.state.suppliers.find(s => s.name.toLowerCase().includes(extracted.supplierName.toLowerCase()) || extracted.supplierName.toLowerCase().includes(s.name.toLowerCase()));
              if(supplierMatch) form.elements.supplierId.value = supplierMatch.id;
            }
            if(extracted.productName){
              const productMatch = ctx.state.products.find(p => p.name.toLowerCase().includes(extracted.productName.toLowerCase()) || extracted.productName.toLowerCase().includes(p.name.toLowerCase()));
              if(productMatch){
                const firstLine = linesRoot.querySelector('.line[data-index="0"]');
                if(firstLine){
                  const productSelect = firstLine.querySelector('[name="productId"]');
                  const quantityInput = firstLine.querySelector('[name="quantity"]');
                  const descriptionInput = firstLine.querySelector('[name="description"]');
                  if(productSelect) productSelect.value = productMatch.id;
                  if(descriptionInput) descriptionInput.value = productMatch.name;
                  if(quantityInput && extracted.quantity != null) quantityInput.value = extracted.quantity;
                  productSelect?.dispatchEvent(new Event("change", { bubbles:true }));
                  quantityInput?.dispatchEvent(new Event("input", { bubbles:true }));
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

        ["totalAmount","taxAmount"].forEach(name => form.elements[name].addEventListener("input", syncSummary));
        syncSummary();

        actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
          if(btn.dataset.modalAction !== "save") return;
          if(!form.reportValidity()) return;
          const lines = global.AppUILineEditor.collectLines(linesRoot, false, ctx);
          const data = Object.fromEntries(new FormData(form).entries());
          const total = ctx.n(data.totalAmount);
          const taxAmount = ctx.n(data.taxAmount);
          const base = Math.max(0, total - taxAmount);
          const firstLine = lines[0] || {};
          const stockLines = lines.filter(line => line.productId && ctx.n(line.quantity) > 0);
          const primaryQuantity = ctx.n(firstLine.quantity);
          const unitCost = primaryQuantity > 0 ? base / primaryQuantity : base;
          const nextLines = lines.map((line, index) => {
            const isPrimary = index === 0;
            const quantity = ctx.n(line.quantity);
            return {
              ...line,
              quantity,
              unit: line.unit || "",
              price: isPrimary ? unitCost : ctx.n(line.price),
              unitCost: isPrimary ? unitCost : ctx.n(line.unitCost),
              base: isPrimary ? base : ctx.n(line.base),
              iva: isPrimary ? ctx.n(item.ivaPct || (base > 0 ? (taxAmount / base) * 100 : 0)) : ctx.n(line.iva),
              ivaPct: isPrimary ? (base > 0 ? (taxAmount / base) * 100 : 0) : ctx.n(line.ivaPct ?? line.iva),
              ivaAmount: isPrimary ? taxAmount : ctx.n(line.ivaAmount),
              total: isPrimary ? total : ctx.n(line.total)
            };
          });

          ctx.saveEntity("purchases", {
            ...item,
            date:data.date,
            supplierId:data.supplierId,
            productId:firstLine.productId || "",
            quantity:firstLine.quantity || 0,
            unitCost,
            iva:taxAmount,
            ivaPct:base > 0 ? (taxAmount / base) * 100 : 0,
            base,
            total,
            amount:total,
            baseAmount:base,
            ivaAmount:taxAmount,
            totalAmount:total,
            supplier:data.supplierId ? (ctx.getSupplier(data.supplierId)?.name || item.supplier || "") : "",
            lines:nextLines,
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
