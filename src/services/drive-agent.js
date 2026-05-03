/* ============================================================
   FACTUPAPA — Agente Drive Bidireccional
   
   Corre una vez al día a las 00:00 (y al arrancar si no se
   ejecutó hoy). Hace dos cosas:
   
   1. SUBIDA: Lee documentos_pdf con drive_subido=false
              y los sube a Drive en la carpeta correcta.
   
   2. BAJADA: Lee la carpeta "Bandeja de entrada" de Drive,
              procesa PDFs nuevos con IA y los registra
              como compras en la app.
   ============================================================ */

(function(global){

  const AGENT_KEY      = "factupapa-drive-agent-last-run";
  const INBOX_FOLDER   = "Bandeja de entrada";
  const PROCESSED_KEY  = "factupapa-drive-processed-ids";

  /* ── Utilidades ── */
  function getTodayKey(){
    return new Date().toISOString().slice(0, 10);
  }

  function getProcessedIds(){
    try{
      return JSON.parse(localStorage.getItem(PROCESSED_KEY) || "[]");
    }catch{ return []; }
  }

  function markProcessed(id){
    const ids = getProcessedIds();
    if(!ids.includes(id)){
      ids.push(id);
      localStorage.setItem(PROCESSED_KEY, JSON.stringify(ids.slice(-200)));
    }
  }

  function getDriveToken(){
    return (localStorage.getItem("google-drive-token") || "").trim();
  }

  function log(msg, data){
    console.log("[drive-agent]", msg, data || "");
  }

  /* ── Petición autenticada a Drive ── */
  async function driveFetch(url, options = {}){
    const token = getDriveToken();
    if(!token) throw new Error("Sin token de Drive");
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers||{}), Authorization: `Bearer ${token}` }
    });
    if(!res.ok) throw new Error(`Drive API ${res.status}`);
    return res;
  }

  /* ── Encontrar o crear carpeta ── */
  async function findOrCreateFolder(name, parentId = "root"){
    const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and trashed=false and name='${name}' and '${parentId}' in parents`);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
    const data = await res.json();
    if(data.files?.length) return data.files[0].id;
    const create = await driveFetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
    });
    const created = await create.json();
    return created.id;
  }

  /* ── Subir un PDF a Drive ── */
  async function uploadPdfToDrive(parentId, fileName, base64Data){
    const binary = atob(base64Data.replace(/^data:application\/pdf;base64,/, ""));
    const bytes  = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: fileName, parents: [parentId] })], { type: "application/json" }));
    form.append("file", blob);

    const res = await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      { method: "POST", body: form }
    );
    return res.json();
  }

  /* ── Obtener cliente Supabase ── */
  async function getSupabase(){
    const { getSupabaseClient } = await import("./supabase-client.js");
    return getSupabaseClient();
  }

  /* ════════════════════════════════════════════════════════
     SUBIDA: documentos_pdf con drive_subido=false → Drive
  ════════════════════════════════════════════════════════ */
  async function runUpload(rootFolderName){
    log("upload:start");
    const supabase = await getSupabase();
    const { data: docs, error } = await supabase
      .from("documentos_pdf")
      .select("*")
      .eq("drive_subido", false)
      .limit(50);

    if(error) throw error;
    if(!docs?.length){ log("upload:nada que subir"); return; }

    const rootId      = await findOrCreateFolder(rootFolderName);
    const facturasFId = await findOrCreateFolder("Facturas venta", rootId);
    const comprasFId  = await findOrCreateFolder("Facturas compra", rootId);

    for(const doc of docs){
      try{
        if(!doc.pdf_base64){ continue; }

        const fecha    = doc.fecha || new Date().toISOString().slice(0,10);
        const year     = fecha.slice(0,4);
        const month    = fecha.slice(0,7);

        let parentId;
        if(doc.tipo === "venta"){
          const yearId  = await findOrCreateFolder(year,  facturasFId);
          const monthId = await findOrCreateFolder(month, yearId);
          const cliente = (doc.cliente_nombre || "Sin cliente").replace(/[\/\\:*?"<>|]/g,"-").slice(0,60);
          parentId = await findOrCreateFolder(cliente, monthId);
        } else {
          const yearId  = await findOrCreateFolder(year,  comprasFId);
          parentId = await findOrCreateFolder(month, yearId);
        }

        const result = await uploadPdfToDrive(parentId, doc.nombre_archivo, doc.pdf_base64);

        await supabase
          .from("documentos_pdf")
          .update({ drive_subido: true, drive_path: result.webViewLink || "", updated_at: new Date().toISOString() })
          .eq("id", doc.id);

        log("upload:ok", doc.nombre_archivo);
      }catch(err){
        log("upload:error", { nombre: doc.nombre_archivo, err: err.message });
      }
    }
    log("upload:done", `${docs.length} documento(s) procesados`);
  }

  /* ════════════════════════════════════════════════════════
     BAJADA: Bandeja de entrada Drive → Compras en la app
  ════════════════════════════════════════════════════════ */
  async function runDownload(rootFolderName, onNewPurchase){
    log("download:start");
    const token = getDriveToken();
    if(!token){ log("download:sin token"); return; }

    let inboxId;
    try{
      const rootId = await findOrCreateFolder(rootFolderName);
      inboxId = await findOrCreateFolder(INBOX_FOLDER, rootId);
    }catch(err){
      log("download:error creando carpeta", err.message);
      return;
    }

    /* Listar archivos PDF en la bandeja */
    const q   = encodeURIComponent(`'${inboxId}' in parents and trashed=false and mimeType='application/pdf'`);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=20`);
    const data = await res.json();
    const files = data.files || [];

    if(!files.length){ log("download:bandeja vacía"); return; }

    const processed = getProcessedIds();

    for(const file of files){
      if(processed.includes(file.id)){ continue; }

      try{
        log("download:procesando", file.name);

        /* Descargar el PDF como base64 */
        const dlRes  = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        const buffer = await dlRes.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const dataUrl = `data:application/pdf;base64,${base64}`;

        /* Llamar a la IA para extraer datos */
        let aiResult = null;
        try{
          const aiRes = await fetch("/api/anthropic-ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl: dataUrl,
              ocrText: "",
              suppliers: (global.__factupapa_state?.suppliers || []).map(s => ({ id:s.id, name:s.name, nif:s.nif }))
            })
          });
          if(aiRes.ok) aiResult = await aiRes.json();
        }catch(aiErr){
          log("download:ai-error", aiErr.message);
        }

        /* Construir la compra */
        const today = new Date().toISOString().slice(0,10);
        const total = aiResult?.summary?.total || 0;
        const fecha = aiResult?.summary?.date || today;
        const supplierId = aiResult?.summary?.supplierId || "";

        if(typeof onNewPurchase === "function"){
          await onNewPurchase({
            id:           `buy-drive-${file.id}`,
            date:         fecha,
            supplierId,
            supplierName: aiResult?.summary?.supplierName || file.name.replace(".pdf",""),
            number:       file.name.replace(".pdf",""),
            totalAmount:  total,
            baseAmount:   total,
            ivaAmount:    0,
            lines:        [],
            internalNote: `Importado automáticamente desde Drive: ${file.name}`,
            attachment: {
              name:     file.name,
              mimeType: "application/pdf",
              dataUrl
            }
          });
        }

        markProcessed(file.id);
        log("download:ok", file.name);
      }catch(err){
        log("download:error", { file: file.name, err: err.message });
      }
    }

    log("download:done");
  }

  /* ════════════════════════════════════════════════════════
     AGENTE PRINCIPAL
  ════════════════════════════════════════════════════════ */
  async function runAgent(rootFolderName, onNewPurchase, silent = false){
    if(!getDriveToken()){ log("agente:sin token Drive, saltando"); return; }

    log("agente:iniciando");
    try{
      await runUpload(rootFolderName);
      await runDownload(rootFolderName, onNewPurchase);
      localStorage.setItem(AGENT_KEY, getTodayKey());
      if(!silent && typeof global.AppSyncStatus !== "undefined"){
        global.AppSyncStatus.setSynced();
      }
      log("agente:completado");
    }catch(err){
      log("agente:error", err.message);
    }
  }

  /* ── Programar ejecución diaria ── */
  function scheduleDriveAgent(rootFolderName, onNewPurchase){
    function msUntilMidnight(){
      const now  = new Date();
      const next = new Date(now);
      next.setDate(now.getDate() + 1);
      next.setHours(0, 2, 0, 0);
      return next.getTime() - now.getTime();
    }

    function scheduleNext(){
      const ms = msUntilMidnight();
      log(`agente:próxima ejecución en ${Math.round(ms/3600000)}h`);
      setTimeout(() => {
        runAgent(rootFolderName, onNewPurchase, true).catch(()=>{});
        scheduleNext();
      }, ms);
    }

    /* Ejecutar al arrancar si no se hizo hoy */
    const lastRun = localStorage.getItem(AGENT_KEY) || "";
    if(lastRun !== getTodayKey()){
      setTimeout(() => runAgent(rootFolderName, onNewPurchase, true).catch(()=>{}), 10000);
    }

    scheduleNext();
  }

  global.AppDriveAgent = { scheduleDriveAgent, runAgent };

})(window);
