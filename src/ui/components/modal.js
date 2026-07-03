(function(global){
  function openModal(title, sub, body, onMount, actions = []){
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalSub").textContent = sub || "";
    // Los contenedores se sustituyen por clones para destruir cualquier listener
    // que un formulario anterior dejara sobre ellos: un listener en el contenedor
    // sobrevive a innerHTML y re-disparaba el guardado del formulario previo
    // (p.ej. guardar un albarán volvía a guardar la última factura con otro número).
    ["modalBody", "modalActions"].forEach(nodeId => {
      const stale = document.getElementById(nodeId);
      if(stale) stale.replaceWith(stale.cloneNode(false));
    });
    document.getElementById("modalBody").innerHTML = body;
    document.getElementById("modalActions").innerHTML = actions.map(a => `<button class="${a.className || ""}" data-modal-action="${a.id}" type="${a.type || "button"}">${a.label}</button>`).join("");
    const modal = document.getElementById("modal");
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.querySelectorAll("[data-modal-action='cancel'],[data-modal-action='close']").forEach(btn => btn.addEventListener("click", closeModal));
    if(onMount) onMount(document.getElementById("modalBody"), document.getElementById("modalActions"));
    // Foco automático en el primer campo (mejor en escritorio; en móvil no fuerza el teclado de golpe).
    setTimeout(() => {
      const first = document.querySelector("#modalBody input:not([type=hidden]), #modalBody select, #modalBody textarea");
      if(first && typeof first.focus === "function"){ try { first.focus({ preventScroll:true }); } catch(e){ first.focus(); } }
    }, 60);
  }

  function isOpen(){
    const modal = document.getElementById("modal");
    return !!modal && modal.classList.contains("show");
  }

  function closeModal(){
    const modal = document.getElementById("modal");
    if(!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
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
    if(!global.__modalEscBound){
      global.__modalEscBound = true;
      document.addEventListener("keydown", e => { if(e.key === "Escape" && isOpen()) closeModal(); });
    }
  }

  global.AppUIModal = { openModal, closeModal, bindModalChrome };
})(window);
