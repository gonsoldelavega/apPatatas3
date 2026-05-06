(function(global){

  function hubCard(kicker, text, target, tone){
    return `<button class="hub-card ${tone || ""}" data-view="${target}">
      <span class="hub-card-kicker">${kicker}</span>
      <strong>${text}</strong>
      <span class="hub-card-link">Abrir →</span>
    </button>`;
  }

  function renderSettingsView(ctx){
    return `<div class="view-stack workspace-stack">

      <!-- Accesos rápidos -->
      <div class="panel soft-block">
        <div class="panel-h"><div><h2>Accesos</h2></div></div>
        <div class="panel-b">
          <div class="hub-grid">
            ${hubCard("Clientes", `${ctx.state.clients.length} fichas`, "clients")}
            ${hubCard("Gestoría y estadísticas", "Exportaciones y resumen fiscal", "exports")}
            ${hubCard("Productos y proveedores", `${ctx.state.products.length} productos · ${ctx.state.suppliers.length} proveedores`, "catalog")}
            ${hubCard("Documentos escaneados", `${ctx.state.documents.length} archivos`, "operations")}
          </div>
        </div>
      </div>

      <div class="panel soft-block">
        <div class="panel-h">
          <div>
            <h2>Registro de compras</h2>
            <p>Importa en la app las facturas ya procesadas en el registro maestro.</p>
          </div>
        </div>
        <div class="panel-b">
          <div class="summary">
            <div class="summary-row"><span>Estado</span><strong>${ctx.state.settings.purchaseRegistryAutoSync === false ? "Desactivado" : "Activo"}</strong></div>
            <div class="summary-row"><span>Hoja</span><strong>${ctx.esc(ctx.state.settings.purchaseRegistrySheetName || "REGISTRO")}</strong></div>
          </div>
          <div class="actions section-actions" style="margin-top:14px;">
            <button class="primary" type="button" data-action="sync-purchase-registry">Sincronizar compras</button>
          </div>
        </div>
      </div>

      <!-- Configuración general colapsable -->
      <div class="panel soft-block">
        <details>
          <summary style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 20px;
            cursor: pointer;
            list-style: none;
            user-select: none;
          ">
            <div>
              <h2 style="margin:0;font-size:1rem;font-weight:600;">Configuración general</h2>
              <p style="margin:4px 0 0;color:var(--muted);font-size:.85rem;">Empresa, numeración, datos bancarios</p>
            </div>
            <span style="color:var(--muted);font-size:.85rem;" class="settings-toggle-icon">▼ Ver</span>
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
              <div class="field" style="grid-column:1/-1;"><button class="ghost" type="button" data-action="sync-purchase-registry">Sincronizar compras del registro</button></div>
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
              <span class="chip good">Sync Supabase</span>
              <span class="chip good">Escáner con IA</span>
              <span class="chip good">PDF</span>
              <span class="chip good">Exportación CSV y JSON</span>
              <span class="chip good">Google Drive</span>
            </div>
          </div>
          <p style="margin:14px 0 0;color:var(--muted);font-size:.88rem;line-height:1.55;">Los productos descuentan stock al facturarse y las compras lo incrementan. Los albaranes no afectan al stock. El backup JSON sirve como copia de seguridad completa.</p>
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
