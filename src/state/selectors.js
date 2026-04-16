(function(global){
  function templateName(state, id){
    return state.templates.find(t => t.id === id)?.name || "Base";
  }

  function getClient(state, id){
    return state.clients.find(x => x.id === id);
  }

  function getSupplier(state, id){
    return state.suppliers.find(x => x.id === id);
  }

  function getProduct(state, id){
    return state.products.find(x => x.id === id);
  }

  global.AppSelectors = {
    templateName,
    getClient,
    getSupplier,
    getProduct
  };
})(window);
