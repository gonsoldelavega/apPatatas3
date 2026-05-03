(function(global){

  function getPrevMonths(todayStr, count){
    const months = [];
    let [y, m] = todayStr.slice(0,7).split("-").map(Number);
    for(let i = 0; i < count; i++){
      months.push(`${y}-${String(m).padStart(2,"0")}`);
      m--;
      if(m === 0){ m = 12; y--; }
    }
    return months;
  }

  function monthLabel(key){
    const [y, m] = key.split("-");
    const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${names[parseInt(m,10)-1]} ${y}`;
  }

  function renderExportsView(ctx){
    const today = ctx.today();
    const months = getPrevMonths(today, 6);

    /* ── Balance mensual histórico ── */
    const monthlyRows = months.map(month => {
      const revenue  = ctx.state.invoices.filter(x => (x.issueDate||x.date||"").slice(0,7)===month).reduce((s,x)=>s+ctx.invoiceTotals(x).total,0);
      const expenses = ctx.state.expenses.filter(x=>(x.date||"").slice(0,7)===month).reduce((s,x)=>s+ctx.expenseTotal(x),0);
      const purchases= ctx.state.purchases.filter(x=>(x.date||"").slice(0,7)===month).reduce((s,x)=>s+ctx.purchaseTotal(x),0);
      const balance  = revenue - expenses - purchases;
      return { month, revenue, expenses, purchases, balance };
    });

    /* ── Estadísticas por cliente ── */
    const clientStats = {};
    ctx.state.invoices.forEach(inv => {
      const id = inv.clientId;
      if(!id) return;
      if(!clientStats[id]) clientStats[id] = { invoices:0, total:0 };
      clientStats[id].invoices++;
      clientStats[id].total += ctx.invoiceTotals(inv).total;
    });
    const topClients = Object.entries(clientStats)
      .sort((a,b) => b[1].total - a[1].total)
      .slice(0, 6)
      .map(([id, stats]) => ({ client: ctx.getClient(id), ...stats }))
      .filter(x => x.client);

    /* ── Días que más se vende ── */
    const dayCount = [0,0,0,0,0,0,0];
    const dayTotal = [0,0,0,0,0,0,0];
    ctx.state.invoices.forEach(inv => {
      const d = new Date(inv.issueDate || inv.date || "");
      if(!isNaN(d)){
        const dow = d.getDay();
        dayCount[dow]++;
        dayTotal[dow] += ctx.invoiceTotals(inv).total;
      }
    });
    const dayNames = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    const maxDayTotal = Math.max(...dayTotal, 1);

    return `<div class="view-stack workspace-stack">

      <!-- Balance mensual histórico -->
      <section class="dashboard-block soft-block">
        <div class="section-title" style="margin-bottom:16px;">
          <h3>Balance por mes</h3>
        </div>
        <div style="display:grid;gap:10px;">
          ${monthlyRows.map(row => `
            <div style="
              display:grid;
              grid-template-columns:80px 1fr 1fr 1fr 90px;
              gap:8px;
              align-items:center;
              padding:12px 14px;
              border-radius:10px;
              background:var(--panel);
              border:1px solid var(--line);
              font-size:.85rem;
            ">
              <span style="font-weight:700;color:var(--text);">${monthLabel(row.month)}</span>
              <span style="color:var(--olive);">↑ ${ctx.money(row.revenue)}</span>
              <span style="color:var(--muted);">Compras: ${ctx.money(row.purchases)}</span>
              <span style="color:var(--muted);">Gastos: ${ctx.money(row.expenses)}</span>
              <span style="
                font-weight:700;
                text-align:right;
                color:${row.balance>=0?"var(--olive)":"var(--danger)"};
              ">${ctx.money(row.balance)}</span>
            </div>
          `).join("")}
        </div>
      </section>

      <!-- Estadísticas por cliente -->
      <section class="dashboard-block soft-block">
        <div class="section-title" style="margin-bottom:16px;">
          <h3>Clientes — ranking de facturación</h3>
        </div>
        ${topClients.length ? `
          <div style="display:grid;gap:8px;">
            ${topClients.map((row, i) => `
              <div style="
                display:grid;
                grid-template-columns:28px 1fr auto auto;
                gap:10px;
                align-items:center;
                padding:12px 14px;
                border-radius:10px;
                background:var(--panel);
                border:1px solid var(--line);
              ">
                <span style="color:var(--muted);font-size:.8rem;font-weight:700;">${i+1}</span>
                <span style="font-weight:600;font-size:.92rem;">${ctx.esc(row.client.name)}</span>
                <span class="chip">${row.invoices} factura${row.invoices>1?"s":""}</span>
                <span style="font-weight:700;color:var(--accent);">${ctx.money(row.total)}</span>
              </div>
            `).join("")}
          </div>
        ` : '<div class="empty"><p>Sin datos de clientes todavía.</p></div>'}
      </section>

      <!-- Días que más se vende -->
      <section class="dashboard-block soft-block">
        <div class="section-title" style="margin-bottom:16px;">
          <h3>Días con más actividad</h3>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:110px;">
          ${dayNames.map((name, i) => {
            const pct = Math.round((dayTotal[i]/maxDayTotal)*100);
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">
              <span style="font-size:.68rem;color:var(--muted);font-weight:600;">${ctx.money(dayTotal[i]).replace("€","").trim()}</span>
              <div style="
                width:100%;
                height:${Math.max(pct,4)}%;
                border-radius:4px 4px 0 0;
                background:${pct===100?"var(--accent)":"rgba(196,96,42,.35)"};
                transition:height .4s ease;
              "></div>
              <span style="font-size:.72rem;font-weight:700;color:${pct===100?"var(--accent)":"var(--muted)"};">${name}</span>
            </div>`;
          }).join("")}
        </div>
      </section>

      <!-- Exportaciones para gestoría -->
      <section class="dashboard-block soft-block">
        <div class="section-title" style="margin-bottom:16px;">
          <h3>Exportar para gestoría</h3>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="primary" data-action="export-csv" data-kind="invoices">📄 CSV Facturas</button>
          <button class="primary" data-action="export-csv" data-kind="purchases">📦 CSV Compras</button>
          <button class="primary" data-action="export-csv" data-kind="expenses">💸 CSV Gastos</button>
          <button class="primary" data-action="export-csv" data-kind="deliveryNotes">🚚 CSV Albaranes</button>
          <button data-action="export-json" style="grid-column:1/-1;">💾 Backup JSON completo</button>
          <button class="warn" data-action="import-json" style="grid-column:1/-1;">📥 Importar JSON</button>
        </div>
      </section>

      <!-- Totales rápidos -->
      <section class="dashboard-block soft-block">
        <div class="section-title"><h3>Totales globales</h3></div>
        <div class="balance-focus-grid">
          <div class="mini-stat">
            <span>Facturas</span>
            <strong>${ctx.state.invoices.length}</strong>
          </div>
          <div class="mini-stat">
            <span>Facturado total</span>
            <strong>${ctx.money(ctx.state.invoices.reduce((s,x)=>s+ctx.invoiceTotals(x).total,0))}</strong>
          </div>
          <div class="mini-stat">
            <span>Compras</span>
            <strong>${ctx.money(ctx.state.purchases.reduce((s,x)=>s+ctx.purchaseTotal(x),0))}</strong>
          </div>
          <div class="mini-stat accent-stat">
            <span>Gastos</span>
            <strong>${ctx.money(ctx.state.expenses.reduce((s,x)=>s+ctx.expenseTotal(x),0))}</strong>
          </div>
        </div>
      </section>

    </div>`;
  }

  global.AppUIViewExports = { renderExportsView };
})(window);
