(function(global){
  const reduceMotion = () => !!global.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const pressSelector = "button, [role='button'], .filter-chip, .invoice-card-strong, .invoice-filter-drawer summary";

  function bindPressFeedback(root = document){
    root.querySelectorAll?.(pressSelector).forEach(el => {
      if(el.dataset.fpPressBound) return;
      el.dataset.fpPressBound = "true";
      el.classList.add("fp-pressable");
      const release = () => el.classList.remove("is-pressed");
      el.addEventListener("pointerdown", event => {
        if(event.button !== undefined && event.button !== 0) return;
        el.classList.add("is-pressed");
      }, { passive:true });
      el.addEventListener("pointerup", release, { passive:true });
      el.addEventListener("pointercancel", release, { passive:true });
      el.addEventListener("pointerleave", event => {
        if(event.buttons) release();
      }, { passive:true });
    });
  }

  function parseMoney(text){
    const normalized = String(text || "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^0-9.-]/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  function money(value){
    return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR" }).format(value || 0);
  }

  function enhanceInvoiceCard(card){
    if(card.dataset.fpEnhanced) return;
    card.dataset.fpEnhanced = "true";

    const actions = card.querySelector(":scope > .card-actions");
    if(!actions) return;
    const buttons = [...actions.querySelectorAll(":scope > button")];
    if(buttons.length < 2) return;

    const primary = buttons.find(button => button.dataset.action === "preview-invoice") || buttons[0];
    const edit = buttons.find(button => button.dataset.action === "edit-invoice");
    const secondary = buttons.filter(button => button !== primary && button !== edit);

    actions.classList.add("fp-primary-actions");
    actions.replaceChildren();
    actions.append(primary);

    if(edit){
      edit.textContent = "Editar";
      secondary.unshift(edit);
    }

    const details = document.createElement("details");
    details.className = "fp-invoice-more";
    details.innerHTML = '<summary aria-label="Más acciones" title="Más acciones">···</summary><div class="fp-invoice-more-menu"></div>';
    const menu = details.querySelector(".fp-invoice-more-menu");
    secondary.forEach(button => menu.append(button));
    actions.append(details);

    details.addEventListener("toggle", () => {
      if(!details.open) return;
      document.querySelectorAll(".fp-invoice-more[open]").forEach(other => {
        if(other !== details) other.removeAttribute("open");
      });
      bindPressFeedback(details);
    });

    menu.addEventListener("click", () => details.removeAttribute("open"));
  }

  function enhanceBilling(root = document){
    const panel = root.querySelector?.(".billing-panel-compact");
    if(!panel) return;

    panel.querySelectorAll(".invoice-card-strong").forEach(enhanceInvoiceCard);

    const body = panel.querySelector(".billing-panel-body");
    if(!body || body.querySelector(".fp-invoice-overview")) return;
    const cards = [...body.querySelectorAll(".invoice-card-strong")];
    if(!cards.length) return;

    let total = 0;
    let pending = 0;
    let paid = 0;
    cards.forEach(card => {
      total += parseMoney(card.querySelector(".price")?.textContent);
      const status = card.querySelector("[data-action='update-invoice-payment']")?.textContent?.trim().toLowerCase() || "";
      if(status.includes("pagada")) paid += 1;
      else pending += 1;
    });

    const overview = document.createElement("section");
    overview.className = "fp-invoice-overview";
    overview.setAttribute("aria-label", "Resumen de facturas visibles");
    overview.innerHTML = `
      <div class="fp-invoice-stat"><span>Visible</span><strong>${money(total)}</strong></div>
      <div class="fp-invoice-stat"><span>Pendientes</span><strong>${pending}</strong></div>
      <div class="fp-invoice-stat"><span>Pagadas</span><strong>${paid}</strong></div>`;

    const tabs = body.querySelector(".billing-tabs");
    if(tabs) tabs.insertAdjacentElement("afterend", overview);
    else body.prepend(overview);
  }

  function currentTranslateY(element){
    const transform = getComputedStyle(element).transform;
    if(!transform || transform === "none") return 0;
    try{
      const matrix = new DOMMatrixReadOnly(transform);
      return matrix.m42 || 0;
    }catch(_error){
      return 0;
    }
  }

  function bindInvoiceSheet(modal){
    const sheet = modal.querySelector(".sheet");
    const handle = sheet?.querySelector(":scope > .panel-h");
    if(!sheet || !handle || sheet.dataset.fpSheetBound) return;
    sheet.dataset.fpSheetBound = "true";

    let pointerId = null;
    let startY = 0;
    let startTranslate = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let animation = null;

    const setY = value => {
      sheet.style.setProperty("--fp-sheet-y", `${Math.max(0, value)}px`);
    };

    const animateTo = (target, initialVelocity = 0, onFinish) => {
      animation?.cancel();
      const current = currentTranslateY(sheet);
      if(reduceMotion()){
        setY(target);
        onFinish?.();
        return;
      }
      const distance = Math.max(1, Math.abs(target - current));
      const speedFactor = Math.min(.12, Math.abs(initialVelocity) / Math.max(distance, 1) / 10);
      const duration = Math.max(170, Math.min(340, 300 - speedFactor * 600));
      animation = sheet.animate(
        [{ transform:`translate3d(0,${current}px,0)` }, { transform:`translate3d(0,${target}px,0)` }],
        { duration, easing:"cubic-bezier(.22,.8,.22,1)", fill:"forwards" }
      );
      animation.onfinish = () => {
        animation = null;
        setY(target);
        sheet.style.transform = "";
        onFinish?.();
      };
      animation.oncancel = () => {
        const live = currentTranslateY(sheet);
        setY(live);
        sheet.style.transform = "";
      };
    };

    handle.addEventListener("pointerdown", event => {
      if(event.target.closest("button,input,select,textarea,a")) return;
      animation?.cancel();
      pointerId = event.pointerId;
      handle.setPointerCapture(pointerId);
      startY = event.clientY;
      startTranslate = currentTranslateY(sheet);
      lastY = event.clientY;
      lastTime = performance.now();
      velocity = 0;
      sheet.style.animation = "none";
    });

    handle.addEventListener("pointermove", event => {
      if(event.pointerId !== pointerId) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      velocity = ((event.clientY - lastY) / dt) * 1000;
      lastY = event.clientY;
      lastTime = now;
      const raw = startTranslate + event.clientY - startY;
      const resisted = raw < 0 ? raw * .18 : raw;
      setY(resisted);
    });

    const finish = event => {
      if(event.pointerId !== pointerId) return;
      pointerId = null;
      try{ handle.releasePointerCapture(event.pointerId); }catch(_error){}
      const current = currentTranslateY(sheet);
      const height = Math.max(1, sheet.getBoundingClientRect().height);
      const projected = current + velocity * .16;
      const dismiss = velocity > 850 || projected > height * .34;
      if(dismiss){
        animateTo(height + 32, velocity, () => global.AppUIModal?.closeModal());
      }else{
        animateTo(0, velocity);
      }
    };

    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function enhanceModal(root = document){
    const modal = root.querySelector?.("#modal");
    if(!modal) return;
    const isInvoice = !!modal.querySelector("#invoiceForm");
    modal.classList.toggle("invoice-sheet-modal", isInvoice && modal.classList.contains("show"));
    if(isInvoice) bindInvoiceSheet(modal);
  }

  function enhance(root = document){
    enhanceBilling(root);
    enhanceModal(document);
    bindPressFeedback(root);
  }

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if(node.nodeType === 1) enhance(node);
    }));
    enhance(document);
  });

  function init(){
    enhance(document);
    observer.observe(document.body, { childList:true, subtree:true });
    document.addEventListener("click", event => {
      if(!event.target.closest(".fp-invoice-more")){
        document.querySelectorAll(".fp-invoice-more[open]").forEach(item => item.removeAttribute("open"));
      }
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();

  global.AppUIFluidTouch = { enhance };
})(window);
