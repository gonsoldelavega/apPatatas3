(function(global){
  function openSupplierForm(ctx, id){
    const supplier = id ? ctx.getSupplier(id) : { id:ctx.uid("sup"), name:"", nif:"", phone:"", email:"", address:"", notes:"" };
    global.AppUIModal.openModal(supplier.name ? "Editar proveedor" : "Nuevo proveedor", "Módulo independiente para compras y gastos", `<form id="supplierForm" class="sheet-grid">
      <div class="field"><label>Nombre</label><input name="name" value="${ctx.esc(supplier.name)}" required></div>
      <div class="field"><label>NIF/CIF</label><input name="nif" value="${ctx.esc(supplier.nif)}"></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${ctx.esc(supplier.phone)}"></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${ctx.esc(supplier.email)}"></div>
      <div class="field"><label>Dirección</label><input name="address" value="${ctx.esc(supplier.address)}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes">${ctx.esc(supplier.notes)}</textarea></div>
    </form>`, (body, actions) => {
      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#supplierForm");
        if(!form.reportValidity()) return;
        ctx.saveEntity("suppliers", { ...supplier, ...Object.fromEntries(new FormData(form).entries()) }, id);
        global.AppUIModal.closeModal();
        ctx.toast("Proveedor guardado");
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar proveedor",className:"primary"}]);
  }

  global.AppUIFormSupplier = { openSupplierForm };
})(window);
