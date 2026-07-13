(function(global){
  // Un importe "presente" tiene que ser un numero real: "" , null o true tambien
  // pasan Number.isFinite(Number(x)) (dan 0/1), y eso convertia compras sin
  // baseAmount/amount en 0 EUR en fiscalidad y dashboard.
  function hasAmount(value){
    if(value === "" || value === null || value === undefined || typeof value === "boolean") return false;
    return Number.isFinite(Number(value));
  }

  function purchaseBase(purchase, n){
    if(purchase && hasAmount(purchase.baseAmount)){
      return n(purchase.baseAmount);
    }
    return n(purchase.quantity) * n(purchase.unitCost);
  }

  function purchaseTotal(purchase, n){
    if(purchase && hasAmount(purchase.totalAmount)){
      return n(purchase.totalAmount);
    }
    if(purchase && hasAmount(purchase.amount)){
      return n(purchase.amount);
    }
    return purchaseBase(purchase, n) * (1 + n(purchase.iva) / 100);
  }

  const api = { purchaseBase, purchaseTotal, hasAmount };
  if(global) global.AppDomainPurchases = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
