(function(global){
  function renderScannerCropEditor(capture, state){
    return `<section class="scanner-screen">
      <div class="scanner-editor">
        <div class="scanner-editor-top">
          <div>
            <h2>Ajustar esquinas</h2>
            <p>Arrastra las cuatro esquinas hasta encajar el documento y luego procesa con IA.</p>
          </div>
          <div class="scanner-top-actions">
            <button type="button" class="ghost" data-scanner-action="close">Cerrar</button>
          </div>
        </div>
        <div class="scanner-editor-canvas-wrap scanner-editor-canvas-wrap-strong">
          <canvas id="scannerCropCanvas" class="scanner-crop-canvas"></canvas>
        </div>
        <div class="scanner-editor-actions scanner-editor-actions-fixed">
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
    let points = deps.capture.corners.map(point => ({ ...point }));
    let draggingIndex = -1;
    let scaleX = 1;
    let scaleY = 1;
    let pointerId = null;

    function draw(){
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(61,122,90,0.18)";
      ctx.strokeStyle = "rgba(61,122,90,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = point.x * scaleX;
        const y = point.y * scaleY;
        if(index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      points.forEach(point => {
        const x = point.x * scaleX;
        const y = point.y * scaleY;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fillStyle = "#3D7A5A";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      });
    }

    function pointerToImagePoint(event){
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / scaleX,
        y: (event.clientY - rect.top) / scaleY
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
      return bestDistance <= 54 ? bestIndex : -1;
    }

    function onPointerDown(event){
      const point = pointerToImagePoint(event);
      const nextIndex = closestCorner(point);
      if(nextIndex === -1) return;
      draggingIndex = nextIndex;
      pointerId = event.pointerId;
      canvas.setPointerCapture(pointerId);
    }

    function onPointerMove(event){
      if(draggingIndex === -1) return;
      const point = pointerToImagePoint(event);
      points[draggingIndex] = {
        x: Math.max(0, Math.min(img.width, point.x)),
        y: Math.max(0, Math.min(img.height, point.y))
      };
      draw();
    }

    function endDrag(event){
      if(draggingIndex === -1) return;
      if(pointerId != null){
        try{ canvas.releasePointerCapture(pointerId); }catch{}
      }
      draggingIndex = -1;
      pointerId = null;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    root.querySelector('[data-scanner-action="retake"]').addEventListener("click", () => deps.onRetake());
    root.querySelector('[data-scanner-action="close"]').addEventListener("click", () => deps.onClose());
    root.querySelector('[data-scanner-action="process"]').addEventListener("click", async () => {
      await deps.onProcess(points);
    });

    img.onload = () => {
      const maxWidth = Math.min(window.innerWidth - 24, 960);
      const maxHeight = Math.min(window.innerHeight - 240, 1200);
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      scaleX = canvas.width / img.width;
      scaleY = canvas.height / img.height;
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
