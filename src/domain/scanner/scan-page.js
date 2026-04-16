(function(global){
  function createScanPage(input = {}){
    return {
      id: input.id || (global.crypto?.randomUUID ? global.crypto.randomUUID() : `scan-page-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      createdAt: input.createdAt || new Date().toISOString(),
      source: input.source || null,
      corners: input.corners || [],
      variants: input.variants || { color:"", grayscale:"", document:"" },
      selectedFilter: input.selectedFilter || "document",
      ocr: input.ocr || null,
      meta: input.meta || {}
    };
  }

  global.AppDomainScannerPage = {
    createScanPage
  };
})(window);
