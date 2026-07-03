(function(global){
  function suggestNumber(ctx){
    let max = 0;
    (ctx.state.deliveryNotes || []).forEach(item => {
      const match = String(item.number || "").match(/(\d+)\s*\/\s*20\d{2}/) || String(item.number || "").match(/(\d+)/);
      if(match) max = Math.max(max, Number(match[1]) || 0);
    });
    return `ALB-${String(max + 1).padStart(3, "0")}/${ctx.year}`;
  }

  function openDeliveryNoteForm(ctx, id){
    const item = id
      ? ctx.state.deliveryNotes.find(x => x.id === id)
      : { id:ctx.uid("alb"), number:suggestNumber(ctx), clientId:"", date:ctx.today(), status:"pendiente", notes:"", lines:[ctx.blankLine()] };
    global.AppUIModal.openModal(id ? "Editar albarán" : "Nuevo albarán", "Documento de entrega valorado (el precio es opcional)", `<form id="deliveryForm" class="sheet-grid">
      <div class="field"><label>Número</label><input name="number" value="${ctx.esc(item.number)}" placeholder="ALB-001/${ctx.year}" required></div>
      <div class="field"><label>Cliente</label><select name="clientId"><option value="">Selecciona cliente</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${item.clientId === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Fecha</label><input name="date" type="date" value="${ctx.esc(item.date)}"></div>
      <div class="field"><label>Estado</label><select name="status"><option value="">Sin estado</option>${["pendiente","entregado","firmado"].map(s => `<option value="${s}" ${item.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field" style="grid-column:1/-1;"><label>Líneas</label><div id="deliveryLines" class="line-list"></div></div>
      <div class="summary" style="grid-column:1/-1;">
        <div class="summary-row"><span>Base imponible</span><strong data-delivery-base></strong></div>
        <div class="summary-row"><span>IVA</span><strong data-delivery-vat></strong></div>
        <div class="summary-row total"><span>Total albarán</span><strong data-delivery-total></strong></div>
      </div>
      <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes">${ctx.esc(item.notes)}</textarea></div>
    </form>`, (body, actions) => {
      const linesRoot = body.querySelector("#deliveryLines");
      const refreshTotals = () => {
        const lines = global.AppUILineEditor.collectLines(linesRoot, "delivery", ctx);
        const totals = ctx.invoiceTotals({ lines, amountPaid:0 });
        const set = (selector, value) => { const node = body.querySelector(selector); if(node) node.textContent = ctx.money(value); };
        set("[data-delivery-base]", totals.base);
        set("[data-delivery-vat]", totals.vat);
        set("[data-delivery-total]", totals.total);
      };
      global.AppUILineEditor.setupLineEditor(linesRoot, item.lines || [ctx.blankLine()], "delivery", refreshTotals, ctx);
      refreshTotals();
      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#deliveryForm");
        if(!form.reportValidity()) return;
        const lines = global.AppUILineEditor.collectLines(linesRoot, "delivery", ctx);
        if(!lines.length) return ctx.toast("Añade al menos una línea al albarán");
        ctx.saveEntity("deliveryNotes", { ...item, ...Object.fromEntries(new FormData(form).entries()), lines }, id);
        global.AppUIModal.closeModal();
        ctx.toast("Albarán guardado");
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar albarán",className:"primary"}]);
  }

  global.AppUIFormDeliveryNote = { openDeliveryNoteForm };
})(window);
