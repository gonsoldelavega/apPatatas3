(function(global){
  function renderScannerCamera(){
    return `<section class="scanner-screen">
      <div class="scanner-stage">
        <video id="scannerVideo" class="scanner-video" autoplay playsinline muted></video>
        <canvas id="scannerOverlay" class="scanner-overlay"></canvas>
        <div class="scanner-stage-top">
          <div>
            <h2>Escanear documento</h2>
            <p>Coloca la factura dentro de la guia y pulsa capturar cuando se vea nitida.</p>
          </div>
          <button type="button" class="ghost" data-scanner-action="close">Cerrar</button>
        </div>
        <div class="scanner-stage-bottom">
          <p class="scanner-hint" id="scannerHint">Usa la camara trasera y acerca la factura hasta que el texto se vea claro.</p>
          <div class="scanner-camera-actions scanner-camera-actions-center">
            <button type="button" class="primary scanner-capture-btn" data-scanner-action="capture">Capturar</button>
          </div>
          <input type="file" id="scannerFileInput" accept="image/*" style="display:none;">
          <div class="scanner-camera-actions scanner-camera-actions-center">
            <button type="button" class="ghost" data-scanner-action="upload">Cargar desde galería</button>
          </div>
        </div>
      </div>
    </section>`;
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

  function drawGuide(overlay){
    const ctx = overlay.getContext("2d");
    const width = parseFloat(overlay.style.width) || overlay.width;
    const height = parseFloat(overlay.style.height) || overlay.height;
    ctx.clearRect(0, 0, width, height);

    const guideWidth = width * 0.82;
    const guideHeight = height * 0.58;
    const x = (width - guideWidth) / 2;
    const y = (height - guideHeight) / 2;
    const radius = 24;

    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(0, 0, width, height);
    ctx.clearRect(x, y, guideWidth, guideHeight);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + guideWidth - radius, y);
    ctx.quadraticCurveTo(x + guideWidth, y, x + guideWidth, y + radius);
    ctx.lineTo(x + guideWidth, y + guideHeight - radius);
    ctx.quadraticCurveTo(x + guideWidth, y + guideHeight, x + guideWidth - radius, y + guideHeight);
    ctx.lineTo(x + radius, y + guideHeight);
    ctx.quadraticCurveTo(x, y + guideHeight, x, y + guideHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();

    const corner = 26;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#3D7A5A";
    [
      [[x, y + corner], [x, y], [x + corner, y]],
      [[x + guideWidth - corner, y], [x + guideWidth, y], [x + guideWidth, y + corner]],
      [[x + guideWidth, y + guideHeight - corner], [x + guideWidth, y + guideHeight], [x + guideWidth - corner, y + guideHeight]],
      [[x + corner, y + guideHeight], [x, y + guideHeight], [x, y + guideHeight - corner]]
    ].forEach(points => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      ctx.lineTo(points[1][0], points[1][1]);
      ctx.lineTo(points[2][0], points[2][1]);
      ctx.stroke();
    });
    ctx.restore();
  }

  function mountScannerCamera(root, deps){
    const video = root.querySelector("#scannerVideo");
    const overlay = root.querySelector("#scannerOverlay");
    const hint = root.querySelector("#scannerHint");
    const fileInput = root.querySelector("#scannerFileInput");
    let stream = null;
    let unmounted = false;

    const onResize = () => {
      fitOverlayToVideo(video, overlay);
      drawGuide(overlay);
    };

    async function capture(){
      try{
        hint.textContent = "Capturando en alta resolucion...";
        const canvas = deps.camera.captureFrame(video);
        const detection = await deps.detector.detectDocument(canvas).catch(() => null);
        deps.onCapture({
          sourceCanvas: canvas,
          corners: detection?.corners || deps.detector.defaultCorners(canvas.width, canvas.height),
          detected: Boolean(detection?.detected),
          confidence: detection?.confidence || 0
        });
      }catch(error){
        hint.textContent = "No se pudo capturar la imagen.";
        deps.onError?.(error);
      }
    }

    root.querySelector('[data-scanner-action="capture"]').addEventListener("click", capture);
    root.querySelector('[data-scanner-action="upload"]').addEventListener("click", () => {
      fileInput.click();
    });
    root.querySelector('[data-scanner-action="close"]').addEventListener("click", () => deps.onClose());
    fileInput.addEventListener("change", async e => {
      const file = e.target.files?.[0];
      if(!file) return;
      try{
        hint.textContent = "Cargando imagen...";
        const dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          deps.onCapture({
            sourceCanvas: canvas,
            corners: deps.detector.defaultCorners(canvas.width, canvas.height),
            detected: false,
            confidence: 0
          });
        };
        img.onerror = error => {
          hint.textContent = "No se pudo cargar la imagen seleccionada.";
          deps.onError?.(error);
        };
        img.src = dataUrl;
      }catch(error){
        hint.textContent = "No se pudo leer el archivo seleccionado.";
        deps.onError?.(error);
      }finally{
        fileInput.value = "";
      }
    });

    deps.camera.startCamera(video).then(currentStream => {
      if(unmounted){
        deps.camera.stopCamera(currentStream);
        return;
      }
      stream = currentStream;
      onResize();
      hint.textContent = "Listo para capturar.";
    }).catch(error => {
      hint.textContent = "La camara no esta disponible en este dispositivo o navegador.";
      deps.onError?.(error);
    });

    window.addEventListener("resize", onResize);

    return {
      teardown(){
        unmounted = true;
        window.removeEventListener("resize", onResize);
        deps.camera.stopCamera(stream);
      }
    };
  }

  global.AppUIScannerCamera = {
    renderScannerCamera,
    mountScannerCamera
  };
})(window);
