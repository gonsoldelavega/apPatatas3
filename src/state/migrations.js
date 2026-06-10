(function(global){
  function normalizeTaxId(value){
    return String(value || "").trim().toUpperCase();
  }

  function normalizeName(value){
    return String(value || "").trim().toLowerCase();
  }

  function applySeed(base, seed, uid){
    base.clients = (seed.clients || []).map(x => ({
      id:uid("cli"),
      debtManual:0,
      notes:"",
      templateId:"base",
      paymentTermsDefault:false,
      taxId:"",
      contactPerson:"",
      shippingAddress:"",
      ...x,
      taxId:normalizeTaxId(x.taxId)
    }));
    base.suppliers = (seed.suppliers || []).map(x => ({ id:uid("sup"), notes:"", ...x }));
    base.products = (seed.products || []).map(x => ({ id:uid("pro"), category:"", supplierId:"", unit:"kg", iva:4, price:0, cost:0, stockBase:0, stockMin:0, observations:"", ...x }));

    const clientsByTaxId = new Map(base.clients.map(client => [normalizeTaxId(client.taxId), client]));
    const clientsByName = new Map(base.clients.map(client => [normalizeName(client.name), client]));
    const productsByName = new Map(base.products.map(product => [normalizeName(product.name), product]));

    base.invoices = (seed.invoices || []).map(invoice => {
      const client = clientsByTaxId.get(normalizeTaxId(invoice.customerNif)) || clientsByName.get(normalizeName(invoice.customerName));
      const lines = (invoice.items || []).map(item => {
        const productName = normalizeName(item.name).includes("patata agria entera") ? "patata agria entera" : normalizeName(item.name);
        const product = productsByName.get(productName);
        return {
          productId: product?.id || "",
          description: item.name,
          quantity: item.quantity,
          price: item.unitPrice,
          iva: invoice.taxRate,
          unit: item.unit || product?.unit || "kg",
          date: invoice.issueDate
        };
      });
      return {
        id:uid("fac"),
        clientId:client?.id || "",
        number:invoice.number,
        issueDate:invoice.issueDate,
        dueDate:invoice.dueDate,
        periodStart:invoice.issueDate,
        periodEnd:invoice.issueDate,
        templateId:client?.templateId || "base",
        internalNote:"",
        sendStatus:"",
        amountPaid:invoice.status === "paid" ? invoice.total : 0,
        showPaymentTerms:false,
        paidDate:invoice.paidDate || "",
        lines
      };
    });

    return base;
  }

  function mergeSeedInvoices(next, seed, uid){
    const seeded = applySeed(structuredClone(global.AppInitialState.createDefaultState()), seed, uid).invoices || [];
    if(!seeded.length) return;
    const existingNumbers = new Set((next.invoices || []).map(invoice => String(invoice.number || "").trim().toUpperCase()));
    const missing = seeded.filter(invoice => !existingNumbers.has(String(invoice.number || "").trim().toUpperCase()));
    if(missing.length){
      next.invoices = [...(next.invoices || []), ...missing];
    }
  }

  function migrateState(saved, options){
    const next = structuredClone(options.createDefaultState());
    const savedSettings = saved.settings || {};
    Object.keys(next.settings).forEach(key => {
      if(Object.prototype.hasOwnProperty.call(savedSettings, key)){
        next.settings[key] = savedSettings[key];
      }
    });
    ["templates","clients","suppliers","products","purchases","expenses","walletMovements","deliveryNotes","invoices","documents"].forEach(key => {
      next[key] = Array.isArray(saved[key]) ? saved[key] : next[key];
    });
    next._sync = {
      version:1,
      updatedAt:saved?._sync?.updatedAt || saved?.settings?.lastSavedAt || "",
      ...(saved._sync || {})
    };
    next._deleted = (saved && saved._deleted && typeof saved._deleted === "object") ? saved._deleted : (next._deleted || {});
    if(!next.clients.length && (options.seed.clients || []).length){
      next.clients = applySeed(structuredClone(options.createDefaultState()), options.seed, options.uid).clients;
    }
    if(!next.products.length && (options.seed.products || []).length){
      next.products = applySeed(structuredClone(options.createDefaultState()), options.seed, options.uid).products;
    }
    next.clients = (next.clients || []).map(client => ({ ...client, taxId:normalizeTaxId(client.taxId) }));
    next.settings.backendUrl = next.settings.backendUrl || "";
    next.settings.backendAutoSync = next.settings.backendAutoSync === true || next.settings.backendAutoSync === "true";
    next.settings.deviceId = next.settings.deviceId || "";
    next.settings.lastSavedAt = next.settings.lastSavedAt || next._sync.updatedAt || "";
    next.settings.driveClientId = next.settings.driveClientId || "";
    next.settings.driveRootFolderName = next.settings.driveRootFolderName || "apPatatas";
    next.settings.driveAutoUpload = next.settings.driveAutoUpload === true || next.settings.driveAutoUpload === "true";
    next.settings.driveStateFileName = next.settings.driveStateFileName || "apPatatas-state.json";
    next.settings.driveStateAutoSync = next.settings.driveStateAutoSync === true || next.settings.driveStateAutoSync === "true";
    mergeSeedInvoices(next, options.seed, options.uid);
    return next;
  }

  global.AppMigrations = {
    applySeed,
    migrateState
  };
})(window);
