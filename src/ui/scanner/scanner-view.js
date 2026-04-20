(function(global){
  let scannerRoot = null;
  let scannerController = null;

  function ensureRoot(){
    if(scannerRoot) return scannerRoot;
    scannerRoot = document.createElement("div");
    scannerRoot.id = "scannerRoot";
    document.body.appendChild(scannerRoot);
    return scannerRoot;
  }

  function today(){
    return new Date().toISOString().slice(0, 10);
  }

  function parseDataUrl(dataUrl = ""){
    const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if(!match) return null;
    return {
      mediaType: match[1],
      data: match[2]
    };
  }

  function safeJsonParse(text = ""){
    try{
      return JSON.parse(text);
    }catch{
      const fenced = String(text).match(/```json\s*([\s\S]*?)```/i);
      if(fenced){
        try{
          return JSON.parse(fenced[1]);
        }catch{}
      }
      const objectMatch = String(text).match(/\{[\s\S]*\}/);
      if(!objectMatch) return null;
      try{
        return JSON.parse(objectMatch[0]);
      }catch{
        return null;
      }
    }
  }

  function normalizeText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeExtractedResult(input = {}){
    const lines = Array.isArray(input.lineas) ? input.lineas : [];
    return {
      numero_factura: input.numero_factura || "",
      fecha: input.fecha || today(),
      proveedor_nombre: input.proveedor_nombre || "",
      proveedor_nif: input.proveedor_nif || "",
      cliente_nombre: input.cliente_nombre || "",
      cliente_nif: input.cliente_nif || "",
      lineas: lines.map(line => ({
        descripcion: line?.descripcion || "",
        cantidad: Number(line?.cantidad || 0),
        precio_unitario: Number(line?.precio_unitario || 0),
        base: Number(line?.base || 0),
        iva_pct: Number(line?.iva_pct || 0),
        total: Number(line?.total || 0)
      })),
      base_total: Number(input.base_total || 0),
      iva_total: Number(input.iva_total || 0),
      total_factura: Number(input.total_factura || 0)
    };
  }

  async function callScannerApiRoute(imageDataUrl, options){
    const anthropicKey = options.anthropicKey || global.localStorage?.getItem("anthropic-api-key") || "";
    const response = await fetch("/api/anthropic-ocr", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(anthropicKey ? { "x-anthropic-api-key":anthropicKey } : {})
      },
      body:JSON.stringify({
        imageDataUrl
      })
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || payload?.ok === false) throw new Error(payload?.error || `anthropic-${response.status}`);
    if(payload?.result && typeof payload.result === "object") return normalizeExtractedResult(payload.result);
    if(payload?.summary && typeof payload.summary === "object"){
      return normalizeExtractedResult({
        numero_factura: payload.summary.invoiceNumber || "",
        fecha: payload.summary.date || "",
        proveedor_nombre: payload.summary.supplierName || "",
        proveedor_nif: payload.summary.nif || "",
        cliente_nombre: "",
        cliente_nif: "",
        lineas: [],
        base_total: payload.summary.subtotal || 0,
        iva_total: payload.summary.iva || 0,
        total_factura: payload.summary.total || 0
      });
    }
    throw new Error("scanner-ocr-schema-invalid");
  }

  async function callAnthropicDirect(imageDataUrl, options){
    const parsedImage = parseDataUrl(imageDataUrl);
    const anthropicKey = options.anthropicKey || global.localStorage?.getItem("anthropic-api-key") || "";
    if(!parsedImage || !anthropicKey) throw new Error("missing_anthropic_key");

    const prompt = [
      "Eres un experto en extracción de datos de facturas españolas.",
      "Analiza esta imagen de factura y extrae en JSON:",
      "{",
      '  "numero_factura": string | null,',
      '  "fecha": "YYYY-MM-DD" | null,',
      '  "proveedor_nombre": string | null,',
      '  "proveedor_nif": string | null,',
      '  "cliente_nombre": string | null,',
      '  "cliente_nif": string | null,',
      '  "lineas": [{"descripcion": string | null, "cantidad": number | null, "precio_unitario": number | null, "base": number | null, "iva_pct": number | null, "total": number | null}],',
      '  "base_total": number | null,',
      '  "iva_total": number | null,',
      '  "total_factura": number | null',
      "}",
      "Si no puedes leer algún campo, ponlo como null.",
      "Responde SOLO con JSON válido, sin texto extra."
    ].join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "x-api-key":anthropicKey,
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true"
      },
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:1800,
        temperature:0,
        system:"Responde solo con JSON válido.",
        messages:[
          {
            role:"user",
            content:[
              {
                type:"image",
                source:{
                  type:"base64",
                  media_type:parsedImage.mediaType,
                  data:parsedImage.data
                }
              },
              {
                type:"text",
                text:prompt
              }
            ]
          }
        ]
      })
    });
    const payload = await response.json().catch(() => null);
    if(!response.ok || !payload){
      throw new Error(payload?.error?.message || `anthropic-direct-${response.status}`);
    }
    const text = Array.isArray(payload.content)
      ? payload.content.filter(item => item?.type === "text").map(item => item.text || "").join("\n")
      : "";
    const parsed = safeJsonParse(text);
    if(!parsed) throw new Error("anthropic-invalid-json");
    return normalizeExtractedResult(parsed);
  }

  async function extractInvoiceData(processedDataUrl, options){
    try{
      return await callScannerApiRoute(processedDataUrl, options);
    }catch(error){
      console.warn("scanner-ocr-api-fallback", error);
      return callAnthropicDirect(processedDataUrl, options);
    }
  }

  function inferUnit(line){
    const description = normalizeText(line.descripcion);
    if(description.includes("kg")) return "kg";
    if(description.includes("l ")) return "l";
    return "";
  }

  function matchByName(name, list, field = "name"){
    const target = normalizeText(name);
    if(!target) return null;
    return list.find(item => {
      const value = normalizeText(item?.[field]);
      return value && (value.includes(target) || target.includes(value));
    }) || null;
  }

  function buildPurchaseFromResult(result, processedDataUrl, options){
    const suppliers = Array.isArray(options.suppliers) ? options.suppliers : [];
    const products = Array.isArray(options.products) ? options.products : [];
    const supplier = matchByName(result.proveedor_nombre, suppliers, "name");
    const lines = (Array.isArray(result.lineas) ? result.lineas : []).map(line => {
      const product = matchByName(line.descripcion, products, "name");
      const base = Number(line.base || 0);
      const total = Number(line.total || 0);
      return {
        productId: product?.id || "",
        description: line.descripcion || "",
        quantity: Number(line.cantidad || 0),
        unit: inferUnit(line),
        price: Number(line.precio_unitario || 0),
        unitCost: Number(line.precio_unitario || 0),
        base,
        iva: Number(line.iva_pct || 0),
        ivaPct: Number(line.iva_pct || 0),
        ivaAmount: Math.max(0, total - base),
        total
      };
    });
    const firstLine = lines[0] || {};
    const id = options.createPurchaseId ? options.createPurchaseId() : (global.crypto?.randomUUID ? global.crypto.randomUUID() : `buy-${Date.now()}`);
    const base = Number(result.base_total || 0);
    const ivaAmount = Number(result.iva_total || 0);
    const total = Number(result.total_factura || 0);
    return {
      id,
      number: result.numero_factura || "",
      invoiceNumber: result.numero_factura || "",
      date: result.fecha || today(),
      issueDate: result.fecha || today(),
      supplierId: supplier?.id || "",
      supplierName: result.proveedor_nombre || supplier?.name || "",
      supplier: result.proveedor_nombre || supplier?.name || "",
      status:"pending",
      paidDate:"",
      paymentDate:"",
      amountPaid:0,
      base,
      iva: ivaAmount,
      total,
      amount: total,
      baseAmount: base,
      ivaAmount,
      totalAmount: total,
      productId:firstLine.productId || "",
      description:firstLine.description || "",
      concept:firstLine.description || "",
      quantity:firstLine.quantity || 1,
      unitCost:firstLine.price || 0,
      ivaPct:firstLine.ivaPct || 0,
      type:"invoice",
      internalNote:"",
      lines,
      attachment:{
        name:`${result.numero_factura || "factura-compra"}.jpg`,
        dataUrl:processedDataUrl,
        mimeType:"image/jpeg"
      },
      notes:""
    };
  }

  function buildPurchaseFromRawImage(imageDataUrl, options){
    return buildPurchaseFromResult({
      numero_factura:"",
      fecha:today(),
      proveedor_nombre:"",
      proveedor_nif:"",
      cliente_nombre:"",
      cliente_nif:"",
      lineas:[],
      base_total:0,
      iva_total:0,
      total_factura:0
    }, imageDataUrl, options);
  }

  function sessionSnapshot(state){
    return {
      id:state.id,
      createdAt:state.createdAt,
      pages:state.pages.map(page => ({
        id:page.id,
        createdAt:page.createdAt,
        source:page.source,
        corners:page.corners,
        variants:page.variants,
        selectedFilter:page.selectedFilter,
        ocr:page.ocr,
        meta:page.meta
      }))
    };
  }

  function openScannerFlow(options = {}){
    if(scannerController) scannerController.close();

    const store = global.AppScannerStore.createScannerStore({
      createSession: global.AppDomainScannerSession.createScanSession,
      createPage: global.AppDomainScannerPage.createScanPage
    });
    store.update(current => {
      current.options.mode = options.mode || "document";
    });

    const deps = {
      camera:global.AppCameraService,
      detector:global.AppVisionDocumentDetector,
      processing:global.AppVisionScanProcessing,
      store,
      options
    };

    const root = ensureRoot();
    root.className = "scanner-shell show";

    let mounted = null;

    function close(){
      mounted?.teardown?.();
      mounted = null;
      root.className = "scanner-shell";
      root.innerHTML = "";
      scannerController = null;
      options.onCancel?.();
    }

    function requestClose(){
      const state = store.getState();
      if((state.capture || state.result || state.pages.length) && !window.confirm("Se perderá el escaneo actual si sales ahora. ¿Quieres cerrar el escáner?")){
        return;
      }
      close();
    }

    async function processCapture(capture, corners, useFullImage = false){
      console.log("[SCANNER] step antes:", store.getState().step);
      store.update(current => {
        current.processing = true;
        current.error = "";
      });
      try{
        const pageData = useFullImage
          ? await deps.processing.createPageFromFullImage(capture, { selectedFilter:"document" })
          : await deps.processing.createPageFromCapture(capture, { corners, selectedFilter:"document" });
        const processedDataUrl = pageData.variants?.document || pageData.variants?.grayscale || pageData.source;
        const extracted = await extractInvoiceData(processedDataUrl, options);
        store.update(current => {
          current.pages = [pageData];
          current.activePageId = pageData.id;
          current.capture = null;
          current.result = {
            processedDataUrl,
            extracted,
            page:pageData
          };
          current.processing = false;
          current.step = "result";
        });
        console.log("[SCANNER] step después:", store.getState().step);
        console.log("[SCANNER] result:", store.getState().result);
      }catch(error){
        store.update(current => {
          current.processing = false;
          current.error = error?.message || "No se pudo procesar la factura con IA.";
        });
        console.log("[SCANNER] step después:", store.getState().step);
        console.log("[SCANNER] result:", store.getState().result);
      }
    }

    async function saveCaptureWithoutProcessing(capture){
      if(options.mode === "purchase" && typeof options.onSavePurchase === "function"){
        const purchase = buildPurchaseFromRawImage(capture.sourceDataUrl, options);
        await options.onSavePurchase(purchase);
        options.onToast?.("Imagen guardada sin procesar");
        close();
        return;
      }
      store.update(current => {
        current.result = {
          processedDataUrl:capture.sourceDataUrl,
          extracted:normalizeExtractedResult({ fecha:today(), lineas:[] }),
          page:null
        };
        current.error = "";
        current.processing = false;
        current.step = "result";
      });
    }

    function render(state){
      mounted?.teardown?.();
      mounted = null;

      if(state.step === "camera"){
        root.innerHTML = global.AppUIScannerCamera.renderScannerCamera(state);
        mounted = global.AppUIScannerCamera.mountScannerCamera(root, {
          camera:deps.camera,
          detector:deps.detector,
          onClose:requestClose,
          onError:error => {
            store.update(current => {
              current.error = error?.message || "No se pudo abrir la cámara.";
            });
          },
          onCapture:capture => {
            store.update(current => {
              current.capture = {
                sourceDataUrl:capture.sourceCanvas.toDataURL("image/jpeg", 0.95),
                corners:capture.corners,
                detected:capture.detected,
                confidence:capture.confidence
              };
              current.step = "crop";
              current.error = "";
            });
          }
        });
        return;
      }

      if(state.step === "crop" && state.capture){
        root.innerHTML = global.AppUIScannerCropEditor.renderScannerCropEditor(state.capture, state);
        mounted = global.AppUIScannerCropEditor.mountScannerCropEditor(root, {
          capture:state.capture,
          onRetake:() => {
            store.update(current => {
              current.capture = null;
              current.error = "";
              current.step = "camera";
            });
          },
          onClose:requestClose,
          onProcess:async corners => {
            await processCapture(state.capture, corners, false);
          },
          onSaveRaw:async () => {
            await saveCaptureWithoutProcessing(state.capture);
          }
        });
        return;
      }

      root.innerHTML = global.AppUIScannerPreview.renderScannerPreview(state, options);
      mounted = global.AppUIScannerPreview.mountScannerPreview(root, {
        onDiscard:requestClose,
        onRetake:() => {
          store.update(current => {
            current.result = null;
            current.error = "";
            current.step = "camera";
          });
        },
        onSave:async extracted => {
          if(options.mode === "purchase" && typeof options.onSavePurchase === "function"){
            const purchase = buildPurchaseFromResult(extracted, state.result?.processedDataUrl || "", options);
            await options.onSavePurchase(purchase);
            options.onToast?.("Compra guardada desde el escáner");
            close();
            return;
          }
          if(typeof options.onComplete === "function"){
            options.onComplete(sessionSnapshot(store.getState()));
          }
          close();
        }
      });
    }

    store.subscribe(render);
    scannerController = { close };
    return scannerController;
  }

  global.AppUIScannerView = {
    openScannerFlow,
    closeScannerFlow(){
      scannerController?.close();
    }
  };
})(window);
