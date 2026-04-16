(function(global){
  function openClientForm(ctx, id){
    const client = id ? ctx.getClient(id) : { id:ctx.uid("cli"), name:"", phone:"", email:"", address:"", templateId:"base", debtManual:0, notes:"", taxId:"", contactPerson:"", shippingAddress:"", paymentTermsDefault:false };
    global.AppUIModal.openModal(client.name ? "Editar cliente" : "Nuevo cliente", "Todos los campos se pueden editar desde su ficha", `<form id="clientForm" class="sheet-grid">
      <div class="field"><label>Nombre</label><input name="name" value="${ctx.esc(client.name)}" required></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${ctx.esc(client.phone)}"></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${ctx.esc(client.email)}"></div>
      <div class="field"><label>Dirección</label><input name="address" value="${ctx.esc(client.address)}"></div>
      <div class="field"><label>NIF/CIF</label><input name="taxId" value="${ctx.esc(client.taxId || "")}"></div>
      <div class="field"><label>Persona de contacto</label><input name="contactPerson" value="${ctx.esc(client.contactPerson || "")}"></div>
      <div class="field"><label>Dirección de envío</label><input name="shippingAddress" value="${ctx.esc(client.shippingAddress || "")}"></div>
      <div class="field"><label>Plantilla por defecto</label><select name="templateId">${ctx.state.templates.map(t => `<option value="${t.id}" ${client.templateId === t.id ? "selected" : ""}>${ctx.esc(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Mostrar cláusula legal por defecto</label><select name="paymentTermsDefault"><option value="false" ${client.paymentTermsDefault ? "" : "selected"}>No</option><option value="true" ${client.paymentTermsDefault ? "selected" : ""}>Sí</option></select></div>
      <div class="field"><label>Deuda manual</label><input name="debtManual" type="number" step="0.01" value="${ctx.esc(client.debtManual)}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes">${ctx.esc(client.notes)}</textarea></div>
    </form>`, (body, actions) => {
      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#clientForm");
        if(!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form).entries());
        ctx.saveEntity("clients", { ...client, ...data, debtManual:ctx.n(data.debtManual), paymentTermsDefault:data.paymentTermsDefault === "true" }, id);
        global.AppUIModal.closeModal();
        ctx.toast("Cliente guardado");
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar cliente",className:"primary"}]);
  }

  global.AppUIFormClient = { openClientForm };
})(window);
