(function(global){
  function createUiState(){
    return {
      activeView:"dashboard",
      search:{
        clients:"",
        suppliers:"",
        products:"",
        productsCategory:"",
        invoicesClient:"",
        invoicesQuery:"",
        invoicesMonth:"",
        invoicesStatus:"",
        deliveryNotesClient:"",
        purchasesSupplier:"",
        expensesCategory:"",
        walletScope:"",
        walletKind:"",
        documents:"",
        documentsType:""
      }
    };
  }

  global.AppUIState = {
    createUiState
  };
})(window);
