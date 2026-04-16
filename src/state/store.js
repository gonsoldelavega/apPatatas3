(function(global){
  function createStore(options){
    const loadOptions = {
      key: options.key,
      createDefaultState: options.createDefaultState,
      applySeed: options.applySeed,
      migrate: options.migrate,
      seed: options.seed,
      uid: options.uid
    };

    let state = options.storage.loadState(loadOptions);

    function commitPersist(meta = {}){
      const prepared = options.beforePersist ? options.beforePersist(state, meta) : null;
      if(prepared) state = prepared;
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
        if(maybeNext) state = maybeNext;
        if(settings.persist) commitPersist({ reason:settings.reason || "updateState" });
        return state;
      },
      replaceState(nextState, settings = {}){
        state = nextState;
        if(settings.persist) commitPersist({ reason:settings.reason || "replaceState" });
        return state;
      },
      persist(){
        commitPersist({ reason:"persist" });
        return state;
      },
      resetState(){
        options.storage.removeItem(options.key);
        state = options.storage.loadState(loadOptions);
        return state;
      },
      migrate(saved){
        return options.migrate(saved, loadOptions);
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
