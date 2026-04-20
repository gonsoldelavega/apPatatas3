(function(global){

  function renderScannerCropEditor(capture, state){
    return `<section class="scanner-screen" style="display:flex;flex-direction:column;height:100vh;height:100dvh;background:#000;position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;">
      <div style="position:absolute;top:0;left:0;right:0;z-index:10;padding:12px 16px;background:linear-gradient(to bottom,rgba(0,0,0,0.7),transparent);pointer-events:none;">
        <p style="color:#fff;font-size:14px;margin:0;text-align:center;">Arrastra las esquinas para ajustar el documento</p>
      </div>
      <div id="cropImageArea" style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <canvas id="scannerCropCanvas" style="display:block;max-width:100%;max-height:100%;touch-action:none;"></canvas>
      </div>
      <div id="cropButtons" style="background:rgba(0,0,0,0.9);padding:16px;display:flex;flex-direction:column;gap:10px;flex-shrink:0;">
        <div style="display:flex;gap:10px;">
          <button type="button" id="cropRetakeBtn" style="flex:1;padding:14px;border-radius:12px;border:2px solid #fff;background:transparent;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Repetir</button>
          <button type="button" id="cropProcessBtn" style="flex:2;padding:14px;border-radius:12px;border:none;background:#3D7A5A;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">${state.processing ? "Procesando..." : "Procesar con IA"}</button>
        </div>
        <button type="button" id="cropSaveRawBtn" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:rgba(255,255,255,0.7);font-size:13px;cursor:pointer;">Guardar imagen sin procesar</button>
        <div id="cropStatus" style="text-align:center;color:#fff;font-size:13px;min-height:20px;"></div>
      </div>
    </section>`;
  }

  function mountScannerCropEditor(root, deps){
    const canvas = root.querySelector("#scannerCropCanvas");
    const ctx = canvas.getContext("2d");
    const statusEl = root.querySelector("#cropStatus");
    const processBtn = root.querySelector("#cropProcessBtn");
    const retakeBtn = root.querySelector("#cropRetakeBtn");
    const saveRawBtn = root.querySelector("#cropSaveRawBtn");

    const img = new Image();
    let dpr = window.devicePixelRatio || 1;
    let cssW = 0;
    let cssH = 0;
    let imageScale = 1;
    let imageOffsetX = 0;
    let imageOffsetY = 0;
    let draggingIndex = -1;

    // Points are stored in CSS pixel space
    let points = [];

    function defaultPoints(){
      const pad = 0.12;
      return [
        { x: cssW * pad,       y: cssH * pad },        // top-left
        { x: cssW * (1-pad),   y: cssH * pad },        // top-right
        { x: cssW * (1-pad),   y: cssH * (1-pad) },    // bottom-right
        { x: cssW * pad,       y: cssH * (1-pad) }     // bottom-left
      ];
    }

    function cornersToDisplayPoints(corners){
      if(!Array.isArray(corners) || corners.length !== 4) return defaultPoints();
      const valid = corners.every(c => c && Number.isFinite(c.x) && Number.isFinite(c.y));
      if(!valid) return defaultPoints();

      // corners come as [TL, TR, BR, BL] from detector
      // keep that same order for drawing the polygon without crossing
      const order = [corners[0], corners[1], corners[2], corners[3]];
      return order.map(c => ({
        x: imageOffsetX + c.x * imageScale,
        y: imageOffsetY + c.y * imageScale
      }));
    }

    function exportPoints(){
      // Convert back from display (CSS) to image coordinates
      // Return as [TL, TR, BR, BL] to match the detector/display order
      const [tl, tr, br, bl] = points;
      function toImg(p){
        return {
          x: Math.max(0, Math.min(img.naturalWidth,  (p.x - imageOffsetX) / imageScale)),
          y: Math.max(0, Math.min(img.naturalHeight, (p.y - imageOffsetY) / imageScale))
        };
      }
      return [toImg(tl), toImg(tr), toImg(br), toImg(bl)];
    }

    function draw(){
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw image
      ctx.drawImage(img, imageOffsetX, imageOffsetY, img.naturalWidth * imageScale, img.naturalHeight * imageScale);

      // Draw polygon
      ctx.save();
      ctx.beginPath();
      points.forEach((p, i) => {
        if(i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(61,122,90,0.15)";
      ctx.fill();
      ctx.strokeStyle = "#3D7A5A";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // Draw corner handles
      points.forEach((p, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
        ctx.fillStyle = "#3D7A5A";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        // Number label
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i + 1, p.x, p.y);
        ctx.restore();
      });
    }

    function localXY(clientX, clientY){
      const rect = canvas.getBoundingClientRect();
      // rect is in CSS pixels, canvas coords are also in CSS pixels (we scale with dpr internally)
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    function findClosest(x, y){
      let best = -1;
      let bestDist = Infinity;
      points.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if(d < bestDist){ bestDist = d; best = i; }
      });
      return bestDist < 55 ? best : -1;
    }

    function clamp(p){
      return {
        x: Math.max(imageOffsetX, Math.min(imageOffsetX + img.naturalWidth * imageScale, p.x)),
        y: Math.max(imageOffsetY, Math.min(imageOffsetY + img.naturalHeight * imageScale, p.y))
      };
    }

    // Pointer events (desktop + stylus)
    canvas.addEventListener("pointerdown", e => {
      const p = localXY(e.clientX, e.clientY);
      const idx = findClosest(p.x, p.y);
      if(idx === -1) return;
      draggingIndex = idx;
      try{ canvas.setPointerCapture(e.pointerId); }catch{}
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", e => {
      if(draggingIndex === -1) return;
      const p = clamp(localXY(e.clientX, e.clientY));
      points[draggingIndex] = p;
      draw();
      e.preventDefault();
    });
    canvas.addEventListener("pointerup", e => {
      draggingIndex = -1;
      try{ canvas.releasePointerCapture(e.pointerId); }catch{}
    });
    canvas.addEventListener("pointercancel", () => { draggingIndex = -1; });

    // Touch events (mobile)
    canvas.addEventListener("touchstart", e => {
      const t = e.touches[0];
      if(!t) return;
      const p = localXY(t.clientX, t.clientY);
      const idx = findClosest(p.x, p.y);
      if(idx === -1) return;
      draggingIndex = idx;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchmove", e => {
      if(draggingIndex === -1) return;
      const t = e.touches[0];
      if(!t) return;
      const p = clamp(localXY(t.clientX, t.clientY));
      points[draggingIndex] = p;
      draw();
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchend", () => { draggingIndex = -1; }, { passive: true });
    canvas.addEventListener("touchcancel", () => { draggingIndex = -1; }, { passive: true });

    // Buttons
    retakeBtn.addEventListener("click", () => deps.onRetake());

    processBtn.addEventListener("click", async () => {
      processBtn.textContent = "Procesando...";
      processBtn.disabled = true;
      retakeBtn.disabled = true;
      saveRawBtn.disabled = true;
      statusEl.textContent = "Analizando factura con IA...";
      try{
        await deps.onProcess(exportPoints());
      }catch(err){
        processBtn.textContent = "Procesar con IA";
        processBtn.disabled = false;
        retakeBtn.disabled = false;
        saveRawBtn.disabled = false;
        statusEl.textContent = "Error al procesar. IntÃ©ntalo de nuevo.";
      }
    });

    saveRawBtn.addEventListener("click", () => {
      deps.onSaveRaw ? deps.onSaveRaw() : deps.onProcess(exportPoints(), true);
    });

    // Load image and setup canvas
    img.onload = () => {
      const area = root.querySelector("#cropImageArea");
      const bounds = area.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;

      cssW = Math.max(1, bounds.width);
      cssH = Math.max(1, bounds.height);

      // Canvas internal size = CSS size * dpr for sharp rendering
      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width  = cssW + "px";
      canvas.style.height = cssH + "px";

      // Scale context so we can work in CSS pixels
      ctx.scale(dpr, dpr);

      // Fit image inside CSS area
      imageScale = Math.min(cssW / img.naturalWidth, cssH / img.naturalHeight);
      imageOffsetX = (cssW - img.naturalWidth  * imageScale) / 2;
      imageOffsetY = (cssH - img.naturalHeight * imageScale) / 2;

      // Set corner points
      points = cornersToDisplayPoints(deps.capture.corners);
      draw();
    };

    img.onerror = () => {
      statusEl.textContent = "No se pudo cargar la imagen capturada.";
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
