(function(global){
  function createLocalStorageService(storage){
    return {
      getItem(key){
        return storage.getItem(key);
      },
      setItem(key, value){
        storage.setItem(key, value);
      },
      removeItem(key){
        storage.removeItem(key);
      },
      loadState(options){
        try{
          const raw = storage.getItem(options.key);
          if(!raw){
            return options.applySeed(structuredClone(options.createDefaultState()), options.seed, options.uid);
          }
          return options.migrate(JSON.parse(raw), options);
        }catch{
          return options.applySeed(structuredClone(options.createDefaultState()), options.seed, options.uid);
        }
      },
      persistState(key, state){
        storage.setItem(key, JSON.stringify(state));
      }
    };
  }

  global.AppStorageLocal = {
    createLocalStorageService
  };
})(window);
