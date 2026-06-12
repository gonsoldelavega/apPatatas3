(function(global){

  const NAV_ICONS = {
    dashboard:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    billing:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    operations: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    catalog:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    settings:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 0 1 22 7.17l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    plus: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
  };

  const VIEW_GROUPS = {
    dashboard:  new Set(["dashboard"]),
    billing:    new Set(["billing"]),
    operations: new Set(["operations","wallet","exports"]),
    catalog:    new Set(["catalog","clients"]),
    settings:   new Set(["settings","about"])
  };

  const NAV_ITEMS = [
    { id:"dashboard",  label:"Inicio"    },
    { id:"billing",    label:"Facturas"  },
    { id:"action",     label:"Crear", action:true },
    { id:"catalog",    label:"Catálogo"  },
    { id:"settings",   label:"Más"       }
  ];

  function injectNavStyles(){
    if(document.getElementById("nav-studio-styles")) return;
    const style = document.createElement("style");
    style.id = "nav-studio-styles";
    style.textContent = `
      #tabs {
        position: fixed !important;
        left: 16px !important;
        right: 16px !important;
        bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
        top: auto !important;
        z-index: 100 !important;
        display: grid !important;
        grid-template-columns: 1fr 1fr 74px 1fr 1fr !important;
        align-items: center !important;
        gap: 4px !important;
        height: 76px !important;
        padding: 9px 10px !important;
        margin: 0 !important;
        border-radius: 28px !important;
        background: rgba(13,27,21,.93) !important;
        border: 1px solid rgba(255,255,255,.10) !important;
        box-shadow: 0 22px 60px rgba(8,18,14,.40), inset 0 1px 0 rgba(255,255,255,.08) !important;
        backdrop-filter: blur(24px) saturate(1.25) !important;
        -webkit-backdrop-filter: blur(24px) saturate(1.25) !important;
        overflow: visible !important;
      }
      #tabs::before {
        content: '';
        position: absolute;
        inset: 1px;
        border-radius: 27px;
        background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0));
        pointer-events: none;
      }
      #tabs button {
        min-width: 0 !important;
        width: auto !important;
        min-height: 0 !important;
        height: 58px !important;
        padding: 7px 4px !important;
        border: 0 !important;
        border-radius: 20px !important;
        background: transparent !important;
        box-shadow: none !important;
        color: rgba(247,250,252,.48) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        position: relative !important;
        cursor: pointer !important;
        -webkit-tap-highlight-color: transparent !important;
        transition: color .18s ease, background .18s ease, transform .18s ease !important;
      }
      #tabs button svg {
        width: 21px !important;
        height: 21px !important;
        opacity: .78 !important;
        transition: transform .18s ease, opacity .18s ease !important;
      }
      #tabs button .nav-label {
        font-size: 10px !important;
        font-weight: 800 !important;
        letter-spacing: .02em !important;
        text-transform: none !important;
        line-height: 1 !important;
        white-space: nowrap !important;
      }
      #tabs button.active:not(.nav-action) {
        color: #FFFFFF !important;
        background: rgba(255,255,255,.08) !important;
      }
      #tabs button.active:not(.nav-action)::after {
        content: '';
        position: absolute;
        bottom: 4px;
        left: 50%;
        width: 4px;
        height: 4px;
        border-radius: 999px;
        transform: translateX(-50%);
        background: #D8B26B;
        box-shadow: 0 0 0 4px rgba(216,178,107,.12);
      }
      #tabs button.active:not(.nav-action) svg { opacity: 1 !important; transform: translateY(-1px) !important; }
      #tabs button:hover:not(.nav-action),
      #tabs button:focus-visible:not(.nav-action) {
        color: #FFFFFF !important;
        background: rgba(255,255,255,.075) !important;
      }
      #tabs .nav-action {
        width: 68px !important;
        height: 68px !important;
        min-width: 68px !important;
        min-height: 68px !important;
        padding: 0 !important;
        border-radius: 26px !important;
        transform: translateY(-20px) !important;
        color: #122B21 !important;
        background: linear-gradient(145deg,#F1D18D 0%,#D8B26B 38%,#B98A42 100%) !important;
        box-shadow: 0 18px 38px rgba(185,138,66,.38), inset 0 1px 0 rgba(255,255,255,.55) !important;
        border: 1px solid rgba(255,255,255,.28) !important;
      }
      #tabs .nav-action::before {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 32px;
        background: rgba(216,178,107,.13);
        z-index: -1;
      }
      #tabs .nav-action svg {
        width: 31px !important;
        height: 31px !important;
        opacity: 1 !important;
      }
      #tabs .nav-action .nav-label {
        display: none !important;
      }
      #tabs .nav-action:active {
        transform: translateY(-18px) scale(.96) !important;
      }
      .app {
        padding-bottom: calc(112px + env(safe-area-inset-bottom, 0px)) !important;
      }
      @media (min-width: 760px){
        #tabs {
          left: 50% !important;
          right: auto !important;
          bottom: 18px !important;
          width: min(620px, calc(100vw - 40px)) !important;
          transform: translateX(-50%) !important;
          top: auto !important;
          position: fixed !important;
        }
      }
      @media (max-width: 390px){
        #tabs { left: 10px !important; right: 10px !important; grid-template-columns: 1fr 1fr 66px 1fr 1fr !important; }
        #tabs .nav-action { width: 62px !important; height: 62px !important; min-width: 62px !important; min-height: 62px !important; }
        #tabs button .nav-label { font-size: 9px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderNav(target, ctx){
    injectNavStyles();
    target.removeAttribute("style");
    const activeNav = Object.keys(VIEW_GROUPS).find(k => VIEW_GROUPS[k].has(ctx.activeView)) || "dashboard";
    target.innerHTML = NAV_ITEMS.map(item => {
      if(item.action){
        return `<button type="button" data-action="open-action-sheet" class="nav-action" aria-label="Crear nuevo">
          ${NAV_ICONS.plus}
          <span class="nav-label">${item.label}</span>
        </button>`;
      }
      const isActive = activeNav === item.id;
      return `<button type="button" data-view="${item.id}" class="${isActive ? "active" : ""}" aria-label="${item.label}">
        ${NAV_ICONS[item.id]}
        <span class="nav-label">${item.label}</span>
      </button>`;
    }).join("");
    target.querySelectorAll("[data-view]").forEach(btn =>
      btn.addEventListener("click", () => ctx.onSelect(btn.dataset.view))
    );
    target.querySelector("[data-action='open-action-sheet']")?.addEventListener("click", () => {
      if(typeof ctx.onOpenActionMenu === "function") ctx.onOpenActionMenu();
    });
  }

  global.AppUIRenderNav = { renderNav };
})(window);
