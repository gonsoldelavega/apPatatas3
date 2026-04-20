(function(global){
  function renderScannerCropEditor(capture, state){
    return `<section class="scanner-screen scanner-review-container">
      <div class="scanner-image-area">
        <div class="scanner-editor-top scanner-review-top">
          <div>
            <h2>Ajustar esquinas</h2>
            <p>Arrastra las cuatro esquinas del documento y luego pulsa procesar.</p>
          </div>
        </div>
        <div class="scanner-editor-canvas-wrap scanner-editor-canvas-wrap-strong scanner-review-canvas-wrap">
          <canvas id="scannerCropCanvas" class="scanner-crop-canvas"></canvas>
        </div>
      </div>
      <div class="scanner-buttons-area">
        <div class="scanner-editor-actions scanner-review-actions">
          <button type="button" class="ghost" data-scanner-action="retake">Repetir</button>
          <button type="button" class="primary" data-scanner-action="process"${state.processing ? " disabled" : ""}>${state.processing ? "Procesando..." : "Procesar con IA"}</button>
        </div>
      </div>
    </section>`;
  }

  function mountScannerCropEditor(root, deps){
    const canvas = root.querySelector("#scannerCropCanvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    const touchRadius = 30;
    let dpr = 1;
    let points = [];
    let draggingIndex = -1;
    let imageScale = 1;
    let imageOffsetX = 0;
    let imageOffsetY = 0;

    function defaultDisplayCorners(){
      return [
        { x: canvas.width * 0.10, y: canvas.height * 0.10 },
        { x: canvas.width * 0.90, y: canvas.height * 0.10 },
        { x: canvas.width * 0.10, y: canvas.height * 0.90 },
        { x: canvas.width * 0.90, y: canvas.height * 0.90 }
      ];
    }

    function validCorners(corners){
      return Array.isArray(corners)
        && corners.length === 4
        && corners.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    }

    function displayPointFromImage(point){
      return {
        x: imageOffsetX + point.x * imageScale,
        y: imageOffsetY + point.y * imageScale
      };
    }

    function mapImageCornersToDisplay(corners){
      if(!validCorners(corners)) return defaultDisplayCorners();
      return [
        displayPointFromImage(corners[0]),
        displayPointFromImage(corners[1]),
        displayPointFromImage(corners[2]),
        displayPointFromImage(corners[3])
      ];
    }

    function imagePointFromDisplay(point){
      return {
        x: Math.max(0, Math.min(img.width, (point.x - imageOffsetX) / imageScale)),
        y: Math.max(0, Math.min(img.height, (point.y - imageOffsetY) / imageScale))
      };
    }

    function exportPoints(){
      return [
        imagePointFromDisplay(points[0]),
        imagePointFromDisplay(points[1]),
        imagePointFromDisplay(points[2]),
        imagePointFromDisplay(points[3])
      ];
    }

    function draw(){
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.drawImage(img, imageOffsetX, imageOffsetY, img.width * imageScale, img.height * imageScale);

      ctx.fillStyle = "rgba(61,122,90,0.18)";
      ctx.strokeStyle = "rgba(61,122,90,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      points.forEach((point, index) => {
        if(index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, touchRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#3D7A5A";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      });
    }

    function localPoint(clientX, clientY){
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    function closestCorner(point){
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      points.forEach((corner, index) => {
        const distance = Math.hypot(corner.x - point.x, corner.y - point.y);
        if(distance < bestDistance){
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestDistance <= 48 ? bestIndex : -1;
    }

    function moveCorner(point){
      if(draggingIndex === -1) return;
      const minX = imageOffsetX;
      const minY = imageOffsetY;
      const maxX = imageOffsetX + img.width * imageScale;
      const maxY = imageOffsetY + img.height * imageScale;
      points[draggingIndex] = {
        x: Math.max(minX, Math.min(maxX, point.x)),
        y: Math.max(minY, Math.min(maxY, point.y))
      };
      draw();
    }

    function onPointerDown(event){
      const point = localPoint(event.clientX, event.clientY);
      const found = closestCorner(point);
      if(found === -1) return;
      draggingIndex = found;
      if(event.pointerId != null){
        try{ canvas.setPointerCapture(event.pointerId); }catch{}
      }
    }

    function onPointerMove(event){
      if(draggingIndex === -1) return;
      moveCorner(localPoint(event.clientX, event.clientY));
    }

    function onPointerEnd(event){
      draggingIndex = -1;
      if(event?.pointerId != null){
        try{ canvas.releasePointerCapture(event.pointerId); }catch{}
      }
    }

    function onTouchStart(event){
      const touch = event.touches[0];
      if(!touch) return;
      const found = closestCorner(localPoint(touch.clientX, touch.clientY));
      if(found === -1) return;
      draggingIndex = found;
    }

    function onTouchMove(event){
      if(draggingIndex === -1) return;
      const touch = event.touches[0];
      if(!touch) return;
      event.preventDefault();
      moveCorner(localPoint(touch.clientX, touch.clientY));
    }

    function onTouchEnd(){
      draggingIndex = -1;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerEnd);
    canvas.addEventListener("pointercancel", onPointerEnd);
    canvas.addEventListener("touchstart", onTouchStart, { passive:true });
    canvas.addEventListener("touchmove", onTouchMove, { passive:false });
    canvas.addEventListener("touchend", onTouchEnd, { passive:true });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive:true });

    root.querySelector('[data-scanner-action="retake"]').addEventListener("click", () => deps.onRetake());
    root.querySelector('[data-scanner-action="process"]').addEventListener("click", async () => {
      await deps.onProcess(exportPoints());
    });

    img.onload = () => {
      const wrap = root.querySelector(".scanner-review-canvas-wrap");
      const bounds = wrap.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.round(bounds.width));
      const cssHeight = Math.max(1, Math.round(bounds.height));
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      imageScale = Math.min(cssWidth / img.width, cssHeight / img.height);
      imageOffsetX = (cssWidth - img.width * imageScale) / 2;
      imageOffsetY = (cssHeight - img.height * imageScale) / 2;
      points = mapImageCornersToDisplay(deps.capture.corners);
      draw();
    };
    img.src = deps.capture.sourceDataUrl;

    return {
      teardown(){ /* no-op */ }
    };
  }

  global.AppUIScannerCropEditor = {
    renderScannerCropEditor,
    mountScannerCropEditor
  };
})(window);
