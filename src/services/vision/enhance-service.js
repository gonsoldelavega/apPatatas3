(function(global){
  async function createEnhancedVariants(flatCanvas){
    await global.AppVisionDocumentDetector.ensureOpenCv();
    const srcMat = global.cv.imread(flatCanvas);
    const gray = new global.cv.Mat();
    const normalized = new global.cv.Mat();
    const grayscaleRgba = new global.cv.Mat();
    const colorMat = new global.cv.Mat();
    const documentBlur = new global.cv.Mat();
    const documentMat = new global.cv.Mat();
    const kernel = global.cv.getStructuringElement(global.cv.MORPH_RECT, new global.cv.Size(3, 3));

    try{
      global.cv.cvtColor(srcMat, gray, global.cv.COLOR_RGBA2GRAY, 0);
      global.cv.normalize(gray, normalized, 0, 255, global.cv.NORM_MINMAX);
      global.cv.cvtColor(normalized, grayscaleRgba, global.cv.COLOR_GRAY2RGBA, 0);
      global.cv.convertScaleAbs(srcMat, colorMat, 1.08, 6);
      global.cv.GaussianBlur(normalized, documentBlur, new global.cv.Size(3, 3), 0, 0, global.cv.BORDER_DEFAULT);
      global.cv.adaptiveThreshold(documentBlur, documentMat, 255, global.cv.ADAPTIVE_THRESH_GAUSSIAN_C, global.cv.THRESH_BINARY, 25, 8);
      global.cv.morphologyEx(documentMat, documentMat, global.cv.MORPH_CLOSE, kernel);
      global.cv.medianBlur(documentMat, documentMat, 3);

      const grayscaleCanvas = document.createElement("canvas");
      const colorCanvas = document.createElement("canvas");
      const documentCanvas = document.createElement("canvas");
      global.cv.imshow(grayscaleCanvas, grayscaleRgba);
      global.cv.imshow(colorCanvas, colorMat);
      global.cv.imshow(documentCanvas, documentMat);

      return {
        color: colorCanvas.toDataURL("image/jpeg", 0.9),
        grayscale: grayscaleCanvas.toDataURL("image/jpeg", 0.88),
        document: documentCanvas.toDataURL("image/jpeg", 0.82)
      };
    } finally {
      kernel.delete();
      srcMat.delete();
      gray.delete();
      normalized.delete();
      grayscaleRgba.delete();
      colorMat.delete();
      documentBlur.delete();
      documentMat.delete();
    }
  }

  global.AppVisionEnhance = {
    createEnhancedVariants
  };
})(window);
