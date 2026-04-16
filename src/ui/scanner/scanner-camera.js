(function(global){
  function renderScannerCamera(state){
    return `<section class="scanner-screen">
      <div class="scanner-stage">
        <video id="scannerVideo" class="scanner-video" autoplay playsinline muted></video>
        <canvas id="scannerOverlay" class="scanner-overlay"></canvas>
        <div class="scanner-stage-top">
          <div>
            <h2>Escanear documento</h2>
            <p>Apunta al documento completo. La detección intenta capturarlo sola cuando esté estable.</p>
          </div>
          <span class="chip">${state.options.autoCapture ? "Auto" : "Manual"}</span>
        </div>
        <div class="scanner-stage-bottom">
          <p class="scanner-hint" id="scannerHint">Buscando bordes del documento…</p>
          <div class="scanner-camera-actions">
            <button type="button" class="ghost" data-scanner-action="close">Cerrar</button>
            <button type="button" class="ghost" data-scanner-action="toggle-auto">${state.options.autoCapture ? "Auto ON" : "Auto OFF"}</button>
            <button type="button" class="primary scanner-capture-btn" data-scanner-action="capture">Capturar</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  function drawOverlay(overlay, corners, detected){
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if(!corners?.length) return;
    ctx.lineWidth = 4;
    ctx.strokeStyle = detected ? "rgba(56, 214, 140, 0.95)" : "rgba(246, 165, 26, 0.95)";
    ctx.fillStyle = detected ? "rgba(56, 214, 140, 0.22)" : "rgba(246, 165, 26, 0.18)";
    ctx.beginPath();
    corners.forEach((point, index) => {
      if(index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    corners.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = detected ? "rgba(56, 214, 140, 1)" : "rgba(246, 165, 26, 1)";
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }

  function fitOverlayToVideo(video, overlay){
    const rect = video.getBoundingClientRect();
    const ratio = global.devicePixelRatio || 1;
    overlay.width = Math.max(1, Math.round(rect.width * ratio));
    overlay.height = Math.max(1, Math.round(rect.height * ratio));
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    const ctx = overlay.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function scaleCorners(corners, sourceWidth, sourceHeight, targetWidth, targetHeight){
    return corners.map(point => ({
      x: point.x * (targetWidth / sourceWidth),
      y: point.y * (targetHeight / sourceHeight)
    }));
  }

  function averageCornerDelta(previousCorners, nextCorners){
    if(!previousCorners?.length || !nextCorners?.length || previousCorners.length !== nextCorners.length){
      return Number.POSITIVE_INFINITY;
    }
    let total = 0;
    for(let index = 0; index < previousCorners.length; index += 1){
      total += Math.hypot(
        previousCorners[index].x - nextCorners[index].x,
        previousCorners[index].y - nextCorners[index].y
      );
    }
    return total / previousCorners.length;
  }

  function smoothCorners(previousCorners, nextCorners, alpha){
    if(!previousCorners?.length || previousCorners.length !== nextCorners.length) return nextCorners.map(point => ({ ...point }));
    return nextCorners.map((point, index) => ({
      x: previousCorners[index].x + (point.x - previousCorners[index].x) * alpha,
      y: previousCorners[index].y + (point.y - previousCorners[index].y) * alpha
    }));
  }

  function mountScannerCamera(root, deps){
    const video = root.querySelector("#scannerVideo");
    const overlay = root.querySelector("#scannerOverlay");
    const hint = root.querySelector("#scannerHint");
    let stream = null;
    let detectionTimer = null;
    let latestDetection = null;
    let stableFrames = 0;
    let capturing = false;
    let unmounted = false;
    let lastAutoCaptureAt = 0;
    let smoothedDetection = null;
    const onResize = () => fitOverlayToVideo(video, overlay);
    const autoCaptureCooldownMs = 1500;

    function stopLoop(){
      if(detectionTimer) window.clearTimeout(detectionTimer);
      detectionTimer = null;
    }

    function teardown(){
      unmounted = true;
      stopLoop();
      deps.camera.stopCamera(stream);
      stream = null;
      window.removeEventListener("resize", onResize);
    }

    async function captureCurrentFrame(manual = false){
      if(capturing) return false;
      if(!manual && Date.now() - lastAutoCaptureAt < autoCaptureCooldownMs) return false;
      capturing = true;
      try{
        const sourceCanvas = deps.camera.captureFrame(video, { maxWidth: 1800 });
        const detection = await deps.detector.detectDocument(sourceCanvas);
        if(!manual) lastAutoCaptureAt = Date.now();
        deps.onCapture({
          sourceCanvas,
          corners: detection.corners,
          detected: detection.detected,
          confidence: detection.confidence,
          manual
        });
        return true;
      } catch(error){
        deps.onError?.(error);
        return false;
      } finally {
        capturing = false;
      }
    }

    async function scanFrame(){
      if(unmounted || !video.videoWidth || !video.videoHeight){
        detectionTimer = window.setTimeout(scanFrame, 220);
        return;
      }
      try{
        fitOverlayToVideo(video, overlay);
        const previewCanvas = deps.camera.createPreviewCanvas(video, 960);
        const detection = await deps.detector.detectDocument(previewCanvas);
        const diagonal = Math.hypot(previewCanvas.width, previewCanvas.height) || 1;
        let geometryConsistency = 0;
        let smoothedCorners = detection.corners;
        if(detection.detected && smoothedDetection?.detected){
          const delta = averageCornerDelta(smoothedDetection.corners, detection.corners);
          const normalizedDelta = delta / diagonal;
          geometryConsistency = Math.max(0, 1 - normalizedDelta / 0.035);
          const alpha = geometryConsistency > 0.72 ? 0.22 : 0.38;
          smoothedCorners = smoothCorners(smoothedDetection.corners, detection.corners, alpha);
        } else if(detection.detected){
          geometryConsistency = detection.confidence;
          smoothedCorners = detection.corners.map(point => ({ ...point }));
        }

        const liveDetection = {
          ...detection,
          corners: detection.detected ? smoothedCorners : detection.corners,
          width: previewCanvas.width,
          height: previewCanvas.height,
          geometryConsistency: Number(geometryConsistency.toFixed(3)),
          stable: detection.detected && detection.confidence >= 0.58 && geometryConsistency >= 0.62
        };
        smoothedDetection = detection.detected
          ? {
              detected: true,
              corners: liveDetection.corners.map(point => ({ ...point })),
              confidence: liveDetection.confidence
            }
          : null;
        latestDetection = liveDetection;
        const rect = video.getBoundingClientRect();
        drawOverlay(
          overlay,
          scaleCorners(liveDetection.corners, previewCanvas.width, previewCanvas.height, rect.width, rect.height),
          liveDetection.detected
        );
        hint.textContent = liveDetection.detected
          ? `Documento detectado (${Math.round(liveDetection.confidence * 100)}%)${liveDetection.stable ? "" : " · estabilizando"}.`
          : "No se detecta bien el documento. Puedes capturar y ajustar manualmente.";

        if(liveDetection.stable && deps.state.options.autoCapture){
          stableFrames += 1;
          if(stableFrames >= 4){
            stableFrames = 0;
            const didCapture = await captureCurrentFrame(false);
            if(didCapture) return;
          }
        } else {
          stableFrames = 0;
        }
      } catch(error){
        hint.textContent = "No se pudo analizar la imagen en tiempo real.";
        deps.onError?.(error);
      }
      detectionTimer = window.setTimeout(scanFrame, 260);
    }

    root.querySelector('[data-scanner-action="capture"]').addEventListener("click", () => captureCurrentFrame(true));
    root.querySelector('[data-scanner-action="close"]').addEventListener("click", () => deps.onClose());
    root.querySelector('[data-scanner-action="toggle-auto"]').addEventListener("click", () => deps.onToggleAuto());

    deps.camera.startCamera(video, {}).then(currentStream => {
      stream = currentStream;
      fitOverlayToVideo(video, overlay);
      scanFrame();
    }).catch(error => {
      hint.textContent = "La cámara no está disponible en este dispositivo o navegador.";
      deps.onError?.(error);
    });

    window.addEventListener("resize", onResize);

    return {
      teardown,
      getLatestDetection: () => latestDetection
    };
  }

  global.AppUIScannerCamera = {
    renderScannerCamera,
    mountScannerCamera
  };
})(window);
