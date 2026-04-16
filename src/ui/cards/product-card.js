(function(global){
  function renderProductCard(product, deps){
    const s = deps.stock(product.id);
    const klass = s <= 0 ? "danger" : s <= deps.n(product.stockMin) ? "warn" : "good";
    const family = deps.stockGroupLabel(product);
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${deps.esc(product.name)}</h3>
          <p class="list-row-sub">${deps.esc(product.category || "Sin categor\u00eda")} \u00b7 ${deps.esc(product.unit || "uds")} \u00b7 IVA ${deps.n(product.iva)}%</p>
        </div>
        <div>
          <div class="price">${deps.money(product.price)}</div>
          <div class="list-row-sub" style="text-align:right">stock ${s} ${deps.esc(product.unit || "uds")}</div>
        </div>
      </div>
      <div class="inline-summary">
        <span class="chip ${klass}">Disponible: ${s}</span>
        <span class="chip">Proveedor: ${deps.esc(deps.getSupplier(product.supplierId)?.name || "-")}</span>
        ${family ? `<span class="chip">Familia stock: ${deps.esc(family)}</span>` : ""}
        <span class="chip">M\u00ednimo: ${deps.n(product.stockMin)}</span>
        ${product.observations ? `<span class="chip">${deps.esc(product.observations)}</span>` : ""}
      </div>
      <div class="card-actions">
        <button data-action="edit-product" data-id="${product.id}">Editar</button>
        <button data-action="edit-product-stock" data-id="${product.id}">Stock</button>
        <button class="danger" data-action="delete-product" data-id="${product.id}">Eliminar</button>
      </div>
    </article>`;
  }

  global.AppUICardProduct = { renderProductCard };
})(window);
