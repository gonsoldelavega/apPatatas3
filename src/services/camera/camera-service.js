(function(global){
  async function getCameraStream(constraints){
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function startCamera(video){
    if(!navigator.mediaDevices?.getUserMedia){
      throw new Error("camera-unsupported");
    }

    let stream = null;
    try{
      stream = await getCameraStream({
        audio:false,
        video:{
          facingMode:{ exact:"environment" },
          width:{ ideal:4096 },
          height:{ ideal:2160 }
        }
      });
    }catch{
      stream = await getCameraStream({
        audio:false,
        video:{
          facingMode:"environment",
          width:{ ideal:4096 },
          height:{ ideal:2160 }
        }
      });
    }

    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();
    return stream;
  }

  function stopCamera(stream){
    if(!stream) return;
    stream.getTracks().forEach(track => track.stop());
  }

  function captureFrame(video){
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha:false });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  global.AppCameraService = {
    startCamera,
    stopCamera,
    captureFrame
  };
})(window);
