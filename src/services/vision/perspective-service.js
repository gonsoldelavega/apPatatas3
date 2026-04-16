(function(global){
  function distanceBetween(a, b){
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  async function flattenDocument(sourceCanvas, corners){
    await global.AppVisionDocumentDetector.ensureOpenCv();
    const [tl, tr, br, bl] = global.AppVisionDocumentDetector.orderCorners(corners);
    const targetWidth = Math.max(900, Math.round(Math.max(distanceBetween(br, bl), distanceBetween(tr, tl))));
    const targetHeight = Math.max(1200, Math.round(Math.max(distanceBetween(tr, br), distanceBetween(tl, bl))));

    const srcMat = global.cv.imread(sourceCanvas);
    const dstMat = new global.cv.Mat();
    const srcTri = global.cv.matFromArray(4, 1, global.cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dstTri = global.cv.matFromArray(4, 1, global.cv.CV_32FC2, [0, 0, targetWidth - 1, 0, targetWidth - 1, targetHeight - 1, 0, targetHeight - 1]);
    const transform = global.cv.getPerspectiveTransform(srcTri, dstTri);

    try{
      global.cv.warpPerspective(
        srcMat,
        dstMat,
        transform,
        new global.cv.Size(targetWidth, targetHeight),
        global.cv.INTER_LINEAR,
        global.cv.BORDER_CONSTANT,
        new global.cv.Scalar(255, 255, 255, 255)
      );
      const canvas = document.createElement("canvas");
      global.cv.imshow(canvas, dstMat);
      return canvas;
    } finally {
      srcMat.delete();
      dstMat.delete();
      srcTri.delete();
      dstTri.delete();
      transform.delete();
    }
  }

  global.AppVisionPerspective = {
    flattenDocument
  };
})(window);
