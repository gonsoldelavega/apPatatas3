(function(global){
  function renderNav(target, ctx){
    target.style.background = "#FFFFFF";
    target.style.borderBottom = "1px solid #DCE8DC";
    target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)";
    const viewGroups = {
      dashboard: new Set(["dashboard"]),
      billing: new Set(["billing"]),
      operations: new Set(["operations"]),
      wallet: new Set(["wallet"]),
      scanner: new Set(["scanner"]),
      catalog: new Set(["catalog"]),
      settings: new Set(["settings","clients","exports","about"])
    };
    const activeNav = Object.keys(viewGroups).find(key => viewGroups[key].has(ctx.activeView)) || "dashboard";
    const items = [
      { id:"dashboard", label:"INICIO" },
      { id:"billing", label:"FACTURAS" },
      { id:"operations", label:"GASTOS" },
      { id:"wallet", label:"MONEDERO" },
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
