(function(global){
  function renderNav(target, ctx){
    const viewGroups = {
      dashboard: new Set(["dashboard"]),
      billing: new Set(["billing"]),
      operations: new Set(["operations"]),
      scanner: new Set(["scanner"]),
      catalog: new Set(["catalog"]),
      settings: new Set(["settings","clients","exports","about"])
    };
    const activeNav = Object.keys(viewGroups).find(key => viewGroups[key].has(ctx.activeView)) || "dashboard";
    const items = [
      { id:"dashboard", label:"INICIO" },
      { id:"billing", label:"FACTURAS" },
      { id:"operations", label:"GASTOS" },
      { id:"scanner", label:"ESCANER" },
      { id:"catalog", label:"PRODUCTOS" },
      { id:"settings", label:"OTROS" }
    ];
    target.innerHTML = items.map(item => `
      <button class="${activeNav === item.id ? "active" : ""}" data-view="${item.id}">
        <span class="nav-label">${item.label}</span>
      </button>
    `).join("");
    target.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => ctx.onSelect(btn.dataset.view)));
  }

  global.AppUIRenderNav = { renderNav };
})(window);
