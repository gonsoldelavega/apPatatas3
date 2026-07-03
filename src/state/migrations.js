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

  // Las facturas de ejemplo (formato INVxx) eran datos de demo. Nunca se siembran
  // ni se reinyectan en datos reales; ademas se purgan si quedaron de versiones viejas.
  function isDemoInvoice(invoice){
    return /^INV\d+$/i.test(String(invoice && invoice.number || "").trim());
  }
  function purgeDemoInvoices(next){
    if(Array.isArray(next.invoices)){
      next.invoices = next.invoices.filter(invoice => !isDemoInvoice(invoice));
    }
  }

  function invoiceSeq(number){
    const match = String(number || "").match(/(\d+)\s*\/\s*20\d{2}/);
    return match ? Number(match[1]) : 0;
  }

  // Repara duplicados patologicos: la MISMA factura (mismo id) dos veces en la lista.
  // Los creaba un listener fantasma del formulario (guardar un albarán re-guardaba la
  // última factura con un número recalculado). Se conserva la entrada con el numero
  // mas bajo (la original: el fantasma siempre recibia un numero superior) y, por
  // seguridad, el mayor importe cobrado registrado entre ambas.
  function dedupeInvoicesById(next){
    if(!Array.isArray(next.invoices)) return;
    const indexById = new Map();
    const result = [];
    next.invoices.forEach(invoice => {
      if(!invoice || invoice.id == null){ result.push(invoice); return; }
      const existingIndex = indexById.get(invoice.id);
      if(existingIndex === undefined){
        indexById.set(invoice.id, result.length);
        result.push(invoice);
        return;
      }
      const current = result[existingIndex];
      const currentSeq = invoiceSeq(current.number);
      const incomingSeq = invoiceSeq(invoice.number);
      const keep = (incomingSeq > 0 && (currentSeq === 0 || incomingSeq < currentSeq)) ? invoice : current;
      const drop = keep === invoice ? current : invoice;
      const paid = Math.max(Number(keep.amountPaid) || 0, Number(drop.amountPaid) || 0);
      result[existingIndex] = paid > 0 ? { ...keep, amountPaid:paid } : keep;
    });
    if(result.length !== next.invoices.length){
      next.invoices = result;
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
    purgeDemoInvoices(next);
    dedupeInvoicesById(next);
    return next;
  }

  global.AppMigrations = {
    applySeed,
    migrateState
  };
})(window);
