(function(global){
  function movementTone(item, delta){
    if(item.kind === "adjust") return delta >= 0 ? "good" : "warn";
    return delta >= 0 ? "good" : "danger";
  }

  function movementTitle(item){
    if(item.kind === "in") return item.scope === "business" ? "Entrada negocio" : "Entrada efectivo";
    if(item.kind === "out") return item.scope === "business" ? "Salida negocio" : "Salida personal";
    return "Ajuste manual";
  }

  function moneyDelta(ctx, value){
    return `${value >= 0 ? "+" : "-"}${ctx.money(Math.abs(value))}`;
  }

  function renderMovementCard(item, ctx){
    const delta = ctx.walletMovementDelta(item);
    const linkedLabel = item.linkedType === "expense"
      ? "Gasto creado"
      : item.linkedType === "purchase"
        ? "Compra creada"
        : "";
    return `<article class="card card-tight">
      <div class="list-row-top">
        <div>
          <h3 class="list-row-title">${ctx.esc(movementTitle(item))}</h3>
          <p class="list-row-sub">${ctx.date(item.date)}${item.notes ? ` · ${ctx.esc(item.notes)}` : ""}</p>
        </div>
        <div class="price ${delta < 0 ? "wallet-negative" : "wallet-positive"}">${moneyDelta(ctx, delta)}</div>
      </div>
      <div class="inline-summary">
        <span class="chip ${movementTone(item, delta)}">${ctx.esc(ctx.walletKindLabel(item.kind))}</span>
        <span class="chip">${ctx.esc(ctx.walletScopeLabel(item.scope))}</span>
        ${item.kind === "adjust" && item.targetBalance !== undefined && item.targetBalance !== null ? `<span class="chip">Saldo fijado: ${ctx.money(item.targetBalance)}</span>` : ""}
        ${item.linkedType ? `<span class="chip good">${linkedLabel}</span>` : ""}
      </div>
      <div class="card-actions">
        ${item.linkedType === "expense" ? `<button data-action="edit-expense" data-id="${item.linkedId}">Abrir gasto</button>` : ""}
        ${item.linkedType === "purchase" ? `<button data-action="edit-purchase" data-id="${item.linkedId}">Abrir compra</button>` : ""}
        <button class="danger" data-action="delete-wallet-movement" data-id="${item.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderWalletView(ctx){
    const month = ctx.today().slice(0, 7);
    const movements = (ctx.state.walletMovements || [])
      .filter(item => !ctx.ui.search.walletScope || item.scope === ctx.ui.search.walletScope)
      .filter(item => !ctx.ui.search.walletKind || item.kind === ctx.ui.search.walletKind)
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const monthMovements = movements.filter(item => ctx.monthKey(item.date) === month);
    const balance = ctx.walletBalance();
    const monthIn = monthMovements.reduce((sum, item) => sum + Math.max(ctx.walletMovementDelta(item), 0), 0);
    const monthOut = monthMovements.reduce((sum, item) => sum + Math.max(-ctx.walletMovementDelta(item), 0), 0);
    const businessOut = monthMovements.filter(item => item.scope === "business" && ctx.walletMovementDelta(item) < 0).reduce((sum, item) => sum + Math.abs(ctx.walletMovementDelta(item)), 0);
    const personalOut = monthMovements.filter(item => item.scope === "personal" && ctx.walletMovementDelta(item) < 0).reduce((sum, item) => sum + Math.abs(ctx.walletMovementDelta(item)), 0);

    return `<div class="view-stack dashboard-home">
      <section class="home-top-grid">
        <article class="hero-primary hero-primary-compact">
          <span class="eyebrow">MONEDERO</span>
          <h2>${ctx.money(balance)}</h2>
          <p>SALDO ACTUAL</p>
          <div class="quick wallet-quick-actions">
            <button class="primary" data-action="new-wallet-in">ENTRA DINERO</button>
            <button class="primary" data-action="new-wallet-out">SALE DINERO</button>
            <button class="ghost" data-action="new-wallet-adjust">AJUSTAR SALDO</button>
          </div>
        </article>

        <article class="dashboard-block soft-block balance-focus-card">
          <div class="section-title">
            <div>
              <h3>RESUMEN DEL MES</h3>
              <p>Control rapido del efectivo que llevais encima</p>
            </div>
          </div>
          <div class="balance-focus-grid">
            <div class="mini-stat">
              <span>ENTRADAS</span>
              <strong>${ctx.money(monthIn)}</strong>
            </div>
            <div class="mini-stat">
              <span>SALIDAS</span>
              <strong>${ctx.money(monthOut)}</strong>
            </div>
            <div class="mini-stat">
              <span>NEGOCIO</span>
              <strong>${ctx.money(businessOut)}</strong>
            </div>
            <div class="mini-stat accent-stat">
              <span>PERSONAL</span>
              <strong>${ctx.money(personalOut)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section class="dashboard-block soft-block invoices-month-block">
        <div class="section-title">
          <div>
            <h3>MOVIMIENTOS DEL MONEDERO</h3>
            <p>${movements.length} movimiento(s) guardados</p>
          </div>
        </div>
        <div class="search-shell">
          <div class="search-row">
            <select data-search="walletScope">
              <option value="">Todos los usos</option>
              <option value="neutral" ${ctx.ui.search.walletScope === "neutral" ? "selected" : ""}>General</option>
              <option value="business" ${ctx.ui.search.walletScope === "business" ? "selected" : ""}>Negocio</option>
              <option value="personal" ${ctx.ui.search.walletScope === "personal" ? "selected" : ""}>Personal</option>
            </select>
            <select data-search="walletKind">
              <option value="">Todos los movimientos</option>
              <option value="in" ${ctx.ui.search.walletKind === "in" ? "selected" : ""}>Entradas</option>
              <option value="out" ${ctx.ui.search.walletKind === "out" ? "selected" : ""}>Salidas</option>
              <option value="adjust" ${ctx.ui.search.walletKind === "adjust" ? "selected" : ""}>Ajustes</option>
            </select>
          </div>
        </div>
        <div class="entity-stack">
          ${movements.length ? movements.map(item => renderMovementCard(item, ctx)).join("") : '<div class="empty"><p>No hay movimientos en el monedero todavia.</p></div>'}
        </div>
      </section>
    </div>`;
  }

  global.AppUIViewWallet = { renderWalletView };
})(window);
