(function(global){
  const TARGET_MONTH = "2026-05";
  const TARGET_TOTAL = 712.81;
  const EPSILON = 0.02;

  function parseAmount(value){
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function purchaseDate(purchase){
    return String(purchase?.date || purchase?.issueDate || purchase?.createdAt || "").slice(0, 10);
  }

  function purchaseTotal(purchase){
    return parseAmount(purchase?.totalAmount || purchase?.total || purchase?.amount || purchase?.grandTotal || 0);
  }

  function currentPurchasesTotal(){
    try{
      const key = global.AppInitialState?.STORAGE_KEY || "soler-operativa-v1";
      const state = JSON.parse(global.localStorage.getItem(key) || "{}");
      const purchases = Array.isArray(state.purchases) ? state.purchases : [];
      return purchases
        .filter(purchase => purchaseDate(purchase).startsWith(TARGET_MONTH))
        .reduce((sum, purchase) => sum + purchaseTotal(purchase), 0);
    }catch(error){
      return 0;
    }
  }

  function isMayAlreadyUpdated(){
    return Math.abs(currentPurchasesTotal() - TARGET_TOTAL) <= EPSILON;
  }

  function showToast(message){
    const wrap = document.getElementById("toasts");
    if(!wrap){
      alert(message);
      return;
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    wrap.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest('[data-action="sync-purchase-registry"]');
    if(!button) return;

    if(isMayAlreadyUpdated()){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToast("Compras ya actualizadas: mayo suma 712,81 €. No hace falta abrir Google.");
      return false;
    }
  }, true);

  global.FactupapaPurchaseSyncGuard = {
    currentPurchasesTotal,
    isMayAlreadyUpdated
  };
})(window);
