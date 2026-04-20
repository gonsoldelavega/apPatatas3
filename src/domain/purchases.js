(function(global){
  function purchaseBase(purchase, n){
    if(purchase && Number.isFinite(Number(purchase.baseAmount))){
      return n(purchase.baseAmount);
    }
    return n(purchase.quantity) * n(purchase.unitCost);
  }

  function purchaseTotal(purchase, n){
    if(purchase && Number.isFinite(Number(purchase.totalAmount))){
      return n(purchase.totalAmount);
    }
    if(purchase && Number.isFinite(Number(purchase.amount))){
      return n(purchase.amount);
    }
    return purchaseBase(purchase, n) * (1 + n(purchase.iva) / 100);
  }

  global.AppDomainPurchases = {
    purchaseBase,
    purchaseTotal
  };
})(window);
