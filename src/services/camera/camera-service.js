(function(global){
  async function maximizeTrackResolution(track){
    if(!track?.getCapabilities || !track?.applyConstraints) return;
    try{
      const capabilities = track.getCapabilities();
      const width = capabilities.width?.max;
      const height = capabilities.height?.max;
      if(!width || !height) return;
      await track.applyConstraints({
        width: { ideal: width },
        height: { ideal: height }
      });
    }catch{
      // Some browsers reject capability-based constraints after startup.
    }
  }

  async function startCamera(video, options = {}){
    if(!navigator.mediaDevices?.getUserMedia){
      throw new Error("camera-unsupported");
    }
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal:"environment" },
        width: { ideal: options.previewWidth || 3840 },
        height: { ideal: options.previewHeight || 2160 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();
    await maximizeTrackResolution(stream.getVideoTracks?.()[0]);
    return stream;
  }

  function stopCamera(stream){
    if(!stream) return;
    stream.getTracks().forEach(track => track.stop());
  }

  function captureFrame(video, options = {}){
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const requestedMaxWidth = Number.isFinite(options.maxWidth) ? options.maxWidth : sourceWidth;
    const targetWidth = Math.min(requestedMaxWidth, sourceWidth);
    const scale = targetWidth / sourceWidth;
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha:false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
    return canvas;
  }

  function createPreviewCanvas(video, maxWidth = 960){
    return captureFrame(video, { maxWidth });
  }

  global.AppCameraService = {
    startCamera,
    stopCamera,
    captureFrame,
    createPreviewCanvas
  };
})(window);
