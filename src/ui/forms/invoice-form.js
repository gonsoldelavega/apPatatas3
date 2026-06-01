(function(global){
  async function openInvoiceForm(ctx, id, preset = null){
    const baseInvoice = id ? ctx.state.invoices.find(x => x.id === id) : null;
    const isNewInvoice = !id;
    const MIN_NEXT_INVOICE_NUMBER = 101;

    function computePreviewInvoiceNumber(){
      const configuredNext = Math.max(Number(ctx.state?.settings?.nextInvoiceNumber || 1), 1);
      const usedNumbers = (ctx.state?.invoices || [])
        .map(inv => Number(ctx.parseInvoiceNumber(inv.number)) || 0)
        .filter(Boolean);
      const has101 = usedNumbers.includes(MIN_NEXT_INVOICE_NUMBER);
      const existingMax = Math.max(0, ...usedNumbers);

      if(!has101) return ctx.composeInvoiceNumber(MIN_NEXT_INVOICE_NUMBER);
      return ctx.composeInvoiceNumber(Math.max(configuredNext, existingMax + 1, MIN_NEXT_INVOICE_NUMBER + 1));
    }

    function existingMeta(source){
      return (source?.lines || []).find(line => line && line._invoiceMeta)?._invoiceMeta || {};
    }

    const meta = existingMeta(baseInvoice || preset || {});
    const previewNumber = isNewInvoice ? computePreviewInvoiceNumber() : "";

    const defaultInvoice = {
      id:ctx.uid("fac"),
      clientId:"",
      number:previewNumber || ctx.composeInvoiceNumber(ctx.state.settings.nextInvoiceNumber),
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
      number:previewNumber,
      issueDate:ctx.today(),
      periodStart:(preset?.periodStart || meta.periodStart || ctx.today()),
      periodEnd:(preset?.periodEnd || meta.periodEnd || ctx.today()),
      amountPaid:"",
      paidDate:"",
      paymentDate:"",
      paymentMethod:"",
      paymentNote:preset?.paymentNote || meta.paymentNote || "",
      status:"pending",
      sendStatus:preset?.sendStatus || meta.sendStatus || "",
      internalNote:"",
      showPaymentTerms:preset?.showPaymentTerms ?? meta.showPaymentTerms ?? "",
      lines:(preset?.lines || defaultInvoice.lines).map(line => ({
        ...line,
        deliveryDate:ctx.today()
      }))
    };
    invoice.periodStart = invoice.periodStart || meta.periodStart || invoice.issueDate || ctx.today();
    invoice.periodEnd = invoice.periodEnd || meta.periodEnd || invoice.periodStart || ctx.today();
    invoice.showPaymentTerms = invoice.showPaymentTerms === true || invoice.showPaymentTerms === "true" || meta.showPaymentTerms === true;
    invoice.sendStatus = invoice.sendStatus || meta.sendStatus || "";
    invoice.paymentNote = invoice.paymentNote || meta.paymentNote || "";

    const defaultDeliveryDate = invoice.issueDate || ctx.today();
    const invoiceLines = (invoice.lines?.length ? invoice.lines : [ctx.blankLine()]).map(line => ({
      ...line,
      deliveryDate:line.deliveryDate || line.fechaEntrega || line.delivery_date || line.date || defaultDeliveryDate
    }));
    const isValidDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

    global.AppUIModal.openModal(id ? "Editar factura" : "Nueva factura", "Flujo guiado: cliente, entregas, cobro y revisión", `<form id="invoiceForm" class="invoice-guided-form" novalidate>
      <div class="invoice-sticky-summary" id="invoiceStickySummary">
        <div>
          <span class="invoice-step-eyebrow">Factura preparada</span>
          <strong>${ctx.esc(invoice.number)}</strong>
        </div>
        <div class="invoice-sticky-total"><span>Total</span><strong>0,00 €</strong></div>
      </div>

      <section class="invoice-step-card">
        <div class="invoice-step-head"><span>1</span><div><h3>Cliente y numeración</h3><p>El número no se consume hasta guardar.</p></div></div>
        <div class="sheet-grid invoice-step-grid">
          <div class="field"><label>Cliente</label><select name="clientId" id="invoiceClient"><option value="">Selecciona cliente</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${invoice.clientId === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Número</label><input name="number" value="${ctx.esc(invoice.number)}" placeholder="${ctx.esc(ctx.composeInvoiceNumber(ctx.state.settings.nextInvoiceNumber))}" ${isNewInvoice ? "readonly" : ""}></div>
          <div class="field"><label>Fecha de emisión</label><input name="issueDate" type="date" value="${ctx.esc(invoice.issueDate)}"></div>
          <div class="field"><label>Plantilla</label><select name="templateId" id="invoiceTemplate"><option value="">Selecciona plantilla</option>${ctx.state.templates.map(t => `<option value="${t.id}" ${invoice.templateId === t.id ? "selected" : ""}>${ctx.esc(t.name)}</option>`).join("")}</select></div>
        </div>
      </section>

      <section class="invoice-step-card">
        <div class="invoice-step-head"><span>2</span><div><h3>Periodo y entregas</h3><p>Indica el rango de facturación y las líneas entregadas.</p></div></div>
        <div class="sheet-grid invoice-step-grid">
          <div class="field"><label>Periodo · inicio</label><input name="periodStart" type="date" value="${ctx.esc(invoice.periodStart)}"></div>
          <div class="field"><label>Periodo · fin</label><input name="periodEnd" type="date" value="${ctx.esc(invoice.periodEnd)}"></div>
          <div class="field invoice-lines-field" style="grid-column:1/-1;"><label>Líneas de factura</label><div id="invoiceLines" class="line-list"></div></div>
        </div>
      </section>

      <section class="invoice-step-card">
        <div class="invoice-step-head"><span>3</span><div><h3>Cobro y condiciones</h3><p>Registra si ya hay cobro parcial o total.</p></div></div>
        <div class="sheet-grid invoice-step-grid">
          <div class="field"><label>Estado de envío interno</label><select name="sendStatus"><option value="">Sin estado</option>${["pendiente","enviada","revisar"].map(s => `<option value="${s}" ${invoice.sendStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
          <div class="field"><label>Importe cobrado</label><input name="amountPaid" type="number" step="0.01" value="${ctx.esc(invoice.amountPaid)}"></div>
          <div class="field"><label>Mostrar cláusula legal</label><select name="showPaymentTerms" id="invoiceTerms"><option value="false" ${invoice.showPaymentTerms ? "" : "selected"}>No</option><option value="true" ${invoice.showPaymentTerms ? "selected" : ""}>Sí</option></select></div>
          <div class="field" style="grid-column:1/-1;"><label>Nota interna</label><textarea name="internalNote">${ctx.esc(invoice.internalNote)}</textarea></div>
        </div>
      </section>

      <section class="invoice-step-card invoice-review-card">
        <div class="invoice-step-head"><span>4</span><div><h3>Revisión final</h3><p>Comprueba total, cobrado y pendiente antes de guardar.</p></div></div>
        <div class="summary" id="invoiceSummary"></div>
      </section>
    </form>`, (body, actions) => {
      const linesRoot = body.querySelector("#invoiceLines");
      const amountInput = body.querySelector('input[name="amountPaid"]');
      const numberInput = body.querySelector('input[name="number"]');
      const clientSelect = body.querySelector("#invoiceClient");
      const templateSelect = body.querySelector("#invoiceTemplate");
      const termsSelect = body.querySelector("#invoiceTerms");
      const sticky = body.querySelector("#invoiceStickySummary");
      const form = body.querySelector("#invoiceForm");

      function refresh(){
        const totals = ctx.invoiceTotals({ lines:global.AppUILineEditor.collectLines(linesRoot, "invoice", ctx), amountPaid:amountInput.value });
        body.querySelector("#invoiceSummary").innerHTML = `<div class="summary-row"><span>Base imponible</span><strong>${ctx.money(totals.base)}</strong></div><div class="summary-row"><span>IVA total</span><strong>${ctx.money(totals.vat)}</strong></div><div class="summary-row total"><span>Total factura</span><strong>${ctx.money(totals.total)}</strong></div><div class="summary-row"><span>Cobrado</span><strong>${ctx.money(totals.paid)}</strong></div><div class="summary-row"><span>Pendiente</span><strong>${ctx.money(totals.pending)}</strong></div>`;
        if(sticky){
          sticky.innerHTML = `<div><span class="invoice-step-eyebrow">Factura preparada</span><strong>${ctx.esc(numberInput.value || invoice.number)}</strong></div><div class="invoice-sticky-total"><span>Total</span><strong>${ctx.money(totals.total)}</strong></div><div class="invoice-sticky-total pending"><span>Pendiente</span><strong>${ctx.money(totals.pending)}</strong></div>`;
        }
      }

      function getFormData(){
        const data = Object.fromEntries(new FormData(form).entries());
        if(isNewInvoice) data.number = computePreviewInvoiceNumber();
        data.showPaymentTerms = data.showPaymentTerms === "true";
        return data;
      }

      function attachInvoiceMeta(lines, data){
        const invoiceMeta = {
          periodStart:data.periodStart,
          periodEnd:data.periodEnd,
          showPaymentTerms:data.showPaymentTerms === true,
          sendStatus:data.sendStatus || "",
          paymentNote:invoice.paymentNote || ""
        };
        return lines.map((line, index) => index === 0 ? { ...line, _invoiceMeta:invoiceMeta } : line);
      }

      function validateInvoiceData(data, lines){
        if(!data.clientId) return "Selecciona un cliente para la factura.";
        if(!data.number || !ctx.parseInvoiceNumber(data.number)) return "Número de factura inválido. Usa algo como FAC-100/2026.";
        if(!isValidDate(data.issueDate)) return "Indica una fecha de emisión válida.";
        if(!isValidDate(data.periodStart)) return "Indica una fecha de inicio de periodo válida.";
        if(!isValidDate(data.periodEnd)) return "Indica una fecha de fin de periodo válida.";
        if(data.periodStart && data.periodEnd && data.periodStart > data.periodEnd) return "El inicio del periodo no puede ser posterior al final.";
        if(typeof data.showPaymentTerms !== "boolean") return "Indica si quieres mostrar la cláusula legal: Sí o No.";
        if(!lines.length) return "Añade al menos una línea a la factura.";
        const invalidLineIndex = lines.findIndex(line =>
          ctx.n(line.quantity) <= 0 ||
          ctx.n(line.price) < 0 ||
          !Number.isFinite(Number(line.iva)) ||
          !line.deliveryDate ||
          !isValidDate(line.deliveryDate) ||
          !Number.isFinite(ctx.lineTotal(line))
        );
        if(invalidLineIndex >= 0) return `Revisa la línea ${invalidLineIndex + 1}: entrega, cantidad, precio e IVA deben ser válidos.`;
        const totals = ctx.invoiceTotals({ ...invoice, ...data, lines });
        if(!Number.isFinite(totals.total) || totals.total < 0) return "El total calculado de la factura no es coherente.";
        const normalizedNumber = String(data.number || "").trim().toUpperCase();
        const duplicate = (ctx.state.invoices || []).some(inv =>
          inv.id !== invoice.id &&
          String(inv.number || "").trim().toUpperCase() === normalizedNumber
        );
        if(duplicate) return "Ya existe una factura con ese número. No se puede guardar duplicada.";
        return "";
      }

      async function saveInvoice(btn){
        const originalLabel = btn?.textContent || "Guardar factura";
        try{
          const rawLines = global.AppUILineEditor.collectLines(linesRoot, "invoice", ctx);
          const data = getFormData();
          const lines = attachInvoiceMeta(rawLines, data);
          const validationError = validateInvoiceData(data, lines);
          if(validationError){
            ctx.toast(validationError);
            return;
          }
          if(btn){
            btn.disabled = true;
            btn.textContent = "Guardando...";
          }
          const payload = {
            ...invoice,
            ...data,
            id:invoice.id,
            number:data.number,
            periodStart:data.periodStart,
            periodEnd:data.periodEnd,
            amountPaid:ctx.n(data.amountPaid),
            showPaymentTerms:data.showPaymentTerms === true,
            lines
          };
          await Promise.resolve(ctx.saveEntity("invoices", payload, id));
          global.AppUIModal.closeModal();
          ctx.toast(id ? "Cambios guardados" : "Factura guardada");
        }catch(error){
          console.error("No se pudo guardar la factura", error);
          ctx.toast(error?.message ? `No se pudo guardar: ${error.message}` : "No se pudo guardar la factura.");
        }finally{
          if(btn){
            btn.disabled = false;
            btn.textContent = originalLabel;
          }
        }
      }

      global.AppUILineEditor.setupLineEditor(linesRoot, invoiceLines, "invoice", refresh, ctx);
      amountInput.addEventListener("input", refresh);
      numberInput.addEventListener("input", refresh);
      form.addEventListener("submit", event => {
        event.preventDefault();
        saveInvoice(actions.querySelector('[data-modal-action="save"]'));
      });
      clientSelect.addEventListener("change", () => {
        const client = ctx.getClient(clientSelect.value);
        if(client?.templateId && !templateSelect.value) templateSelect.value = client.templateId;
        if(!termsSelect.value) termsSelect.value = client?.paymentTermsDefault ? "true" : "false";
      });
      actions.addEventListener("click", event => {
        const btn = event.target.closest('[data-modal-action="save"]');
        if(!btn) return;
        event.preventDefault();
        event.stopPropagation();
        saveInvoice(btn);
      });
      refresh();
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar factura",className:"primary"}]);
  }

  global.AppUIFormInvoice = { openInvoiceForm };
})(window);
