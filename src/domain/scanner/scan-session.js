(function(global){
  function createScanSession(input = {}){
    return {
      id: input.id || (global.crypto?.randomUUID ? global.crypto.randomUUID() : `scan-session-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      createdAt: input.createdAt || new Date().toISOString(),
      pages: Array.isArray(input.pages) ? input.pages : [],
      step: input.step || "camera",
      activePageId: input.activePageId || "",
      capture: input.capture || null,
      options: {
        autoCapture: input.options?.autoCapture !== false,
        selectedFilter: input.options?.selectedFilter || "document"
      }
    };
  }

  global.AppDomainScannerSession = {
    createScanSession
  };
})(window);
