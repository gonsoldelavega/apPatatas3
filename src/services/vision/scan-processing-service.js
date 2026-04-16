(function(global){
  function loadImage(dataUrl){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function canvasFromImage(img){
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  async function createPageFromCapture(capture, options = {}){
    const img = await loadImage(capture.sourceDataUrl);
    const sourceCanvas = canvasFromImage(img);
    const corners = options.corners || capture.corners || [];
    const flattened = await global.AppVisionPerspective.flattenDocument(sourceCanvas, corners);
    const variants = await global.AppVisionEnhance.createEnhancedVariants(flattened);
    return {
      source: capture.sourceDataUrl,
      corners,
      variants,
      selectedFilter: options.selectedFilter || "document",
      meta: {
        detected: Boolean(capture.detected),
        confidence: capture.confidence || 0,
        processingMode: "perspective",
        sourceWidth: sourceCanvas.width,
        sourceHeight: sourceCanvas.height
      }
    };
  }

  async function createPageFromFullImage(capture, options = {}){
    const img = await loadImage(capture.sourceDataUrl);
    const sourceCanvas = canvasFromImage(img);
    const variants = await global.AppVisionEnhance.createEnhancedVariants(sourceCanvas);
    return {
      source: capture.sourceDataUrl,
      corners: global.AppVisionDocumentDetector.defaultCorners(sourceCanvas.width, sourceCanvas.height),
      variants,
      selectedFilter: options.selectedFilter || "document",
      meta: {
        detected: Boolean(capture.detected),
        confidence: capture.confidence || 0,
        processingMode: "full-image",
        sourceWidth: sourceCanvas.width,
        sourceHeight: sourceCanvas.height
      }
    };
  }

  global.AppVisionScanProcessing = {
    createPageFromCapture,
    createPageFromFullImage
  };
})(window);
