(function(global){
  function openProductForm(ctx, id){
    const product = id ? ctx.getProduct(id) : { id:ctx.uid("pro"), name:"", category:"", price:0, iva:4, supplierId:"", unit:"kg", stockBase:0, stockMin:0, observations:"", stockGroup:"" };
    global.AppUIModal.openModal(product.name ? "Editar producto" : "Nuevo producto", "El stock real puede compartirse por familias como patata agria", `<form id="productForm" class="sheet-grid">
      <div class="field"><label>Nombre</label><input name="name" value="${ctx.esc(product.name)}" required></div>
      <div class="field"><label>Categoria</label><input name="category" value="${ctx.esc(product.category)}"></div>
      <div class="field"><label>Precio</label><input name="price" type="number" step="0.01" value="${ctx.esc(product.price)}" required></div>
      <div class="field"><label>IVA</label><input name="iva" type="number" step="0.01" value="${ctx.esc(product.iva)}"></div>
      <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">Sin proveedor</option>${ctx.state.suppliers.map(s => `<option value="${s.id}" ${product.supplierId === s.id ? "selected" : ""}>${ctx.esc(s.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Unidad</label><input name="unit" value="${ctx.esc(product.unit)}"></div>
      <div class="field"><label>Familia de stock</label><input name="stockGroup" value="${ctx.esc(product.stockGroup || ctx.inferStockGroup(product) || "")}" placeholder="Ej. patata-agria"></div>
      <div class="field"><label>Stock base manual</label><input name="stockBase" type="number" step="0.01" value="${ctx.esc(product.stockBase)}"></div>
      <div class="field"><label>Stock minimo</label><input name="stockMin" type="number" step="0.01" value="${ctx.esc(product.stockMin)}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Observaciones</label><textarea name="observations">${ctx.esc(product.observations)}</textarea></div>
    </form>`, (body, actions) => {
      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        const form = body.querySelector("#productForm");
        if(!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form).entries());
        ctx.saveEntity("products", { ...product, ...data, stockGroup:data.stockGroup.trim(), price:ctx.n(data.price), iva:ctx.n(data.iva), stockBase:ctx.n(data.stockBase), stockMin:ctx.n(data.stockMin) }, id);
        global.AppUIModal.closeModal();
        ctx.toast("Producto guardado");
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Guardar producto",className:"primary"}]);
  }

  global.AppUIFormProduct = { openProductForm };
})(window);
