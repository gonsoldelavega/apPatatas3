(function(global){
  function viewWrap(activeView, id, html){
    return `<section class="view ${activeView === id ? "active" : ""}" id="view-${id}">${html}</section>`;
  }

  function subviewShell(label, backView, html){
    return `<div class="view-stack">
      <div class="subview-bar">
        <button class="ghost subview-back" data-view="${backView}">Volver</button>
        <span class="chip">${label}</span>
      </div>
      ${html}
    </div>`;
  }

  function renderViews(target, ctx){
    target.innerHTML = [
      viewWrap(ctx.ui.activeView, "dashboard", global.AppUIViewDashboard.renderDashboardView(ctx)),
      viewWrap(ctx.ui.activeView, "billing", global.AppUIViewBilling.renderBillingView(ctx)),
      viewWrap(ctx.ui.activeView, "operations", global.AppUIViewOperations.renderOperationsView(ctx)),
      viewWrap(ctx.ui.activeView, "scanner", global.AppUIViewScannerWorkspace.renderScannerWorkspaceView(ctx)),
      viewWrap(ctx.ui.activeView, "catalog", global.AppUIViewCatalog.renderCatalogView(ctx)),
      viewWrap(ctx.ui.activeView, "settings", global.AppUIViewSettings.renderSettingsView(ctx)),
      viewWrap(ctx.ui.activeView, "clients", subviewShell("Clientes", "settings", global.AppUIViewSettings.renderClientsView(ctx))),
      viewWrap(ctx.ui.activeView, "exports", subviewShell("Gestoria", "settings", global.AppUIViewExports.renderExportsView(ctx))),
      viewWrap(ctx.ui.activeView, "about", subviewShell("Informacion", "settings", global.AppUIViewSettings.renderAboutView(ctx)))
    ].join("");
  }

  global.AppUIRenderViews = { renderViews };
})(window);
