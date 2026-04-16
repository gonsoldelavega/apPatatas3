(function(global){
  function openDeliveryNoteForm(ctx, id){
    const item = id ? ctx.state.deliveryNotes.find(x => x.id === id) : { id:ctx.uid("alb"), number:"", clientId:"", date:ctx.today(), status:"", notes:"", lines:[ctx.blankLine()] };
    global.AppUIModal.openModal(id ? "Editar albar\u00e1n" : "Nuevo albar\u00e1n", "Documento sin precios para entrega", `<form id="deliveryForm" class="sheet-grid">
      <div class="field"><label>N\u00famero</label><input name="number" value="${ctx.esc(item.number)}" placeholder="ALB-001/${ctx.year}" required></div>
      <div class="field"><label>Cliente</label><select name="clientId"><option value="">Selecciona cliente</option>${ctx.state.clients.map(c => `<option value="${c.id}" ${item.clientId === c.id ? "selected" : ""}>${ctx.esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Fecha</label><input name="date" type="date" value="${ctx.esc(item.date)}"></div>
      <div class="field"><label>Estado</label><select name="status"><option value="">Sin estado</option>${["pendiente","entregado","firmado"].map(s => `<option value="${s}" ${item.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field" style="grid-column:1/-1;"><label>L\u00edneas</label><div id="deliveryLines" class="line-list"></div></div>
      <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes">${ctx.esc(item.notes)}</textarea></div>
    </form>`, (body, actions) => {
      global.AppUILineEditor.setupLineEditor(body.querySelector("#deliveryLines"), item.lines || [ctx.blankLine()], false, null, ctx);
      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#deliveryForm");
        if(!form.reportValidity()) return;
        const lines = global.AppUILineEditor.collectLines(body.querySelector("#deliveryLines"), false, ctx);
        if(!lines.length) return ctx.toast("A\u00f1ade al menos una l\u00ednea al albar\u00e1n");
        ctx.saveEntity("deliveryNotes", { ...item, ...Object.fromEntries(new FormData(form).entries()), lines }, id);
        global.AppUIModal.closeModal();
        ctx.toast("Albar\u00e1n guardado");
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar albar\u00e1n",className:"primary"}]);
  }

  global.AppUIFormDeliveryNote = { openDeliveryNoteForm };
})(window);
