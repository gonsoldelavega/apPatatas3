(function(global){
  async function openInvoiceForm(ctx, id, preset = null){
    const baseInvoice = id ? ctx.state.invoices.find(x => x.id === id) : null;
    const isNewInvoice = !id;
    let reservedNumber = "";
    let usedEmergencyNumber = false;

    if(isNewInvoice){
      const computeEmergencyNumber = () => {
        const configuredNext = Math.max(Number(ctx.state?.settings?.nextInvoiceNumber || 1), 1);
        const existingMax = Math.max(
          0,
          ...(ctx.state?.invoices || []).map(inv => Number(ctx.parseInvoiceNumber(inv.number)) || 0)
        );
        const safeNext = Math.max(configuredNext, existingMax + 1, 1);
        return ctx.composeInvoiceNumber(safeNext);
      };

      if(typeof ctx.reserveNextInvoiceNumber === "function"){
        try{
          reservedNumber = await ctx.reserveNextInvoiceNumber();
        }catch(error){
          console.error("No se pudo reservar número oficial. Se usará numeración local de emergencia.", error);
        }
      }

      if(!reservedNumber){
        reservedNumber = computeEmergencyNumber();
        usedEmergencyNumber = true;
        ctx.toast("Modo emergencia: número local asignado. Revisa la numeración al sincronizar.");
      }
    }

    const defaultInvoice = {
      id:ctx.uid("fac"),
      clientId:"",
      number:reservedNumber || ctx.composeInvoiceNumber(ctx.state.settings.nextInvoiceNumber),
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
    const invoice = baseInvoice || {
      ...defaultInvoice,
      ...(preset || {}),
      id:ctx.uid("fac"),
      number:reservedNumber,
      issueDate:ctx.today(),
      periodStart:ctx.today(),
      periodEnd:ctx.today(),
      amountPaid:"",
      paidDate:"",
      paymentDate:"",
      paymentMethod:"",
      paymentNote:"",
      status:"pending",
      sendStatus:"",
      internalNote:"",
      lines:(preset?.lines || defaultInvoice.lines).map(line => ({
        ...line,
        deliveryDate:ctx.today()
      }))
    };
    const defaultDeliveryDate = invoice.issueDate || ctx.today();
    const invoiceLines = (invoice.lines?.length ? invoice.lines : [ctx.blankLine()]).map(line => ({
      ...line,
      deliveryDate:line.deliveryDate || line.fechaEntrega || line.delivery_date || line.date || defaultDeliveryDate
    }));
    const isValidDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    global.AppUIModal.openModal(id ? "Editar factura" : "Nueva factura", usedEmergencyNumber ? "Numeración local de emergencia: guarda la factura y revisa la sincronización después" : "Un unico bloque logico de periodo y plantilla editable", `<form id="invoiceForm" class="sheet-grid">
      <div class="field"><label>Cliente</label><select name="clientId" id="invoiceClient"><option value="">Selecciona cliente</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${invoice.clientId === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Numero</label><input name="number" value="${ctx.esc(invoice.number)}" placeholder="${ctx.esc(ctx.composeInvoiceNumber(ctx.state.settings.nextInvoiceNumber))}" ${isNewInvoice ? "readonly" : ""} required></div>
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

      global.AppUILineEditor.setupLineEditor(linesRoot, invoiceLines, "invoice", refresh, ctx);
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
        const data = Object.fromEntries(new FormData(form).entries());
        if(!data.clientId) return ctx.toast("Selecciona un cliente para la factura.");
        if(!isValidDate(data.issueDate)) return ctx.toast("Indica una fecha de emision valida.");
        if(data.periodStart && data.periodEnd && data.periodStart > data.periodEnd){
          return ctx.toast("El inicio del periodo no puede ser posterior al final.");
        }
        if(!lines.length) return ctx.toast("Anade al menos una linea a la factura");
        const invalidLineIndex = lines.findIndex(line =>
          ctx.n(line.quantity) <= 0 ||
          ctx.n(line.price) < 0 ||
          !Number.isFinite(Number(line.iva)) ||
          !line.deliveryDate ||
          !isValidDate(line.deliveryDate) ||
          !Number.isFinite(ctx.lineTotal(line))
        );
        if(invalidLineIndex >= 0){
          return ctx.toast(`Revisa la linea ${invalidLineIndex + 1}: entrega, cantidad, precio e IVA deben ser validos.`);
        }
        const totals = ctx.invoiceTotals({ ...invoice, ...data, lines });
        if(!Number.isFinite(totals.total) || totals.total < 0){
          return ctx.toast("El total calculado de la factura no es coherente.");
        }
        const seq = ctx.parseInvoiceNumber(data.number);
        if(!seq) return ctx.toast("Numero de factura invalido. Usa algo como FAC-080/2026");

        const normalizedNumber = String(data.number || "").trim().toUpperCase();
        const duplicate = (ctx.state.invoices || []).some(inv =>
          inv.id !== invoice.id &&
          String(inv.number || "").trim().toUpperCase() === normalizedNumber
        );

        if(duplicate){
          return ctx.toast("Ya existe una factura con ese número. No se puede guardar duplicada.");
        }

        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Guardando...";
        try{
          const payload = {
            ...invoice,
            ...data,
            number:data.number,
            amountPaid:ctx.n(data.amountPaid),
            showPaymentTerms:data.showPaymentTerms === "true",
            lines
          };
          await Promise.resolve(ctx.saveEntity("invoices", payload, id));
          global.AppUIModal.closeModal();
          ctx.toast(usedEmergencyNumber ? "Factura guardada en modo emergencia" : "Factura guardada");
        }catch(error){
          console.error("No se pudo guardar la factura", error);
          ctx.toast("No se pudo guardar la factura. Revisa la consola.");
        }finally{
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar factura",className:"primary"}]);
  }

  global.AppUIFormInvoice = { openInvoiceForm };
})(window);
