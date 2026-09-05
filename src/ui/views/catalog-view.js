(function(global){
  function renderSupplierCard(supplier, ctx){
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${ctx.esc(supplier.name)}</h3>
          <p class="list-row-sub">${ctx.esc(supplier.nif || "Sin NIF/CIF")} · ${ctx.esc(supplier.phone || "Sin teléfono")}</p>
        </div>
      </div>
      <div class="inline-summary">
        <span class="chip">${ctx.esc(supplier.email || "Sin email")}</span>
        <span class="chip">${ctx.esc(supplier.address || "Sin dirección")}</span>
      </div>
      <div class="card-actions">
        <button data-action="edit-supplier" data-id="${supplier.id}">Editar</button>
        <button class="danger" data-action="delete-supplier" data-id="${supplier.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderCatalogView(ctx){
    const categories = [...new Set(ctx.state.products.map(p => p.category).filter(Boolean))].sort();
    const products = ctx.state.products.filter(p => [p.name,p.category,ctx.getSupplier(p.supplierId)?.name].some(v => String(v || "").toLowerCase().includes(ctx.ui.search.products.toLowerCase())) && (!ctx.ui.search.productsCategory || p.category === ctx.ui.search.productsCategory));
    const suppliers = ctx.state.suppliers.filter(p => [p.name,p.email,p.phone,p.nif].some(v => String(v || "").toLowerCase().includes(ctx.ui.search.suppliers.toLowerCase())));
    return `<div class="dual">
      <div class="panel">
        <div class="panel-h">
          <div><h2>Productos</h2><div class="sub">Precio, IVA y stock en un solo sitio</div></div>
          <div class="actions"><button class="primary" data-action="new-product">Nuevo producto</button></div>
        </div>
        <div class="panel-b">
          <div class="search-shell">
            <div class="search-row">
              <input placeholder="Buscar producto o proveedor" aria-label="Buscar productos" value="${ctx.esc(ctx.ui.search.products)}" data-search="products">
              <select data-search="productsCategory" aria-label="Filtrar productos por categoría"><option value="">Todas las categorías</option>${categories.map(c => `<option value="${ctx.esc(c)}" ${ctx.ui.search.productsCategory === c ? "selected" : ""}>${ctx.esc(c)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="entity-stack">${products.length ? products.map(ctx.productCard).join("") : '<div class="empty"><p>No hay productos para mostrar.</p></div>'}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h">
          <div><h2>Proveedores</h2><div class="sub">Contactos y proveedores de compras</div></div>
          <div class="actions"><button class="primary" data-action="new-supplier">Nuevo proveedor</button></div>
        </div>
        <div class="panel-b">
          <div class="search-shell">
            <div class="search-row"><input placeholder="Buscar proveedor" aria-label="Buscar proveedores" value="${ctx.esc(ctx.ui.search.suppliers)}" data-search="suppliers"></div>
          </div>
          <div class="entity-stack">${suppliers.length ? suppliers.map(supplier => renderSupplierCard(supplier, ctx)).join("") : '<div class="empty"><p>No hay proveedores cargados.</p></div>'}</div>
        </div>
      </div>
    </div>`;
  }

  global.AppUIViewCatalog = { renderCatalogView };
})(window);
