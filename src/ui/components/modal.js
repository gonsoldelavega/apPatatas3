(function(global){
  let returnFocusTo = null;
  let previousBodyOverflow = "";

  function focusElement(element){
    if(!element || typeof element.focus !== "function") return;
    try { element.focus({ preventScroll:true }); } catch(e){ element.focus(); }
  }

  function isTouchLike(){
    const coarse = !!global.matchMedia?.("(pointer: coarse)")?.matches;
    return coarse || global.innerWidth <= 640;
  }

  function focusableElements(modal){
    return [...modal.querySelectorAll([
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      "[tabindex]:not([tabindex='-1'])"
    ].join(","))].filter(node => !node.closest(".hidden") && node.offsetParent !== null);
  }

  function openModal(title, sub, body, onMount, actions = []){
    const modal = document.getElementById("modal");
    if(!modal) return;

    if(!modal.classList.contains("show")){
      returnFocusTo = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      previousBodyOverflow = document.body.style.overflow;
    }

    const titleNode = document.getElementById("modalTitle");
    titleNode.textContent = title;
    titleNode.setAttribute("tabindex", "-1");
    document.getElementById("modalSub").textContent = sub || "";

    // Sustituir los contenedores elimina listeners de un formulario anterior.
    ["modalBody", "modalActions"].forEach(nodeId => {
      const stale = document.getElementById(nodeId);
      if(stale) stale.replaceWith(stale.cloneNode(false));
    });

    document.getElementById("modalBody").innerHTML = body;
    document.getElementById("modalActions").innerHTML = actions.map(a => `<button class="${a.className || ""}" data-modal-action="${a.id}" type="${a.type || "button"}">${a.label}</button>`).join("");

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    document.querySelectorAll("[data-modal-action='cancel'],[data-modal-action='close']").forEach(btn => btn.addEventListener("click", closeModal));
    if(onMount) onMount(document.getElementById("modalBody"), document.getElementById("modalActions"));

    // En móvil no abrimos el teclado automáticamente. En escritorio sí llevamos
    // el foco al primer campo útil para mantener una interacción rápida.
    setTimeout(() => {
      if(!isOpen()) return;
      if(isTouchLike()){
        focusElement(titleNode);
        return;
      }
      const first = document.querySelector("#modalBody input:not([type=hidden]):not([disabled]), #modalBody select:not([disabled]), #modalBody textarea:not([disabled])");
      focusElement(first || titleNode);
    }, 60);
  }

  function isOpen(){
    const modal = document.getElementById("modal");
    return !!modal && modal.classList.contains("show");
  }

  function closeModal(){
    const modal = document.getElementById("modal");
    if(!modal || !modal.classList.contains("show")) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousBodyOverflow;
    const target = returnFocusTo;
    returnFocusTo = null;
    setTimeout(() => focusElement(target), 0);
  }

  function bindModalChrome(){
    const closeButton = document.getElementById("closeModal");
    const modal = document.getElementById("modal");
    if(closeButton && !closeButton.dataset.bound){
      closeButton.dataset.bound = "true";
      closeButton.addEventListener("click", closeModal);
    }
    if(modal && !modal.dataset.bound){
      modal.dataset.bound = "true";
      modal.addEventListener("click", e => { if(e.target.id === "modal") closeModal(); });
    }
    if(!global.__modalKeyboardBound){
      global.__modalKeyboardBound = true;
      document.addEventListener("keydown", e => {
        if(!isOpen()) return;
        if(e.key === "Escape"){
          e.preventDefault();
          closeModal();
          return;
        }
        if(e.key !== "Tab") return;
        const currentModal = document.getElementById("modal");
        const focusable = focusableElements(currentModal);
        if(!focusable.length){
          e.preventDefault();
          focusElement(document.getElementById("modalTitle"));
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if(e.shiftKey && document.activeElement === first){
          e.preventDefault();
          focusElement(last);
        }else if(!e.shiftKey && document.activeElement === last){
          e.preventDefault();
          focusElement(first);
        }
      });
    }
  }

  global.AppUIModal = { openModal, closeModal, bindModalChrome };
})(window);
