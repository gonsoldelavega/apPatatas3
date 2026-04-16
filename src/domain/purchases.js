(function(global){
  function purchaseBase(purchase, n){
    return n(purchase.quantity) * n(purchase.unitCost);
  }

  function purchaseTotal(purchase, n){
    return purchaseBase(purchase, n) * (1 + n(purchase.iva) / 100);
  }

  global.AppDomainPurchases = {
    purchaseBase,
    purchaseTotal
  };
})(window);
