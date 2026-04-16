(function(global){
  let openCvReadyPromise = null;

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === src);
      if(existing){
        if(existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load", () => resolve(), { once:true });
        existing.addEventListener("error", reject, { once:true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureOpenCv(){
    if(global.cv?.Mat) return;
    if(openCvReadyPromise) return openCvReadyPromise;
    openCvReadyPromise = new Promise((resolve, reject) => {
      const finish = () => {
        if(global.cv?.Mat){
          resolve();
          return true;
        }
        return false;
      };
      if(finish()) return;
      loadScript("https://docs.opencv.org/4.x/opencv.js").then(() => {
        const started = Date.now();
        const timer = setInterval(() => {
          if(finish()){
            clearInterval(timer);
            return;
          }
          if(Date.now() - started > 20000){
            clearInterval(timer);
            openCvReadyPromise = null;
            reject(new Error("opencv-timeout"));
          }
        }, 120);
      }).catch(error => {
        openCvReadyPromise = null;
        reject(error);
      });
    });
    return openCvReadyPromise;
  }

  function defaultCorners(width, height){
    const inset = Math.round(Math.min(width, height) * 0.08);
    return [
      { x: inset, y: inset },
      { x: width - inset, y: inset },
      { x: width - inset, y: height - inset },
      { x: inset, y: height - inset }
    ];
  }

  function distanceBetween(a, b){
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function polygonArea(points){
    let area = 0;
    for(let i = 0; i < points.length; i += 1){
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area / 2);
  }

  function orderCorners(points){
    const sortedBySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const sortedByDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x));
    return [sortedBySum[0], sortedByDiff[0], sortedBySum[3], sortedByDiff[3]];
  }

  function angleScore(points){
    const scores = [];
    for(let i = 0; i < points.length; i += 1){
      const prev = points[(i + points.length - 1) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const v1x = prev.x - current.x;
      const v1y = prev.y - current.y;
      const v2x = next.x - current.x;
      const v2y = next.y - current.y;
      const mag1 = Math.hypot(v1x, v1y) || 1;
      const mag2 = Math.hypot(v2x, v2y) || 1;
      const cosine = clamp((v1x * v2x + v1y * v2y) / (mag1 * mag2), -1, 1);
      const angle = Math.acos(cosine) * 180 / Math.PI;
      scores.push(1 - Math.min(1, Math.abs(90 - angle) / 38));
    }
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }

  function minBorderDistanceScore(points, width, height){
    const distances = points.map(point => Math.min(point.x, point.y, width - point.x, height - point.y));
    const average = distances.reduce((sum, value) => sum + value, 0) / Math.max(1, distances.length);
    const reference = Math.min(width, height) * 0.08;
    return clamp(average / Math.max(reference, 1), 0, 1);
  }

  function aspectRatioScore(widthValue, heightValue){
    const ratio = widthValue / Math.max(heightValue, 1);
    if(ratio < 0.22 || ratio > 1.9) return 0;
    if(ratio >= 0.35 && ratio <= 1.5) return 1;
    return ratio < 0.35
      ? clamp((ratio - 0.22) / 0.13, 0, 1)
      : clamp((1.9 - ratio) / 0.4, 0, 1);
  }

  function buildCandidateScore(points, contourAreaValue, frameWidth, frameHeight){
    const [tl, tr, br, bl] = orderCorners(points);
    const maxWidth = Math.max(distanceBetween(br, bl), distanceBetween(tr, tl));
    const maxHeight = Math.max(distanceBetween(tr, br), distanceBetween(tl, bl));
    const quadArea = polygonArea([tl, tr, br, bl]);
    const frameArea = frameWidth * frameHeight;
    const areaCoverage = clamp(quadArea / Math.max(frameArea, 1), 0, 1);
    const areaScore = clamp((areaCoverage - 0.12) / 0.58, 0, 1);
    const fillRatio = clamp(quadArea / Math.max(contourAreaValue, 1), 0, 1);
    const rectangularityScore = clamp((fillRatio - 0.72) / 0.28, 0, 1);
    const rightAngleScore = angleScore([tl, tr, br, bl]);
    const borderScore = minBorderDistanceScore([tl, tr, br, bl], frameWidth, frameHeight);
    const aspectScore = aspectRatioScore(maxWidth, maxHeight);
    const confidence = (
      areaScore * 0.34 +
      rectangularityScore * 0.22 +
      rightAngleScore * 0.22 +
      aspectScore * 0.14 +
      borderScore * 0.08
    );

    return {
      corners: [tl, tr, br, bl],
      width: Math.round(maxWidth),
      height: Math.round(maxHeight),
      confidence: Number(clamp(confidence, 0, 1).toFixed(3)),
      metrics: {
        areaCoverage: Number(areaCoverage.toFixed(3)),
        fillRatio: Number(fillRatio.toFixed(3)),
        rightAngleScore: Number(rightAngleScore.toFixed(3)),
        aspectScore: Number(aspectScore.toFixed(3)),
        borderScore: Number(borderScore.toFixed(3))
      }
    };
  }

  async function detectDocument(canvas){
    await ensureOpenCv();
    const { width, height } = canvas;
    const srcMat = global.cv.imread(canvas);
    const gray = new global.cv.Mat();
    const blur = new global.cv.Mat();
    const edges = new global.cv.Mat();
    const contours = new global.cv.MatVector();
    const hierarchy = new global.cv.Mat();

    try{
      global.cv.cvtColor(srcMat, gray, global.cv.COLOR_RGBA2GRAY, 0);
      global.cv.GaussianBlur(gray, blur, new global.cv.Size(5, 5), 0, 0, global.cv.BORDER_DEFAULT);
      global.cv.Canny(blur, edges, 60, 180, 3, false);
      global.cv.findContours(edges, contours, hierarchy, global.cv.RETR_LIST, global.cv.CHAIN_APPROX_SIMPLE);

      let bestCandidate = null;

      for(let i = 0; i < contours.size(); i += 1){
        const contour = contours.get(i);
        const perimeter = global.cv.arcLength(contour, true);
        const approx = new global.cv.Mat();
        global.cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
        const area = Math.abs(global.cv.contourArea(contour));
        const isConvex = approx.rows === 4 && global.cv.isContourConvex(approx);
        if(isConvex && area > width * height * 0.08){
          const points = [];
          for(let j = 0; j < 4; j += 1){
            points.push({ x: approx.intPtr(j, 0)[0], y: approx.intPtr(j, 0)[1] });
          }
          const candidate = buildCandidateScore(points, area, width, height);
          if(candidate.confidence >= 0.42 && (!bestCandidate || candidate.confidence > bestCandidate.confidence)){
            bestCandidate = candidate;
          }
        }
        approx.delete();
        contour.delete();
      }

      if(!bestCandidate){
        return {
          detected: false,
          corners: defaultCorners(width, height),
          confidence: 0,
          metrics: null
        };
      }

      return {
        detected: true,
        corners: bestCandidate.corners,
        width: bestCandidate.width,
        height: bestCandidate.height,
        confidence: bestCandidate.confidence,
        metrics: bestCandidate.metrics
      };
    } finally {
      srcMat.delete();
      gray.delete();
      blur.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  global.AppVisionDocumentDetector = {
    ensureOpenCv,
    detectDocument,
    defaultCorners,
    orderCorners
  };
})(window);
