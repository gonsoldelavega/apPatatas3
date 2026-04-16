(function(global){
  let pdfReadyPromise = null;

  function ensurePdfLib(){
    if(global.PDFLib?.PDFDocument) return Promise.resolve();
    if(pdfReadyPromise) return pdfReadyPromise;
    pdfReadyPromise = new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js");
      if(existing){
        if(existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load", () => resolve(), { once:true });
        existing.addEventListener("error", reject, { once:true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js";
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return pdfReadyPromise;
  }

  async function dataUrlToBytes(dataUrl){
    const response = await fetch(dataUrl);
    return new Uint8Array(await response.arrayBuffer());
  }

  function fitIntoPage(imageWidth, imageHeight, pageWidth, pageHeight, margin){
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
      width,
      height,
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2
    };
  }

  async function exportPagesToPdf(pages, options = {}){
    await ensurePdfLib();
    const { PDFDocument } = global.PDFLib;
    const pdf = await PDFDocument.create();
    const pageWidth = options.pageWidth || 595.28;
    const pageHeight = options.pageHeight || 841.89;
    const margin = options.margin || 24;
    for(const page of pages){
      const filter = page.selectedFilter || options.filter || "document";
      const dataUrl = page.variants?.[filter] || page.variants?.document || page.variants?.color || page.source;
      if(!dataUrl) continue;
      const bytes = await dataUrlToBytes(dataUrl);
      const image = await pdf.embedJpg(bytes).catch(async () => pdf.embedPng(bytes));
      const imageDims = image.scale(1);
      const pageRef = pdf.addPage([pageWidth, pageHeight]);
      const placement = fitIntoPage(imageDims.width, imageDims.height, pageWidth, pageHeight, margin);
      pageRef.drawImage(image, placement);
    }
    const pdfBytes = await pdf.save({ useObjectStreams:true });
    return new Blob([pdfBytes], { type:"application/pdf" });
  }

  global.AppPdfExportService = {
    exportPagesToPdf
  };
})(window);
