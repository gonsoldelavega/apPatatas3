(function(global){
  const TOKEN_KEY = "google-drive-token";
  const TOKEN_META_KEY = "google-drive-token-meta-v1";
  const WRAPPED_FLAG = "__factupapaWrappedInitTokenClient";

  function hasStoredDriveToken(){
    try{
      return !!String(global.localStorage.getItem(TOKEN_KEY) || "").trim();
    }catch(error){
      return false;
    }
  }

  function markTokenSaved(){
    try{
      global.localStorage.setItem(TOKEN_META_KEY, JSON.stringify({ savedAt:new Date().toISOString() }));
    }catch(error){
      // no-op
    }
  }

  function patchLocalStorageTokenMeta(){
    if(global.__factupapaDriveTokenStoragePatched) return;
    global.__factupapaDriveTokenStoragePatched = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value){
      const result = originalSetItem.apply(this, arguments);
      if(key === TOKEN_KEY && String(value || "").trim()) markTokenSaved();
      return result;
    };
  }

  function wrapGoogleIdentity(googleObject){
    const oauth = googleObject?.accounts?.oauth2;
    if(!oauth || typeof oauth.initTokenClient !== "function") return false;
    if(oauth.initTokenClient[WRAPPED_FLAG]) return true;

    const originalInitTokenClient = oauth.initTokenClient.bind(oauth);
    function hardenedInitTokenClient(config){
      const client = originalInitTokenClient(config);
      if(!client || typeof client.requestAccessToken !== "function" || client.__factupapaRequestWrapped) return client;
      const originalRequest = client.requestAccessToken.bind(client);
      client.requestAccessToken = function(options = {}){
        const nextOptions = { ...(options || {}) };
        const alreadyHasToken = hasStoredDriveToken();

        // La app antigua pedía prompt:'consent' en cada sincronización interactiva.
        // En móvil eso abre accounts.google.com repetidamente. Si ya hay token local,
        // se intenta reutilizar sesión con prompt vacío.
        if(nextOptions.prompt === "consent" && alreadyHasToken){
          nextOptions.prompt = "";
        }

        return originalRequest(nextOptions);
      };
      client.__factupapaRequestWrapped = true;
      return client;
    }
    hardenedInitTokenClient[WRAPPED_FLAG] = true;
    oauth.initTokenClient = hardenedInitTokenClient;
    return true;
  }

  function installGoogleSetterPatch(){
    if(global.__factupapaGoogleSetterPatched) return;
    global.__factupapaGoogleSetterPatched = true;
    let currentGoogle = global.google;
    if(currentGoogle) wrapGoogleIdentity(currentGoogle);
    try{
      Object.defineProperty(global, "google", {
        configurable:true,
        enumerable:true,
        get(){ return currentGoogle; },
        set(value){
          currentGoogle = value;
          setTimeout(() => wrapGoogleIdentity(currentGoogle), 0);
        }
      });
    }catch(error){
      // Algunos navegadores no permiten redefinir window.google. Dejamos el polling.
    }
  }

  function installPollingPatch(){
    let attempts = 0;
    const timer = global.setInterval(() => {
      attempts += 1;
      const done = wrapGoogleIdentity(global.google);
      if(done || attempts > 80) global.clearInterval(timer);
    }, 250);
  }

  patchLocalStorageTokenMeta();
  installGoogleSetterPatch();
  installPollingPatch();

  global.FactupapaGoogleAuthHardener = {
    hasStoredDriveToken,
    wrapGoogleIdentity
  };
})(window);
