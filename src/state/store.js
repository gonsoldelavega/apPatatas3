(function(global){
  function isDateLike(value){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function boolOrEmpty(value){
    if(value === true || value === "true") return true;
    if(value === false || value === "false") return false;
    return "";
  }

  function hasExplicitBool(value){
    return value === true || value === false || value === "true" || value === "false";
  }

  function normalizeInvoiceMetadata(snapshot){
    if(!snapshot || !Array.isArray(snapshot.invoices)) return snapshot;
    snapshot.invoices = snapshot.invoices.map(invoice => {
      if(!invoice) return invoice;
      const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
      const meta = lines.find(line => line && line._invoiceMeta)?._invoiceMeta || {};
      const periodStart = isDateLike(meta.periodStart) ? meta.periodStart : isDateLike(invoice.periodStart) ? invoice.periodStart : invoice.issueDate || invoice.date || "";
      const periodEnd = isDateLike(meta.periodEnd) ? meta.periodEnd : isDateLike(invoice.periodEnd) ? invoice.periodEnd : periodStart;
      const showPaymentTerms = hasExplicitBool(meta.showPaymentTerms) ? boolOrEmpty(meta.showPaymentTerms) : boolOrEmpty(invoice.showPaymentTerms);
      const sendStatus = invoice.sendStatus || meta.sendStatus || "";
      const paymentNote = invoice.paymentNote || meta.paymentNote || "";
      const nextMeta = {
        periodStart,
        periodEnd,
        showPaymentTerms:showPaymentTerms === true,
        sendStatus,
        paymentNote
      };
      return {
        ...invoice,
        periodStart,
        periodEnd,
        showPaymentTerms:showPaymentTerms === true,
        sendStatus,
        paymentNote,
        lines:lines.map((line, index) => index === 0 ? { ...line, _invoiceMeta:nextMeta } : line)
      };
    });
    return snapshot;
  }

  function createStore(options){
    const loadOptions = {
      key: options.key,
      createDefaultState: options.createDefaultState,
      applySeed: options.applySeed,
      migrate: options.migrate,
      seed: options.seed,
      uid: options.uid
    };

    let state = normalizeInvoiceMetadata(options.storage.loadState(loadOptions));

    function commitPersist(meta = {}){
      state = normalizeInvoiceMetadata(state);
      const prepared = options.beforePersist ? options.beforePersist(state, meta) : null;
      if(prepared) state = normalizeInvoiceMetadata(prepared);
      options.storage.persistState(options.key, state);
      if(options.onPersist) options.onPersist(state, meta);
      return state;
    }

    return {
      getState(){
        return state;
      },
      updateState(mutator, settings = {}){
        const maybeNext = mutator(state);
        if(maybeNext) state = normalizeInvoiceMetadata(maybeNext);
        else state = normalizeInvoiceMetadata(state);
        if(settings.persist) commitPersist({ reason:settings.reason || "updateState" });
        return state;
      },
      replaceState(nextState, settings = {}){
        state = normalizeInvoiceMetadata(nextState);
        if(settings.persist) commitPersist({ reason:settings.reason || "replaceState" });
        return state;
      },
      persist(){
        commitPersist({ reason:"persist" });
        return state;
      },
      resetState(){
        options.storage.removeItem(options.key);
        state = normalizeInvoiceMetadata(options.storage.loadState(loadOptions));
        return state;
      },
      migrate(saved){
        return normalizeInvoiceMetadata(options.migrate(saved, loadOptions));
      },
      saveEntity(collection, entity, id){
        return this.updateState(current => {
          const list = current[collection];
          const idx = list.findIndex(x => x.id === id);
          if(idx >= 0) list[idx] = { ...list[idx], ...entity };
          else list.unshift(entity);
        }, { persist:true, reason:`saveEntity:${collection}` });
      },
      removeEntity(collection, id){
        return this.updateState(current => {
          current[collection] = current[collection].filter(x => x.id !== id);
        }, { persist:true, reason:`removeEntity:${collection}` });
      }
    };
  }

  global.AppStore = {
    createStore
  };
})(window);
