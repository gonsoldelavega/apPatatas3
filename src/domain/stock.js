(function(global){
  function stockGroupKey(productOrId, getProduct, inferStockGroup){
    const product = typeof productOrId === "string" ? getProduct(productOrId) : productOrId;
    if(!product) return "";
    return product.stockGroup || inferStockGroup(product) || product.id;
  }

  function stockGroupLabel(productOrId, getProduct, stockGroupKeyFn){
    const product = typeof productOrId === "string" ? getProduct(productOrId) : productOrId;
    const key = stockGroupKeyFn(product);
    if(key === "patata-agria") return "Patata agria";
    return key === product?.id ? "" : key;
  }

  function stock(productId, state, options){
    const product = options.getProduct(productId);
    if(!product) return 0;
    const groupKey = options.stockGroupKey(product);
    const groupedProducts = state.products.filter(item => options.stockGroupKey(item) === groupKey);
    const groupIds = new Set(groupedProducts.map(item => item.id));
    const bought = state.purchases.filter(item => groupIds.has(item.productId)).reduce((sum, item) => sum + options.n(item.quantity), 0);
    const sold = state.invoices.flatMap(invoice => invoice.lines || []).filter(item => groupIds.has(item.productId)).reduce((sum, item) => sum + options.n(item.quantity), 0);
    const base = groupedProducts.reduce((sum, item) => sum + options.n(item.stockBase), 0);
    return base + bought - sold;
  }

  global.AppDomainStock = {
    stockGroupKey,
    stockGroupLabel,
    stock
  };
})(window);
