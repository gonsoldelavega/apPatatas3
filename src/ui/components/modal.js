(function(global){
  function openModal(title, sub, body, onMount, actions = []){
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalSub").textContent = sub || "";
    document.getElementById("modalBody").innerHTML = body;
    document.getElementById("modalActions").innerHTML = actions.map(a => `<button class="${a.className || ""}" data-modal-action="${a.id}" type="${a.type || "button"}">${a.label}</button>`).join("");
    document.getElementById("modal").classList.add("show");
    document.querySelectorAll("[data-modal-action='cancel'],[data-modal-action='close']").forEach(btn => btn.addEventListener("click", closeModal));
    if(onMount) onMount(document.getElementById("modalBody"), document.getElementById("modalActions"));
  }

  function closeModal(){
    document.getElementById("modal").classList.remove("show");
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
  }

  global.AppUIModal = { openModal, closeModal, bindModalChrome };
})(window);
