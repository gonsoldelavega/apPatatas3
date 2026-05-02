(function(global){
  function hubCard(kicker, text, target, tone){
    return `<button class="hub-card ${tone || ""}" data-view="${target}">
      <span class="hub-card-kicker">${kicker}</span>
      <strong>${text}</strong>
      <span class="hub-card-link">Abrir</span>
    </button>`;
  }

  function renderSettingsView(ctx){
    return `<div class="view-stack workspace-stack">
      <section class="workspace-hero settings-hero">
        <div class="workspace-hero-copy">
          <span class="eyebrow">Otros</span>
          <h2>Todo lo secundario, importante y ordenado en un solo sitio.</h2>
          <p>Aqui quedan clientes, copias, informacion general y ajustes de la empresa sin mezclarlo con la operativa principal del dia.</p>
        </div>
      </section>

      <div class="panel soft-block">
        <div class="panel-h">
          <div>
            <h2>Accesos</h2>
            <div class="sub">Entradas rapidas para gestion, seguridad y configuracion</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="hub-grid">
            ${hubCard("Gestoria", "Resumen fiscal, estadisticas y exportaciones", "exports")}
            ${hubCard("Clientes", `${ctx.state.clients.length} fichas listas para facturar`, "clients")}
            ${hubCard("Productos y proveedores", `${ctx.state.products.length} productos y ${ctx.state.suppliers.length} proveedores`, "catalog")}
            ${hubCard("Documentos", `${ctx.state.documents.length} archivos guardados`, "operations")}
            ${hubCard("Informacion", "Estado general de la base y notas de uso", "about", "muted")}
          </div>
        </div>
      </div>

      <div class="panel soft-block">
        <div class="panel-h">
          <div>
            <h2>Configuracion general</h2>
            <div class="sub">Recogida por defecto para no cargar la vista principal</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="summary">
            <div class="summary-row"><span>Empresa</span><strong>${ctx.esc(ctx.state.settings.companyName || "-")}</strong></div>
            <div class="summary-row"><span>Numeracion</span><strong>${ctx.esc(ctx.state.settings.invoicePrefix || "FAC")} · ${ctx.esc(String(ctx.state.settings.nextInvoiceNumber || ""))}</strong></div>
            <div class="summary-row"><span>Drive</span><strong>${ctx.state.settings.driveRootFolderName ? ctx.esc(ctx.state.settings.driveRootFolderName) : "Sin carpeta"}</strong></div>
          </div>
          <details style="margin-top:16px;">
            <summary style="cursor:pointer;font-weight:700;color:var(--text);">Modificar configuracion general</summary>
            <form id="settingsForm" class="sheet-grid" style="margin-top:16px;">
              <div class="field"><label>Empresa</label><input name="companyName" value="${ctx.esc(ctx.state.settings.companyName)}"></div>
              <div class="field"><label>NIF</label><input name="companyNif" value="${ctx.esc(ctx.state.settings.companyNif)}"></div>
              <div class="field"><label>Direccion fiscal</label><input name="companyAddress" value="${ctx.esc(ctx.state.settings.companyAddress)}"></div>
              <div class="field"><label>Telefono</label><input name="companyPhone" value="${ctx.esc(ctx.state.settings.companyPhone)}"></div>
              <div class="field"><label>Email</label><input name="companyEmail" value="${ctx.esc(ctx.state.settings.companyEmail)}"></div>
              <div class="field"><label>Prefijo factura</label><input name="invoicePrefix" value="${ctx.esc(ctx.state.settings.invoicePrefix)}"></div>
              <div class="field"><label>Ano factura</label><input name="invoiceYear" type="number" value="${ctx.esc(ctx.state.settings.invoiceYear)}"></div>
              <div class="field"><label>Siguiente numero</label><input name="nextInvoiceNumber" type="number" value="${ctx.esc(ctx.state.settings.nextInvoiceNumber)}"></div>
              <div class="field"><label>Titular cuenta</label><input name="accountHolder" value="${ctx.esc(ctx.state.settings.accountHolder)}"></div>
              <div class="field"><label>IBAN</label><input name="iban" value="${ctx.esc(ctx.state.settings.iban)}"></div>
              <div class="field"><label>ID dispositivo</label><input name="deviceId" value="${ctx.esc(ctx.state.settings.deviceId || "")}"></div>
              <div class="field"><label>Google OAuth Client ID</label><input name="driveClientId" value="${ctx.esc(ctx.state.settings.driveClientId || "")}" placeholder="Pega tu Client ID web para Drive"></div>
              <div class="field"><label>Carpeta raiz Drive</label><input name="driveRootFolderName" value="${ctx.esc(ctx.state.settings.driveRootFolderName || "apPatatas")}"></div>
              <div class="field"><label>PDF factura a Drive</label><select name="driveAutoUpload"><option value="false" ${ctx.state.settings.driveAutoUpload ? "" : "selected"}>No</option><option value="true" ${ctx.state.settings.driveAutoUpload ? "selected" : ""}>Si</option></select></div>
              <div class="field"><label>Archivo datos Drive</label><input name="driveStateFileName" value="${ctx.esc(ctx.state.settings.driveStateFileName || "apPatatas-state.json")}"></div>
              <div class="field"><label>Sincronizacion automatica datos Drive</label><select name="driveStateAutoSync"><option value="false" ${ctx.state.settings.driveStateAutoSync ? "" : "selected"}>No</option><option value="true" ${ctx.state.settings.driveStateAutoSync ? "selected" : ""}>Si</option></select></div>
              <div class="field" style="grid-column:1/-1;"><button class="primary" type="submit">Guardar ajustes</button></div>
            </form>
          </details>
          <div class="summary" style="margin-top:16px;">
            <div class="summary-row"><span>OCR Anthropic</span><strong>Gestionado en servidor</strong></div>
            <div class="hint">La clave de Anthropic ya no depende del dispositivo. Se usa desde las variables de entorno del backend.</div>
          </div>
          <div class="actions section-actions"><button class="warn" data-action="reset-storage">Reiniciar datos locales</button></div>
        </div>
      </div>
    </div>`;
  }

  function renderAboutView(){
    return `<div class="cards">
      <div class="panel">
        <div class="panel-h">
          <div>
            <h2>Base lista para crecer</h2>
            <div class="sub">App instalada, sincronizacion ligera y archivo documental en una sola base</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="card">
            <div class="meta">
              <span class="chip good">Sync compartida</span>
              <span class="chip good">Escaner con OCR</span>
              <span class="chip good">PDF</span>
              <span class="chip good">Exportacion CSV y JSON</span>
              <span class="chip good">Google Drive preparado</span>
            </div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h">
          <div>
            <h2>Notas de uso</h2>
            <div class="sub">Pensada para trabajar desde movil con una interfaz mas limpia y menos tecnica</div>
          </div>
        </div>
        <div class="panel-b">
          <div class="card">
            <p style="margin:0;color:var(--muted)">Los productos descuentan stock al facturarse y las compras lo incrementan. Los albaranes no afectan al stock. La exportacion JSON sirve como copia de seguridad completa y tambien como base para migrar a una capa online mas avanzada.</p>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderClientsView(ctx){
    const clients = ctx.state.clients.filter(p => [p.name,p.phone,p.email,p.address].some(v => String(v || "").toLowerCase().includes(ctx.ui.search.clients.toLowerCase())));
    return `<div class="panel"><div class="panel-h"><div><h2>Clientes</h2><div class="sub">Ficha editable, deuda manual y acceso rapido a facturas</div></div><div class="actions"><button class="primary" data-action="new-client">Nuevo cliente</button></div></div><div class="panel-b"><div class="toolbar"><div class="search-row"><input placeholder="Buscar por nombre, telefono, email o direccion" value="${ctx.esc(ctx.ui.search.clients)}" data-search="clients"></div></div><div class="cards">${clients.length ? clients.map(client => global.AppUICardClient.renderClientCard(client, ctx)).join("") : '<div class="empty"><p>No hay clientes que coincidan con la busqueda.</p></div>'}</div></div></div>`;
  }

  global.AppUIViewSettings = { renderSettingsView, renderAboutView, renderClientsView };
})(window);
