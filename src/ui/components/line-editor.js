(function(global){
  function usesAmounts(mode){
    return mode === "invoice" || mode === "purchase" || mode === "delivery";
  }

  function renderLineItem(line, index, mode, ctx){
    const selected = ctx.getProduct(line.productId);
    const amountMode = usesAmounts(mode);
    const previewLine = {
      quantity:ctx.n(line.quantity),
      price:amountMode ? ctx.n(line.price) : 0,
      iva:amountMode ? ctx.n(line.iva) : 0
    };
    return `<div class="line" data-index="${index}">
      <div class="line-head"><span class="chip">Linea ${index + 1}</span><button type="button" class="danger" data-remove-line="${index}">Eliminar linea</button></div>
      <div class="sheet-grid">
        <div class="field"><label>Selector rapido</label><select data-product-select="true" data-index="${index}" name="productId"><option value="">Selecciona producto</option>${ctx.state.products.map(p => `<option value="${p.id}" ${line.productId === p.id ? "selected" : ""}>${ctx.esc(p.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Producto vinculado</label><input value="${ctx.esc(selected?.name || "Sin producto seleccionado")}" readonly></div>
        ${mode === "invoice" ? `<div class="field"><label>Fecha entrega</label><input name="deliveryDate" type="date" value="${ctx.esc(line.deliveryDate || "")}"></div>` : ""}
        ${amountMode ? `<div class="field"><label>Precio</label><input name="price" type="number" step="any" min="0" value="${ctx.esc(line.price)}"></div>` : ""}
        ${amountMode ? `<div class="field"><label>IVA</label><input name="iva" type="number" step="any" min="0" max="100" value="${ctx.esc(line.iva)}"></div>` : ""}
        <div class="field"><label>Cantidad</label><input name="quantity" type="number" step="any" min="0" value="${ctx.esc(line.quantity)}"></div>
        ${amountMode ? `<div class="field"><label>Total linea</label><div class="line-total" data-line-total="true">${ctx.money(ctx.lineTotal(previewLine))}</div></div>` : ""}
        <div class="field" style="grid-column:1/-1;"><label>Descripcion</label><textarea name="description">${ctx.esc(line.description || selected?.name || "")}</textarea></div>
      </div>
    </div>`;
  }

  function setupLineEditor(root, lines, mode, onChange, ctx){
    const amountMode = usesAmounts(mode);
    const normalizeLine = line => ({
      ...line,
      deliveryDate: mode === "invoice"
        ? (line.deliveryDate || line.fechaEntrega || line.delivery_date || line.date || ctx.today())
        : ""
    });
    lines = (lines || []).map(normalizeLine);

    const syncLineFromDom = item => {
      if(!item) return;
      const index = Number(item.dataset.index);
      if(!Number.isInteger(index) || !lines[index]) return;
      const productId = item.querySelector('[name="productId"]')?.value || "";
      lines[index] = {
        ...lines[index],
        productId,
        description: item.querySelector('[name="description"]')?.value ?? lines[index].description ?? "",
        quantity: ctx.n(item.querySelector('[name="quantity"]')?.value),
        price: amountMode ? ctx.n(item.querySelector('[name="price"]')?.value) : 0,
        iva: amountMode ? ctx.n(item.querySelector('[name="iva"]')?.value) : 0,
        deliveryDate: mode === "invoice" ? item.querySelector('[name="deliveryDate"]')?.value || "" : ""
      };
    };

    const syncLinesFromDom = () => {
      root.querySelectorAll(".line").forEach(syncLineFromDom);
    };

    const draw = () => {
      root.innerHTML = lines.map((line, i) => renderLineItem(line, i, mode, ctx)).join("") + `<button type="button" class="ghost" data-add-line="true">Anadir linea</button>`;

      root.querySelectorAll("[data-remove-line]").forEach(btn => btn.addEventListener("click", () => {
        syncLinesFromDom();
        lines.splice(Number(btn.dataset.removeLine), 1);
        draw();
        onChange && onChange();
      }));

      root.querySelector("[data-add-line]").addEventListener("click", () => {
        syncLinesFromDom();
        lines.push(normalizeLine(ctx.blankLine()));
        draw();
        onChange && onChange();
      });

      const refreshLineTotals = () => {
        root.querySelectorAll(".line").forEach(item => {
          const totalNode = item.querySelector("[data-line-total]");
          if(!totalNode) return;
          const quantity = ctx.n(item.querySelector('[name="quantity"]').value);
          const price = ctx.n(item.querySelector('[name="price"]').value);
          const iva = ctx.n(item.querySelector('[name="iva"]').value);
          totalNode.textContent = ctx.money(ctx.lineTotal({ quantity, price, iva }));
        });
      };

      root.querySelectorAll("[data-product-select]").forEach(sel => sel.addEventListener("change", () => {
        const item = root.querySelector(`.line[data-index="${sel.dataset.index}"]`);
        const product = ctx.getProduct(sel.value);
        if(!product) return;
        item.querySelector('[name="description"]').value = product.name;
        const linked = item.querySelector('input[readonly]');
        if(linked) linked.value = product.name;
        if(amountMode){
          item.querySelector('[name="price"]').value = product.price;
          item.querySelector('[name="iva"]').value = product.iva;
        }
        syncLineFromDom(item);
        refreshLineTotals();
        onChange && onChange();
      }));

      root.querySelectorAll("input,select,textarea").forEach(field => {
        field.addEventListener("input", () => {
          syncLineFromDom(field.closest(".line"));
          refreshLineTotals();
          onChange && onChange();
        });
        field.addEventListener("change", () => {
          syncLineFromDom(field.closest(".line"));
          refreshLineTotals();
          onChange && onChange();
        });
      });

      refreshLineTotals();
    };

    draw();
  }

  function collectLines(root, mode, ctx){
    const amountMode = usesAmounts(mode);
    return [...root.querySelectorAll(".line")].map(item => {
      const productId = item.querySelector('[name="productId"]').value;
      return {
        productId,
        description: item.querySelector('[name="description"]').value.trim() || ctx.getProduct(productId)?.name || "",
        quantity: ctx.n(item.querySelector('[name="quantity"]').value),
        price: amountMode ? ctx.n(item.querySelector('[name="price"]').value) : 0,
        iva: amountMode ? ctx.n(item.querySelector('[name="iva"]').value) : 0,
        deliveryDate: mode === "invoice" ? item.querySelector('[name="deliveryDate"]')?.value || "" : ""
      };
    }).filter(line => line.description || line.productId);
  }

  global.AppUILineEditor = { renderLineItem, setupLineEditor, collectLines };
})(window);
