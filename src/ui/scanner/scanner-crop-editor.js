(function(global){
  function renderScannerCropEditor(capture){
    const detectionFailed = capture?.detected === false;
    return `<section class="scanner-screen">
      <div class="scanner-editor">
        <div class="scanner-editor-top">
          <div>
            <h2>Ajustar bordes</h2>
            <p>${detectionFailed
              ? "No se ha detectado el documento con seguridad. Ajusta las cuatro esquinas manualmente o usa la imagen completa."
              : "Arrastra las cuatro esquinas si la detección automática no ha quedado bien."}</p>
          </div>
          <div class="scanner-top-actions">
            <span class="chip">${detectionFailed ? "Ajuste requerido" : "Recorte manual"}</span>
            <button type="button" class="ghost" data-scanner-action="close">Salir</button>
          </div>
        </div>
        ${detectionFailed ? '<div class="scanner-warning">La detección automática no encontró un contorno válido de 4 puntos. No se aplicará corrección automática salvo que confirmes un recorte manual.</div>' : ""}
        <div class="scanner-editor-canvas-wrap">
          <canvas id="scannerCropCanvas" class="scanner-crop-canvas"></canvas>
        </div>
        <div class="scanner-editor-actions">
          <button type="button" class="ghost" data-scanner-action="retake">Repetir</button>
          <button type="button" class="ghost" data-scanner-action="back-preview">Volver</button>
          ${detectionFailed ? '<button type="button" class="ghost" data-scanner-action="use-full-image">Usar imagen completa</button>' : ""}
          <button type="button" class="primary" data-scanner-action="apply-crop"${detectionFailed ? " disabled" : ""}>Usar recorte</button>
        </div>
      </div>
    </section>`;
  }

  function mountScannerCropEditor(root, deps){
    const canvas = root.querySelector("#scannerCropCanvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    let points = deps.capture.corners.map(point => ({ ...point }));
    const initialPoints = deps.capture.corners.map(point => ({ ...point }));
    let draggingIndex = -1;
    let scaleX = 1;
    let scaleY = 1;
    let hasManualAdjustment = deps.capture.detected !== false;
    const applyButton = root.querySelector('[data-scanner-action="apply-crop"]');

    function syncApplyState(){
      if(!applyButton) return;
      applyButton.disabled = deps.capture.detected === false && !hasManualAdjustment;
    }

    function draw(){
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(246, 165, 26, 0.14)";
      ctx.strokeStyle = "rgba(246, 165, 26, 0.96)";
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
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#f6a51a";
        ctx.lineWidth = 4;
        ctx.stroke();
      });
    }

    function pointerToPoint(event){
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / scaleX,
        y: (event.clientY - rect.top) / scaleY
      };
    }

    function closestCorner(point){
      let index = -1;
      let best = Number.POSITIVE_INFINITY;
      points.forEach((corner, cornerIndex) => {
        const distance = Math.hypot(corner.x - point.x, corner.y - point.y);
        if(distance < best){
          best = distance;
          index = cornerIndex;
        }
      });
      return best <= 40 ? index : -1;
    }

    function onPointerDown(event){
      const point = pointerToPoint(event);
      draggingIndex = closestCorner(point);
      if(draggingIndex !== -1) canvas.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event){
      if(draggingIndex === -1) return;
      const point = pointerToPoint(event);
      points[draggingIndex] = {
        x: Math.max(0, Math.min(img.width, point.x)),
        y: Math.max(0, Math.min(img.height, point.y))
      };
      hasManualAdjustment = points.some((corner, index) => {
        const initial = initialPoints[index];
        return !initial || corner.x !== initial.x || corner.y !== initial.y;
      });
      syncApplyState();
      draw();
    }

    function onPointerUp(event){
      if(draggingIndex !== -1) canvas.releasePointerCapture(event.pointerId);
      draggingIndex = -1;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    root.querySelector('[data-scanner-action="retake"]').addEventListener("click", () => deps.onRetake());
    root.querySelector('[data-scanner-action="back-preview"]').addEventListener("click", () => deps.onBackPreview());
    root.querySelector('[data-scanner-action="close"]').addEventListener("click", () => deps.onClose());
    root.querySelector('[data-scanner-action="use-full-image"]')?.addEventListener("click", async () => {
      await deps.onUseFullImage();
    });
    applyButton?.addEventListener("click", async () => {
      if(applyButton.disabled) return;
      await deps.onApply(points);
    });

    img.onload = () => {
      const maxWidth = Math.min(window.innerWidth - 32, 920);
      const maxHeight = Math.min(window.innerHeight - 220, 1200);
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      scaleX = canvas.width / img.width;
      scaleY = canvas.height / img.height;
      syncApplyState();
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
