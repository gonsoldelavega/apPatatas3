(function(global){
  function renderExportsView(ctx){
    const invoices = ctx.state.invoices.slice();
    const months = Array.from(new Set([
      ...ctx.state.invoices.map(x => ctx.monthKey(x.issueDate)),
      ...ctx.state.expenses.map(x => ctx.monthKey(x.date)),
      ...ctx.state.purchases.map(x => ctx.monthKey(x.date))
    ].filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a)));

    const monthCards = months.map(month => {
      const revenue = ctx.state.invoices.filter(x => ctx.monthKey(x.issueDate) === month).reduce((sum, item) => sum + ctx.invoiceTotals(item).total, 0);
      const purchases = ctx.state.purchases.filter(x => ctx.monthKey(x.date) === month).reduce((sum, item) => sum + ctx.purchaseTotal(item), 0);
      const expenses = ctx.state.expenses.filter(x => ctx.monthKey(x.date) === month).reduce((sum, item) => sum + ctx.expenseTotal(item), 0);
      const balance = revenue - purchases - expenses;
      return `
        <article class="kpi-card">
          <span>${ctx.esc(ctx.formatMonthLabel(month))}</span>
          <strong>${ctx.money(balance)}</strong>
          <div class="meta">
            <span>Ingresos ${ctx.money(revenue)}</span>
            <span>Compras ${ctx.money(purchases)}</span>
            <span>Gastos ${ctx.money(expenses)}</span>
          </div>
        </article>
      `;
    }).join("");

    const clientStats = ctx.state.clients.map(client => {
      const clientInvoices = invoices.filter(invoice => invoice.clientId === client.id);
      const total = clientInvoices.reduce((sum, invoice) => sum + ctx.invoiceTotals(invoice).total, 0);
      return { client, count: clientInvoices.length, total };
    }).filter(item => item.count > 0).sort((a, b) => b.total - a.total).slice(0, 8);

    const weekdayNames = ["Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"];
    const weekdayStats = weekdayNames.map((name, index) => {
      const items = invoices.filter(invoice => {
        if(!invoice.issueDate) return false;
        const date = new Date(`${invoice.issueDate}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date.getDay() === index;
      });
      return {
        name,
        count: items.length,
        total: items.reduce((sum, invoice) => sum + ctx.invoiceTotals(invoice).total, 0)
      };
    }).sort((a, b) => b.total - a.total);

    return `<div class="cards">
      <div class="panel">
        <div class="panel-h">
          <div>
            <h2>Gestoria</h2>
            <div class="sub">Resumen fiscal, balances por mes y patrones de venta</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="cards">${monthCards || '<div class="empty"><p>No hay meses con actividad todavia.</p></div>'}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-h">
          <div>
            <h2>Pedidos por cliente</h2>
            <div class="sub">Quien compra mas y cuantas facturas acumula</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="dashboard-list">
            ${clientStats.length ? clientStats.map(item => `
              <article class="list-row">
                <div class="list-row-top">
                  <div>
                    <h3 class="list-row-title">${ctx.esc(item.client.name || "Cliente")}</h3>
                    <p class="list-row-sub">${item.count} factura(s)</p>
                  </div>
                  <div class="price">${ctx.money(item.total)}</div>
                </div>
              </article>
            `).join("") : '<div class="empty"><p>Todavia no hay estadisticas por cliente.</p></div>'}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-h">
          <div>
            <h2>Dias con mas venta</h2>
            <div class="sub">Ordenados por importe facturado</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="dashboard-list">
            ${weekdayStats.map(item => `
              <article class="list-row">
                <div class="list-row-top">
                  <div>
                    <h3 class="list-row-title">${item.name}</h3>
                    <p class="list-row-sub">${item.count} factura(s)</p>
                  </div>
                  <div class="price">${ctx.money(item.total)}</div>
                </div>
              </article>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-h">
          <div>
            <h2>Exportaciones y backup</h2>
            <div class="sub">Archivos listos para gestoria, copias y restauracion</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="actions">
            <button class="primary" data-action="export-csv" data-kind="invoices">CSV facturas</button>
            <button class="primary" data-action="export-csv" data-kind="purchases">CSV compras</button>
            <button class="primary" data-action="export-csv" data-kind="expenses">CSV gastos</button>
            <button class="primary" data-action="export-csv" data-kind="deliveryNotes">CSV albaranes</button>
            <button class="primary" data-action="export-csv" data-kind="documents">CSV documentos</button>
            <button data-action="export-json">Backup JSON</button>
            <button class="warn" data-action="import-json">Importar JSON</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  global.AppUIViewExports = { renderExportsView };
})(window);
