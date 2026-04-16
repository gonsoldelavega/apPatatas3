self.onmessage = async event => {
  const { id, type, payload } = event.data || {};
  if(type !== "recognize") return;
  try{
    if(!self.Tesseract){
      importScripts("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    }
    const result = await self.Tesseract.recognize(payload.dataUrl, "spa", {
      logger: message => {
        self.postMessage({ id, type:"progress", payload: message });
      }
    });
    self.postMessage({
      id,
      type:"result",
      payload: {
        text: result.data?.text || "",
        confidence: result.data?.confidence || 0
      }
    });
  }catch(error){
    self.postMessage({
      id,
      type:"error",
      payload: {
        message: error?.message || "ocr-error"
      }
    });
  }
};
