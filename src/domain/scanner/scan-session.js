(function(global){
  function createScanSession(input = {}){
    return {
      id: input.id || (global.crypto?.randomUUID ? global.crypto.randomUUID() : `scan-session-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      createdAt: input.createdAt || new Date().toISOString(),
      pages: Array.isArray(input.pages) ? input.pages : [],
      step: input.step || "camera",
      activePageId: input.activePageId || "",
      capture: input.capture || null,
      result: input.result || null,
      processing: input.processing === true,
      error: input.error || "",
      options: {
        autoCapture: input.options?.autoCapture === true,
        selectedFilter: input.options?.selectedFilter || "document",
        mode: input.options?.mode || "document"
      }
    };
  }

  global.AppDomainScannerSession = {
    createScanSession
  };
})(window);
