(function(global){

  const NAV_ICONS = {
    dashboard:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    billing:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    operations: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    wallet:     `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
    scanner:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    catalog:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    settings:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  };

  const VIEW_GROUPS = {
    dashboard:  new Set(["dashboard"]),
    billing:    new Set(["billing"]),
    operations: new Set(["operations"]),
    wallet:     new Set(["wallet"]),
    scanner:    new Set(["scanner"]),
    catalog:    new Set(["catalog"]),
    settings:   new Set(["settings","clients","exports","about"])
  };

  const NAV_ITEMS = [
    { id:"dashboard",  label:"Inicio" },
    { id:"billing",    label:"Facturas" },
    { id:"operations", label:"Gastos" },
    { id:"wallet",     label:"Caja" },
    { id:"scanner",    label:"Escaner" },
    { id:"catalog",    label:"Productos" },
    { id:"settings",   label:"Mas" }
  ];

  function renderNav(target, ctx){
    const activeNav = Object.keys(VIEW_GROUPS).find(key => VIEW_GROUPS[key].has(ctx.activeView)) || "dashboard";

    Object.assign(target.style, {
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "100",
      display: "flex",
      alignItems: "stretch",
      justifyContent: "space-around",
      padding: "0",
      margin: "0",
      background: "rgba(28,20,16,.97)",
      borderTop: "1px solid rgba(255,255,255,.07)",
      borderRadius: "0",
      boxShadow: "0 -4px 24px rgba(26,15,8,.28)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      height: "calc(60px + env(safe-area-inset-bottom, 0px))",
      paddingBottom: "env(safe-area-inset-bottom, 0px)"
    });

    target.innerHTML = NAV_ITEMS.map(item => {
      const isActive = activeNav === item.id;
      return `
        <button
          data-view="${item.id}"
          style="
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            min-height: 60px;
            padding: 8px 4px 6px;
            background: transparent;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            cursor: pointer;
            color: ${isActive ? "#F2C4A0" : "rgba(253,248,240,.60)"};
            transition: color .18s ease, opacity .18s ease;
            position: relative;
          "
        >
          ${isActive ? `<span style="
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 28px;
            height: 2px;
            border-radius: 0 0 2px 2px;
            background: #C4602A;
          "></span>` : ""}
          <span style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            opacity: ${isActive ? "1" : "0.72"};
            transform: scale(1);
            transition: opacity .18s ease;
          ">${NAV_ICONS[item.id]}</span>
          <span style="
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: .04em;
            text-transform: uppercase;
            line-height: 1;
            min-height: 10px;
            font-family: 'DM Sans', system-ui, sans-serif;
            opacity: ${isActive ? "1" : "0.72"};
          ">${item.label}</span>
        </button>
      `;
    }).join("");

    target.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => ctx.onSelect(btn.dataset.view)));
  }

  global.AppUIRenderNav = { renderNav };
})(window);
