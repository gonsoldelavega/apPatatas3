(function(global){
  function inferStockGroup(product, normalizeName){
    const text = normalizeName(product?.name || "");
    if(text.includes("agria")) return "patata-agria";
    return product?.stockGroup || "";
  }

  function buildBlankLine(products){
    return {
      productId:"",
      description:"",
      quantity:"",
      price:"",
      iva:"",
      deliveryDate:""
    };
  }

  global.AppDomainProducts = {
    inferStockGroup,
    buildBlankLine
  };
})(window);
