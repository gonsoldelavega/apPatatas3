(function(global){
  function openInvoiceForm(ctx, id, preset = null){
    const baseInvoice = preset?.id ? preset : (id ? ctx.state.invoices.find(x => x.id === id) : null);
    const invoice = baseInvoice || {
      id:ctx.uid("fac"),
      clientId:preset?.clientId || "",
      number:ctx.composeInvoiceNumber(ctx.state.settings.nextInvoiceNumber),
      issueDate:ctx.today(),
      periodStart:ctx.today(),
      periodEnd:ctx.today(),
      templateId:"",
      internalNote:"",
      sendStatus:"",
      amountPaid:"",
      showPaymentTerms:"",
      lines:[ctx.blankLine()]
    };
    global.AppUIModal.openModal(id ? "Editar factura" : "Nueva factura", "Un unico bloque logico de periodo y plantilla editable", `<form id="invoiceForm" class="sheet-grid">
      <div class="field"><label>Cliente</label><select name="clientId" id="invoiceClient"><option value="">Selecciona cliente</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${invoice.clientId === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Numero</label><input name="number" value="${ctx.esc(invoice.number)}" placeholder="${ctx.esc(ctx.composeInvoiceNumber(ctx.state.settings.nextInvoiceNumber))}" required></div>
      <div class="field"><label>Fecha de emision interna</label><input name="issueDate" type="date" value="${ctx.esc(invoice.issueDate)}"></div>
      <div class="field"><label>Plantilla</label><select name="templateId" id="invoiceTemplate"><option value="">Selecciona plantilla</option>${ctx.state.templates.map(t => `<option value="${t.id}" ${invoice.templateId === t.id ? "selected" : ""}>${ctx.esc(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Periodo de facturacion · inicio</label><input name="periodStart" type="date" value="${ctx.esc(invoice.periodStart)}"></div>
      <div class="field"><label>Periodo de facturacion · fin</label><input name="periodEnd" type="date" value="${ctx.esc(invoice.periodEnd)}"></div>
      <div class="field"><label>Estado de envio interno</label><select name="sendStatus"><option value="">Sin estado</option>${["pendiente","enviada","revisar"].map(s => `<option value="${s}" ${invoice.sendStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Importe cobrado interno</label><input name="amountPaid" type="number" step="0.01" value="${ctx.esc(invoice.amountPaid)}"></div>
      <div class="field"><label>Mostrar clausula legal</label><select name="showPaymentTerms" id="invoiceTerms"><option value="">Sin definir</option><option value="false" ${invoice.showPaymentTerms === false || invoice.showPaymentTerms === "false" ? "selected" : ""}>No</option><option value="true" ${invoice.showPaymentTerms === true || invoice.showPaymentTerms === "true" ? "selected" : ""}>Si</option></select></div>
      <div class="field" style="grid-column:1/-1;"><label>Lineas de factura</label><div id="invoiceLines" class="line-list"></div></div>
      <div class="field" style="grid-column:1/-1;"><label>Nota interna</label><textarea name="internalNote">${ctx.esc(invoice.internalNote)}</textarea></div>
      <div class="summary" style="grid-column:1/-1;" id="invoiceSummary"></div>
    </form>`, (body, actions) => {
      const linesRoot = body.querySelector("#invoiceLines");
      const amountInput = body.querySelector('input[name="amountPaid"]');
      const clientSelect = body.querySelector("#invoiceClient");
      const templateSelect = body.querySelector("#invoiceTemplate");
      const termsSelect = body.querySelector("#invoiceTerms");

      function refresh(){
        const totals = ctx.invoiceTotals({ lines:global.AppUILineEditor.collectLines(linesRoot, "invoice", ctx), amountPaid:amountInput.value });
        body.querySelector("#invoiceSummary").innerHTML = `<div class="summary-row"><span>Base imponible</span><strong>${ctx.money(totals.base)}</strong></div><div class="summary-row"><span>IVA total</span><strong>${ctx.money(totals.vat)}</strong></div><div class="summary-row total"><span>Total factura</span><strong>${ctx.money(totals.total)}</strong></div><div class="summary-row"><span>Cobrado</span><strong>${ctx.money(totals.paid)}</strong></div><div class="summary-row"><span>Pendiente</span><strong>${ctx.money(totals.pending)}</strong></div>`;
      }

      global.AppUILineEditor.setupLineEditor(linesRoot, invoice.lines || [ctx.blankLine()], "invoice", refresh, ctx);
      amountInput.addEventListener("input", refresh);
      clientSelect.addEventListener("change", () => {
        const client = ctx.getClient(clientSelect.value);
        if(client?.templateId && !templateSelect.value) templateSelect.value = client.templateId;
        if(!termsSelect.value) termsSelect.value = client?.paymentTermsDefault ? "true" : "false";
      });
      refresh();

      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", async () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#invoiceForm");
        if(!form.reportValidity()) return;
        const lines = global.AppUILineEditor.collectLines(linesRoot, "invoice", ctx);
        if(!lines.length) return ctx.toast("Anade al menos una linea a la factura");
        const data = Object.fromEntries(new FormData(form).entries());
        const seq = ctx.parseInvoiceNumber(data.number);
        if(!seq) return ctx.toast("Numero de factura invalido. Usa algo como FAC-080/2026");

        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Guardando...";
        try{
          let nextNumber = data.number;
          if(!id && data.number === invoice.number && typeof ctx.reserveNextInvoiceNumber === "function"){
            try{
              const reserved = await Promise.race([
                ctx.reserveNextInvoiceNumber(),
                new Promise(resolve => setTimeout(() => resolve(""), 3000))
              ]);
              if(reserved) nextNumber = reserved;
            }catch(error){
              console.warn("No se pudo reservar numero remoto. Se guarda con el numero visible.", error);
            }
          }

          ctx.saveEntity("invoices", { ...invoice, ...data, number:nextNumber, amountPaid:ctx.n(data.amountPaid), showPaymentTerms:data.showPaymentTerms === "true", lines }, id);
          global.AppUIModal.closeModal();
          ctx.toast("Factura guardada");
        }finally{
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar factura",className:"primary"}]);
  }

  global.AppUIFormInvoice = { openInvoiceForm };
})(window);
