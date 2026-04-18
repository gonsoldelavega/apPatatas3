(function(global){
  function businessFields(ctx, draft){
    return `<div class="field"><label>Registrar como</label><select name="registerAs">
      <option value="none" ${draft.registerAs === "none" ? "selected" : ""}>Solo salida de monedero</option>
      <option value="expense" ${draft.registerAs === "expense" ? "selected" : ""}>Gasto</option>
      <option value="purchase" ${draft.registerAs === "purchase" ? "selected" : ""}>Compra</option>
    </select></div>
    <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">Sin proveedor</option>${ctx.state.suppliers.map(s => `<option value="${s.id}" ${draft.supplierId === s.id ? "selected" : ""}>${ctx.esc(s.name)}</option>`).join("")}</select></div>
    <div class="field wallet-expense-only"><label>Categoria</label><select name="expenseCategory">
      <option value="">Sin categoria</option>
      ${["gasolina","agua","luz","bolsas","gestoria","autonomo","mantenimiento","otros"].map(c => `<option value="${c}" ${draft.expenseCategory === c ? "selected" : ""}>${c}</option>`).join("")}
    </select></div>
    <div class="field wallet-purchase-only"><label>Producto (opcional)</label><select name="productId"><option value="">Sin afectar stock</option>${ctx.state.products.map(p => `<option value="${p.id}" ${draft.productId === p.id ? "selected" : ""}>${ctx.esc(p.name)}</option>`).join("")}</select></div>
    <div class="field wallet-purchase-only"><label>Cantidad (si afecta stock)</label><input name="quantity" type="number" step="0.01" min="0" value="${ctx.esc(draft.quantity || "")}" placeholder="Ej. 10"></div>`;
  }

  function openWalletMovementForm(ctx, mode){
    const currentBalance = ctx.walletBalance();
    const draft = {
      date:ctx.today(),
      amount:"",
      targetBalance:String(Number(currentBalance.toFixed(2))),
      scope:mode === "out" ? "business" : "neutral",
      registerAs:"none",
      supplierId:"",
      expenseCategory:"",
      productId:"",
      quantity:"",
      notes:""
    };
    const title = mode === "in" ? "Entrada en monedero" : mode === "out" ? "Salida de monedero" : "Ajustar saldo del monedero";
    const sub = mode === "adjust" ? "Fija el saldo real que llevais ahora mismo" : "Registra el movimiento en efectivo para no perder el control";
    global.AppUIModal.openModal(title, sub, `<form id="walletForm" class="sheet-grid">
      <div class="summary" style="grid-column:1/-1;">
        <div class="summary-row"><span>Saldo actual</span><strong>${ctx.money(currentBalance)}</strong></div>
      </div>
      <div class="field"><label>Fecha</label><input name="date" type="date" value="${ctx.esc(draft.date)}"></div>
      ${mode === "adjust"
        ? `<div class="field"><label>Saldo real del monedero</label><input name="targetBalance" type="number" step="0.01" value="${ctx.esc(draft.targetBalance)}"></div>`
        : `<div class="field"><label>${mode === "in" ? "Cantidad que entra" : "Cantidad que sale"}</label><input name="amount" type="number" step="0.01" min="0" value="${ctx.esc(draft.amount)}" placeholder="0.00"></div>`
      }
      ${mode === "out" ? `<div class="field"><label>Uso</label><select name="scope"><option value="business">Negocio</option><option value="personal">Personal</option></select></div>` : ""}
      ${mode === "in" ? `<div class="field"><label>Tipo de entrada</label><select name="scope"><option value="neutral">General</option><option value="business">Negocio</option><option value="personal">Personal</option></select></div>` : ""}
      ${mode === "out" ? businessFields(ctx, draft) : ""}
      <div class="field" style="grid-column:1/-1;"><label>Nota</label><textarea name="notes" placeholder="Ej. cobro en efectivo, comida, compra rapida...">${ctx.esc(draft.notes)}</textarea></div>
      <div class="summary" style="grid-column:1/-1;" id="walletPreview"></div>
    </form>`, (body, actions) => {
      const form = body.querySelector("#walletForm");
      const preview = body.querySelector("#walletPreview");

      function updateVisibility(){
        if(mode !== "out") return;
        const scope = form.elements.scope.value;
        const registerAs = form.elements.registerAs.value;
        body.querySelectorAll(".wallet-expense-only").forEach(node => node.classList.toggle("hidden", !(scope === "business" && registerAs === "expense")));
        body.querySelectorAll(".wallet-purchase-only").forEach(node => node.classList.toggle("hidden", !(scope === "business" && registerAs === "purchase")));
        const registerField = form.elements.registerAs.closest(".field");
        if(registerField) registerField.classList.toggle("hidden", scope !== "business");
      }

      function updatePreview(){
        const amount = ctx.n(form.elements.amount?.value);
        const targetBalance = ctx.n(form.elements.targetBalance?.value);
        const nextBalance = mode === "adjust"
          ? targetBalance
          : mode === "in"
            ? currentBalance + amount
            : currentBalance - amount;
        preview.innerHTML = `<div class="summary-row"><span>Saldo despues del movimiento</span><strong>${ctx.money(nextBalance)}</strong></div>`;
      }

      updateVisibility();
      updatePreview();
      form.elements.scope?.addEventListener("change", () => {
        updateVisibility();
        updatePreview();
      });
      form.elements.registerAs?.addEventListener("change", updateVisibility);
      form.elements.amount?.addEventListener("input", updatePreview);
      form.elements.targetBalance?.addEventListener("input", updatePreview);

      actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        if(btn.dataset.modalAction !== "save") return;
        if(!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form).entries());
        const saved = ctx.createWalletMovement({
          mode,
          date:data.date,
          amount:ctx.n(data.amount),
          targetBalance:ctx.n(data.targetBalance),
          scope:data.scope || (mode === "out" ? "business" : "neutral"),
          registerAs:data.registerAs || "none",
          supplierId:data.supplierId || "",
          expenseCategory:data.expenseCategory || "",
          productId:data.productId || "",
          quantity:ctx.n(data.quantity),
          notes:data.notes || ""
        });
        if(saved) global.AppUIModal.closeModal();
      }));
    }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:mode === "adjust" ? "Guardar ajuste" : "Guardar movimiento",className:"primary"}]);
  }

  global.AppUIFormWallet = { openWalletMovementForm };
})(window);
