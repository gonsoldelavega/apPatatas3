(function(global){
  function documentTypeLabel(type){
    return ({ ticket:"Ticket", supplierInvoice:"Factura proveedor", deliveryProof:"Albaran proveedor", receipt:"Justificante", other:"Otro" }[type] || "Documento");
  }

  function relatedCollection(type){
    return ({ purchase:"purchases", expense:"expenses", deliveryNote:"deliveryNotes", invoice:"invoices" }[type] || "");
  }

  function relatedLabel(type, id, deps){
    const entity = deps.relatedEntity(type, id);
    if(!entity) return "Sin vincular";
    if(type === "purchase") return `Compra ${deps.date(entity.date)}`;
    if(type === "expense") return `Gasto ${entity.concept || entity.category || deps.date(entity.date)}`;
    if(type === "deliveryNote") return entity.number || "Albaran";
    if(type === "invoice") return entity.number || "Factura";
    return "Documento";
  }

  global.AppDomainDocuments = {
    documentTypeLabel,
    relatedCollection,
    relatedLabel
  };
})(window);
