(function(global){
  function scannedPagesToImages(scannedSession){
    return (scannedSession?.pages || []).map((page, index) => ({
      id: page.id || `scan-${index + 1}`,
      name: `scan-${index + 1}.jpg`,
      dataUrl: page.variants?.[page.selectedFilter || "document"] || page.variants?.document || page.variants?.color || page.source,
      createdAt: page.createdAt || new Date().toISOString(),
      scanMeta: {
        detected: true,
        selectedFilter: page.selectedFilter || "document",
        source: "scanner-session"
      }
    })).filter(image => image.dataUrl);
  }

  function mergeOcrText(scannedSession){
    return (scannedSession?.pages || [])
      .map(page => page.ocr?.text || "")
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  function openDocumentForm(ctx, id, options = {}){
    const base = id ? ctx.state.documents.find(x => x.id === id) : null;
    const scannedImages = scannedPagesToImages(options.scannedSession);
    const scannedOcrText = mergeOcrText(options.scannedSession);
    const defaults = options.defaults || {};
    const item = base || {
      id:ctx.uid("doc"),
      date:ctx.today(),
      type:defaults.type || "",
      title:defaults.title || "",
      supplierId:defaults.supplierId || "",
      relatedType:defaults.relatedType || "",
      relatedId:defaults.relatedId || "",
      notes:defaults.notes || "",
      images:scannedImages,
      ocrText:scannedOcrText,
      ocrSummary:null,
      ocrAt: scannedOcrText ? new Date().toISOString() : ""
    };

    if(base && scannedImages.length){
      item.images = [...(base.images || []), ...scannedImages];
      if(scannedOcrText){
        item.ocrText = [base.ocrText || "", scannedOcrText].filter(Boolean).join("\n\n---\n\n");
        item.ocrAt = new Date().toISOString();
      }
    }

    const draft = structuredClone(item);

    global.AppUIModal.openModal(
      id ? "Editar documento" : "Nuevo documento",
      "Adjunta tickets y facturas del negocio para mantener la operativa ordenada",
      `<form id="documentForm" class="sheet-grid">
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${ctx.esc(draft.date)}"></div>
        <div class="field"><label>Tipo</label><select name="type"><option value="">Selecciona tipo</option><option value="ticket" ${draft.type === "ticket" ? "selected" : ""}>Ticket</option><option value="supplierInvoice" ${draft.type === "supplierInvoice" ? "selected" : ""}>Factura proveedor</option><option value="deliveryProof" ${draft.type === "deliveryProof" ? "selected" : ""}>Albarán proveedor</option><option value="receipt" ${draft.type === "receipt" ? "selected" : ""}>Justificante</option><option value="other" ${draft.type === "other" ? "selected" : ""}>Otro</option></select></div>
        <div class="field"><label>Título</label><input name="title" value="${ctx.esc(draft.title)}" placeholder="Ej. Ticket gasoil, factura verduras..."></div>
        <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">Sin proveedor</option>${ctx.state.suppliers.map(s => `<option value="${s.id}" ${draft.supplierId === s.id ? "selected" : ""}>${ctx.esc(s.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Vincular a registro</label><select name="relatedRef"><option value="">Sin vincular</option>${ctx.relatedOptions(draft.relatedType, draft.relatedId)}</select></div>
        <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes">${ctx.esc(draft.notes || "")}</textarea></div>
        <div class="field" style="grid-column:1/-1;"><label>Adjuntos</label><div class="actions"><button type="button" class="primary" id="galleryTrigger">Importar fotos o galería</button></div><input id="galleryInput" type="file" accept="image/*" multiple class="hidden"><div class="hint">Sube una o varias imágenes del documento. El escáner avanzado queda pausado temporalmente.</div></div>
        <div class="field" style="grid-column:1/-1;"><label>Páginas / fotos</label><div class="doc-grid" id="documentImages"></div></div>
        <div class="field" style="grid-column:1/-1;"><label>OCR</label><div class="actions"><button type="button" class="ghost" id="ocrTrigger">Leer texto del documento</button></div><div class="hint">Lectura OCR en segundo plano. Devuelve texto bruto y confianza, sin parseo fiscal avanzado todavía.</div><div id="ocrStatus" class="hint"></div><textarea id="ocrTextPreview" placeholder="El texto OCR aparecerá aquí" style="min-height:140px;">${ctx.esc(draft.ocrText || "")}</textarea></div>
      </form>`,
      (body, actions) => {
        const form = body.querySelector("#documentForm");
        const imagesRoot = body.querySelector("#documentImages");
        const ocrStatus = body.querySelector("#ocrStatus");
        const ocrTextPreview = body.querySelector("#ocrTextPreview");

        const setOcrStatus = text => { ocrStatus.textContent = text || ""; };
        const syncOcrPreview = () => { ocrTextPreview.value = draft.ocrText || ""; };
        const drawImages = () => {
          imagesRoot.innerHTML = draft.images.length
            ? draft.images.map((img, index) => `<div class="doc-thumb"><img src="${img.dataUrl}" alt="${ctx.esc(img.name || "Documento")}"><button type="button" data-remove-doc-image="${index}">Quitar</button></div>`).join("")
            : `<div class="empty" style="grid-column:1/-1;"><p>Aún no has añadido imágenes.</p></div>`;
          imagesRoot.querySelectorAll("[data-remove-doc-image]").forEach(btn => btn.addEventListener("click", () => {
            draft.images.splice(Number(btn.dataset.removeDocImage), 1);
            drawImages();
          }));
        };

        const applyOcrSummaryToForm = summary => {
          if(summary?.title && !form.elements.title.value.trim()) form.elements.title.value = summary.title;
          if(summary?.date) form.elements.date.value = summary.date;
          if(summary?.supplierId) form.elements.supplierId.value = summary.supplierId;
          if(summary?.total != null){
            const noteLine = `OCR total detectado: ${ctx.money(summary.total)}`;
            if(!String(form.elements.notes.value || "").includes(noteLine)){
              form.elements.notes.value = [form.elements.notes.value.trim(), noteLine].filter(Boolean).join("\n");
            }
          }
        };

        const runOcr = async () => {
          if(!draft.images.length) return ctx.toast("Primero añade una imagen del documento");
          setOcrStatus("Leyendo texto del documento con OCR + IA...");
          try{
            const result = await ctx.runDocumentOcr(draft.images[0].dataUrl);
            draft.ocrText = result.text;
            draft.ocrSummary = result.summary;
            draft.ocrAt = new Date().toISOString();
            syncOcrPreview();
            applyOcrSummaryToForm(result.summary);
            setOcrStatus(`OCR completado${result.provider === "anthropic+tesseract" ? " con IA" : ""}. Confianza ${Math.round(result.confidence || 0)}%.`);
          }catch{
            setOcrStatus("No se pudo leer el texto del documento.");
            ctx.toast("No se pudo completar el OCR");
          }
        };

        const importFiles = async files => {
          const added = [];
          for(const file of [...files]){
            try{ added.push(await ctx.processDocumentFile(file, "scanner")); }
            catch{ ctx.toast("No se pudo leer una de las imágenes"); }
          }
          draft.images.push(...added);
          drawImages();
        };

        body.querySelector("#galleryTrigger").addEventListener("click", () => body.querySelector("#galleryInput").click());
        body.querySelector("#ocrTrigger").addEventListener("click", runOcr);
        ocrTextPreview.addEventListener("input", () => { draft.ocrText = ocrTextPreview.value; });
        body.querySelector("#galleryInput").addEventListener("change", e => { if(e.target.files?.length) importFiles(e.target.files); e.target.value = ""; });

        drawImages();
        syncOcrPreview();
        if(draft.ocrText) setOcrStatus(`OCR guardado ${draft.ocrAt ? "el " + new Date(draft.ocrAt).toLocaleString("es-ES") : ""}`.trim());

        actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
          if(btn.dataset.modalAction !== "save") return;
          if(!form.reportValidity()) return;
          if(!draft.images.length) return ctx.toast("Añade al menos una imagen del documento");
          const data = Object.fromEntries(new FormData(form).entries());
          const related = ctx.parseRelatedValue(data.relatedRef);
          ctx.saveEntity("documents", { ...draft, ...data, ...related, images:draft.images, ocrText:draft.ocrText || "", ocrSummary:draft.ocrSummary || null, ocrAt:draft.ocrAt || "" }, id);
          global.AppUIModal.closeModal();
          ctx.toast("Documento guardado");
        }));
      },
      [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar documento",className:"primary"}]
    );
  }

  global.AppUIFormDocument = { openDocumentForm };
})(window);
