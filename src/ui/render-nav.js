(function(global){

  const NAV_ICONS = {
    dashboard:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    billing:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    operations: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    wallet:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    scanner:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    catalog:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    settings:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
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
    { id:"dashboard",  label:"Inicio"    },
    { id:"billing",    label:"Facturas"  },
    { id:"operations", label:"Gastos"    },
    { id:"wallet",     label:"Caja"      },
    { id:"scanner",    label:"Escáner"   },
    { id:"catalog",    label:"Productos" },
    { id:"settings",   label:"Más"       }
  ];

  function injectNavStyles(){
    if(document.getElementById("nav-styles")) return;
    const style = document.createElement("style");
    style.id = "nav-styles";
    style.textContent = `
      #tabs {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        top: auto !important;
        z-index: 100 !important;
        display: flex !important;
        align-items: stretch !important;
        justify-content: space-around !important;
        gap: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        border-radius: 0 !important;
        background: rgba(28,20,16,.97) !important;
        border: 0 !important;
        border-top: 1px solid rgba(255,255,255,.07) !important;
        box-shadow: 0 -4px 24px rgba(26,15,8,.28) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        height: calc(60px + env(safe-area-inset-bottom, 0px)) !important;
        padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        overflow: hidden !important;
      }
      #tabs button {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 3px !important;
        padding: 8px 2px 6px !important;
        min-height: unset !important;
        height: 60px !important;
        background: transparent !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        color: rgba(253,248,240,.38) !important;
        cursor: pointer !important;
        position: relative !important;
        transition: color .18s ease !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      #tabs button.active { color: #F2C4A0 !important; }
      #tabs button.active::before {
        content: '';
        position: absolute;
        top: 0; left: 50%;
        transform: translateX(-50%);
        width: 24px; height: 2px;
        border-radius: 0 0 3px 3px;
        background: #C4602A;
      }
      #tabs button svg {
        width: 20px; height: 20px;
        opacity: .42; flex-shrink: 0;
        transition: opacity .18s ease, transform .18s ease;
      }
      #tabs button.active svg { opacity: 1; transform: scale(1.1); }
      #tabs .nav-label {
        font-size: 9px !important;
        font-weight: 600 !important;
        letter-spacing: .05em !important;
        text-transform: uppercase !important;
        line-height: 1 !important;
        font-family: system-ui, sans-serif !important;
        white-space: nowrap !important;
      }
      .app {
        padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function renderNav(target, ctx){
    injectNavStyles();
    target.removeAttribute("style");
    const activeNav = Object.keys(VIEW_GROUPS).find(k => VIEW_GROUPS[k].has(ctx.activeView)) || "dashboard";
    target.innerHTML = NAV_ITEMS.map(item => {
      const isActive = activeNav === item.id;
      return `<button data-view="${item.id}" class="${isActive ? "active" : ""}" aria-label="${item.label}">
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
