(function(global){
  function openExpenseForm(ctx, id){
    const item = id ? ctx.state.expenses.find(x => x.id === id) : { id:ctx.uid("exp"), date:ctx.today(), supplierId:"", category:"", concept:"", base:"", iva:"", notes:"" };
    global.AppUIModal.openModal(id ? "Editar gasto" : "Nuevo gasto", "Registro interno para control del negocio", `<form id="expenseForm" class="sheet-grid">
      <div class="field"><label>Fecha</label><input name="date" type="date" value="${ctx.esc(item.date)}"></div>
      <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">Sin proveedor</option>${ctx.state.suppliers.map(s => `<option value="${s.id}" ${item.supplierId === s.id ? "selected" : ""}>${ctx.esc(s.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Categor\u00eda</label><select name="category"><option value="">Selecciona categor\u00eda</option>${["gasolina","agua","luz","bolsas","gestor\u00eda","aut\u00f3nomo","mantenimiento"].map(c => `<option value="${c}" ${item.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label>Concepto</label><input name="concept" value="${ctx.esc(item.concept)}"></div>
      <div class="field"><label>Base imponible</label><input name="base" type="number" step="0.01" value="${ctx.esc(item.base)}"></div>
      <div class="field"><label>IVA</label><input name="iva" type="number" step="0.01" value="${ctx.esc(item.iva)}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea name="notes">${ctx.esc(item.notes)}</textarea></div>
    </form>`, (body, actions) => {
      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#expenseForm");
        if(!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form).entries());
        ctx.saveEntity("expenses", { ...item, ...data, base:ctx.n(data.base), iva:ctx.n(data.iva) }, id);
        global.AppUIModal.closeModal();
        ctx.toast("Gasto guardado");
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar gasto",className:"primary"}]);
  }

  global.AppUIFormExpense = { openExpenseForm };
})(window);
