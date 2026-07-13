/* ============================================================
   FACTUPAPA — Splash Screen
   Aparece mientras Supabase carga. Desaparece con animación
   cuando la app está lista.
   ============================================================ */

(function(global){

  let _splashEl = null;
  // Si hide() llega antes de que el splash se haya pintado (show espera a
  // DOMContentLoaded y el arranque puede terminar antes), ya no se muestra:
  // sin esta marca el splash aparecia despues de hide() y se quedaba fijo.
  let _hidden = false;

  function showSplash(){
    if(_splashEl || _hidden) return;

    const el = document.createElement("div");
    el.id = "factupapa-splash";
    el.innerHTML = `
      <div class="splash-inner">
        <div class="splash-logo">
          <span class="splash-word-fact">Factu</span><span class="splash-word-papa">papa</span>
        </div>
        <div class="splash-sub">Cargando tu negocio…</div>
        <div class="splash-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #factupapa-splash {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #2A1F1A;
        transition: opacity .5s ease, transform .5s ease;
      }

      #factupapa-splash.hiding {
        opacity: 0;
        transform: scale(1.04);
        pointer-events: none;
      }

      .splash-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
      }

      .splash-logo {
        font-family: 'Lora', Georgia, 'Times New Roman', serif;
        font-size: clamp(3rem, 12vw, 5.5rem);
        font-weight: 700;
        letter-spacing: -.04em;
        line-height: 1;
        animation: splashPulse 2.4s ease-in-out infinite;
      }

      .splash-word-fact { color: #FDF8F0; }
      .splash-word-papa { color: #C4602A; }

      .splash-sub {
        color: rgba(253,248,240,.42);
        font-family: 'DM Sans', system-ui, sans-serif;
        font-size: .88rem;
        font-weight: 400;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .splash-dots {
        display: flex;
        gap: 7px;
        align-items: center;
        margin-top: 8px;
      }

      .splash-dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(196,96,42,.60);
        animation: splashDot 1.2s ease-in-out infinite;
      }

      .splash-dots span:nth-child(2) { animation-delay: .18s; }
      .splash-dots span:nth-child(3) { animation-delay: .36s; }

      @keyframes splashPulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: .7; }
      }

      @keyframes splashDot {
        0%, 80%, 100% { transform: scale(.7); opacity: .4; }
        40%            { transform: scale(1.2); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(el);
    _splashEl = el;
  }

  function hideSplash(){
    _hidden = true;
    if(!_splashEl) return;
    _splashEl.classList.add("hiding");
    setTimeout(() => {
      _splashEl?.remove();
      _splashEl = null;
    }, 550);
  }

  /* Muestra el splash inmediatamente */
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", showSplash, { once: true });
  } else {
    showSplash();
  }

  global.AppSplash = { show: showSplash, hide: hideSplash };

})(window);
