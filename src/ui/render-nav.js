(function(global){

  const NAV_ICONS = {
    dashboard: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    billing: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    operations: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"/><path d="M6 3h12l1 4H5l1-4Z"/><path d="M5 7v13h14V7"/><path d="M9 11h6"/><path d="M9 15h6"/></svg>`,
    catalog: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    settings: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`
  };

  const VIEW_GROUPS = {
    dashboard: new Set(["dashboard"]),
    billing: new Set(["billing"]),
    operations: new Set(["operations"]),
    catalog: new Set(["catalog"]),
    settings: new Set(["settings", "clients", "wallet", "exports", "about"])
  };

  const NAV_ITEMS = [
    { id:"dashboard", label:"Inicio" },
    { id:"billing", label:"Facturas" },
    { id:"operations", label:"Gastos" },
    { id:"catalog", label:"Productos" },
    { id:"settings", label:"Otros" }
  ];

  function renderNav(target, ctx){
    target.removeAttribute("style");
    const activeNav = Object.keys(VIEW_GROUPS).find(key => VIEW_GROUPS[key].has(ctx.activeView)) || "dashboard";

    target.innerHTML = NAV_ITEMS.map(item => {
      const isActive = activeNav === item.id;
      return `<button type="button" data-view="${item.id}" class="${isActive ? "active" : ""}" aria-label="${item.label}" ${isActive ? 'aria-current="page"' : ""}>
        ${NAV_ICONS[item.id]}
        <span class="nav-label">${item.label}</span>
      </button>`;
    }).join("");

    target.querySelectorAll("[data-view]").forEach(btn =>
      btn.addEventListener("click", () => ctx.onSelect(btn.dataset.view))
    );
  }

  global.AppUIRenderNav = { renderNav };
})(window);
