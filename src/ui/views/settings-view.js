(function(global){

  function hubCard(kicker, text, target, tone){
    return `<button class="hub-card ${tone || ""}" data-view="${target}">
      <span class="hub-card-kicker">${kicker}</span>
      <strong>${text}</strong>
      <span class="hub-card-link">Abrir →</span>
    </button>`;
  }

  function actionCard(kicker, text, action, tone){
    return `<button class="hub-card ${tone || ""}" data-action="${action}">
      <span class="hub-card-kicker">${kicker}</span>
      <strong>${text}</strong>
      <span class="hub-card-link">Ejecutar →</span>
    </button>`;
  }

  function renderSettingsView(ctx){
    const pendingInvoices = (ctx.state.invoices || []).filter(invoice => ctx.invoicePaymentStatus(invoice) !== "paid").length;
    const currentMonth = ctx.today().slice(0, 7);
    const monthInvoices = (ctx.state.invoices || []).filter(invoice => String(invoice.issueDate || "").startsWith(currentMonth)).length;
    const themePref = (typeof window !== "undefined" && window.__factupapaTheme) ? window.__factupapaTheme.get() : "system";

    return `<div class="view-stack workspace-stack">

      <div class="workspace-hero settings-hero">
        <div class="workspace-hero-copy">
          <span class="eyebrow">Centro operativo</span>
          <h2>Todo lo importante, sin ruido técnico.</h2>
          <p>Accesos rápidos, clientes, productos, exportaciones y estado de sincronización.</p>
        </div>
        <div class="hero-mini-grid">
          <div class="mini-stat"><span>Facturas del mes</span><strong>${monthInvoices}</strong></div>
          <div class="mini-stat"><span>Pendientes de cobro</span><strong>${pendingInvoices}</strong></div>
        </div>
      </div>

      <div class="panel soft-block">
        <div class="panel-h"><div><h2>Accesos principales</h2><p>Gestión diaria de la app.</p></div></div>
        <div class="panel-b">
          <div class="hub-grid">
            ${hubCard("Clientes", `${ctx.state.clients.length} fichas`, "clients")}
            ${hubCard("Productos", `${ctx.state.products.length} productos · ${ctx.state.suppliers.length} proveedores`, "catalog")}
            ${hubCard("Gestoría", "Exportaciones, fiscalidad y backup", "exports")}
            ${hubCard("Compras y gastos", "Operativa, escáner y documentos", "operations")}
          </div>
        </div>
      </div>

      <div class="panel soft-block">
        <div class="panel-h"><div><h2>Apariencia</h2><p>Elige el tema de la app.</p></div></div>
        <div class="panel-b">
          <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button data-action="theme-system" class="${themePref === "system" ? "primary" : "ghost"}">🌓 Sistema</button>
            <button data-action="theme-light" class="${themePref === "light" ? "primary" : "ghost"}">☀️ Claro</button>
            <button data-action="theme-dark" class="${themePref === "dark" ? "primary" : "ghost"}">🌙 Oscuro</button>
          </div>
        </div>
      </div>

      <div class="panel soft-block">
        <div class="panel-h"><div><h2>Acciones útiles</h2><p>Procesos rápidos sin entrar en configuración técnica.</p></div></div>
        <div class="panel-b">
          <div class="hub-grid">
            ${actionCard("Sincronización", "Reparar datos locales desde Supabase", "repair-local-sync")}
            ${actionCard("Compras", "Sincronizar compras del registro", "sync-purchase-registry")}
          </div>
        </div>
      </div>

      <div class="panel soft-block">
        <details>
          <summary class="settings-diagnostic-summary">
            <div>
              <h2>Diagnóstico avanzado</h2>
              <p>Supabase, Drive, service worker, versión y siguiente numeración.</p>
            </div>
            <span class="chip">Ver estado</span>
          </summary>
          <div class="panel-b" style="border-top:1px solid var(--line);">
            <div class="summary">
              <div class="summary-row"><span>Version</span><strong>${ctx.esc(ctx.appVersion || "Sin version")}</strong></div>
              <div class="summary-row"><span>Ultimo commit</span><strong>${ctx.esc(ctx.appCommit || "No disponible en runtime")}</strong></div>
              <div class="summary-row"><span>Ultima sincronizacion</span><strong>${ctx.health?.lastSyncAt ? ctx.date(ctx.health.lastSyncAt) : "Sin dato"}</strong></div>
              <div class="summary-row"><span>Supabase</span><strong>${ctx.esc(ctx.health?.supabaseStatus || "Sin dato")}</strong></div>
              <div class="summary-row"><span>Google Drive</span><strong>${ctx.esc(ctx.health?.googleDriveStatus || "Sin conectar")}</strong></div>
              <div class="summary-row"><span>Service worker</span><strong>${ctx.esc(ctx.health?.serviceWorkerStatus || "Sin dato")}</strong></div>
              <div class="summary-row"><span>Modo PWA</span><strong>${ctx.esc(ctx.health?.pwaMode || "Navegador")}</strong></div>
              <div class="summary-row"><span>Siguiente factura</span><strong>${ctx.esc(ctx.health?.nextInvoiceNumber || "")}</strong></div>
              ${ctx.health?.syncDiscrepancy ? `<div class="summary-row"><span>Aviso</span><strong>${ctx.esc(ctx.health.syncDiscrepancy)}</strong></div>` : ""}
            </div>
          </div>
        </details>
      </div>

      <div class="panel soft-block">
        <details>
          <summary class="settings-diagnostic-summary">
            <div>
              <h2>Configuración general</h2>
              <p>Empresa, numeración, cuenta bancaria, Drive y registro de compras.</p>
            </div>
            <span class="chip">Editar</span>
          </summary>
          <div class="panel-b" style="border-top:1px solid var(--line);">
            <form id="settingsForm" class="sheet-grid">
              <div class="field"><label>Empresa</label><input name="companyName" value="${ctx.esc(ctx.state.settings.companyName)}"></div>
              <div class="field"><label>NIF</label><input name="companyNif" value="${ctx.esc(ctx.state.settings.companyNif)}"></div>
              <div class="field"><label>Dirección fiscal</label><input name="companyAddress" value="${ctx.esc(ctx.state.settings.companyAddress)}"></div>
              <div class="field"><label>Teléfono</label><input name="companyPhone" value="${ctx.esc(ctx.state.settings.companyPhone)}"></div>
              <div class="field"><label>Email</label><input name="companyEmail" value="${ctx.esc(ctx.state.settings.companyEmail)}"></div>
              <div class="field"><label>Prefijo factura</label><input name="invoicePrefix" value="${ctx.esc(ctx.state.settings.invoicePrefix)}"></div>
              <div class="field"><label>Año factura</label><input name="invoiceYear" type="number" value="${ctx.esc(ctx.state.settings.invoiceYear)}"></div>
              <div class="field"><label>Siguiente número</label><input name="nextInvoiceNumber" type="number" value="${ctx.esc(ctx.state.settings.nextInvoiceNumber)}"></div>
              <div class="field"><label>Titular cuenta</label><input name="accountHolder" value="${ctx.esc(ctx.state.settings.accountHolder)}"></div>
              <div class="field"><label>IBAN</label><input name="iban" value="${ctx.esc(ctx.state.settings.iban)}"></div>
              <div class="field"><label>Google OAuth Client ID</label><input name="driveClientId" value="${ctx.esc(ctx.state.settings.driveClientId || "")}" placeholder="Client ID para Drive"></div>
              <div class="field"><label>Carpeta raíz Drive</label><input name="driveRootFolderName" value="${ctx.esc(ctx.state.settings.driveRootFolderName || "apPatatas")}"></div>
              <div class="field"><label>PDF factura a Drive</label><select name="driveAutoUpload"><option value="false" ${ctx.state.settings.driveAutoUpload ? "" : "selected"}>No</option><option value="true" ${ctx.state.settings.driveAutoUpload ? "selected" : ""}>Sí</option></select></div>
              <div class="field"><label>Archivo datos Drive</label><input name="driveStateFileName" value="${ctx.esc(ctx.state.settings.driveStateFileName || "apPatatas-state.json")}"></div>
              <div class="field"><label>Sync automática Drive</label><select name="driveStateAutoSync"><option value="false" ${ctx.state.settings.driveStateAutoSync ? "" : "selected"}>No</option><option value="true" ${ctx.state.settings.driveStateAutoSync ? "selected" : ""}>Sí</option></select></div>
              <div class="field"><label>Compras desde registro</label><select name="purchaseRegistryAutoSync"><option value="true" ${ctx.state.settings.purchaseRegistryAutoSync === false ? "" : "selected"}>Si</option><option value="false" ${ctx.state.settings.purchaseRegistryAutoSync === false ? "selected" : ""}>No</option></select></div>
              <div class="field"><label>ID registro compras</label><input name="purchaseRegistrySpreadsheetId" value="${ctx.esc(ctx.state.settings.purchaseRegistrySpreadsheetId || "1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU")}"></div>
              <div class="field"><label>Hoja registro compras</label><input name="purchaseRegistrySheetName" value="${ctx.esc(ctx.state.settings.purchaseRegistrySheetName || "REGISTRO")}"></div>
              <div class="field" style="grid-column:1/-1;"><label>URL del agente (app web)</label><input name="purchaseRegistryWebAppUrl" value="${ctx.esc(ctx.state.settings.purchaseRegistryWebAppUrl || "")}" placeholder="https://script.google.com/macros/s/.../exec"></div>
              <div class="field" style="grid-column:1/-1;"><button class="primary" type="submit">Guardar ajustes</button></div>
            </form>
            <div class="actions section-actions" style="margin-top:14px;">
              <button class="warn" data-action="reset-storage">Reiniciar datos locales</button>
            </div>
          </div>
        </details>
      </div>

    </div>`;
  }

  function renderAboutView(){
    return `<div class="cards">
      <div class="panel">
        <div class="panel-h"><div><h2>Estado de la app</h2></div></div>
        <div class="panel-b">
          <div class="card">
            <div class="meta">
              <span class="chip good">Supabase</span>
              <span class="chip good">PDF</span>
              <span class="chip good">CSV/JSON</span>
              <span class="chip good">Google Drive</span>
              <span class="chip good">Registro de compras</span>
            </div>
          </div>
          <p style="margin:14px 0 0;color:var(--muted);font-size:.88rem;line-height:1.55;">Los productos descuentan stock al facturarse y las compras lo incrementan. Los albaranes no afectan al stock. El backup JSON sirve como copia de seguridad completa.</p>
          <p style="margin:10px 0 0;color:var(--muted-2);font-size:.78rem;">Versión: 2026-06-02d</p>
        </div>
      </div>
    </div>`;
  }

  function renderClientsView(ctx){
    const clients = ctx.state.clients.filter(p =>
      [p.name,p.phone,p.email,p.address].some(v =>
        String(v || "").toLowerCase().includes(ctx.ui.search.clients.toLowerCase())
      )
    );
    return `<div class="panel">
      <div class="panel-h">
        <div><h2>Clientes</h2></div>
        <div class="actions"><button class="primary" data-action="new-client">Nuevo</button></div>
      </div>
      <div class="panel-b">
        <div class="toolbar">
          <div class="search-row">
            <input placeholder="Buscar por nombre, teléfono, email..." value="${ctx.esc(ctx.ui.search.clients)}" data-search="clients">
          </div>
        </div>
        <div class="cards">
          ${clients.length
            ? clients.map(client => global.AppUICardClient.renderClientCard(client, ctx)).join("")
            : '<div class="empty"><p>No hay clientes que coincidan.</p></div>'
          }
        </div>
      </div>
    </div>`;
  }

  global.AppUIViewSettings = { renderSettingsView, renderAboutView, renderClientsView };
})(window);
