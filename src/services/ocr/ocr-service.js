(function(global){
  let worker = null;
  let requestId = 0;
  const pending = new Map();

  function ensureWorker(){
    if(worker) return worker;
    worker = new Worker("./src/services/ocr/ocr-worker.js");
    worker.addEventListener("message", event => {
      const { id, type, payload } = event.data || {};
      const entry = pending.get(id);
      if(!entry) return;
      if(type === "progress"){
        entry.onProgress?.(payload);
        return;
      }
      if(type === "result"){
        pending.delete(id);
        entry.resolve(payload);
        return;
      }
      if(type === "error"){
        pending.delete(id);
        entry.reject(new Error(payload?.message || "ocr-error"));
      }
    });
    return worker;
  }

  function recognizeImage(dataUrl, options = {}){
    ensureWorker();
    return new Promise((resolve, reject) => {
      const id = `ocr-${Date.now()}-${requestId += 1}`;
      pending.set(id, { resolve, reject, onProgress: options.onProgress });
      worker.postMessage({
        id,
        type:"recognize",
        payload:{ dataUrl }
      });
    });
  }

  global.AppOcrService = {
    recognizeImage
  };
})(window);
