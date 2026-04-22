(function(global){
  async function getGoogleToken(){
    const token = global.localStorage?.getItem("google-drive-token")
      || global.__googleAccessToken;
    if(!token) throw new Error("No hay sesión de Google Drive activa. Conecta Google Drive primero en Configuración.");
    return token;
  }

  async function listDrivePdfs(token){
    const params = new URLSearchParams({
      q: "mimeType='application/pdf' and trashed=false",
      fields: "files(id,name,createdTime,size,mimeType)",
      orderBy: "createdTime desc",
      pageSize: "30"
    });
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?" + params,
      { headers: { Authorization: "Bearer " + token } }
    );
    if(!res.ok) throw new Error("No se pudo acceder a Google Drive");
    const data = await res.json();
    return data.files || [];
  }

  async function downloadDriveFile(token, fileId){
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media",
      { headers: { Authorization: "Bearer " + token } }
    );
    if(!res.ok) throw new Error("No se pudo descargar el archivo");
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  function formatSize(bytes){
    if(!bytes) return "";
    if(bytes < 1024) return bytes + " B";
    if(bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function formatDate(dateStr){
    if(!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES");
  }

  async function openDrivePicker(onSelect, onError){
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.7);z-index:99999;
      display:flex;align-items:flex-end;justify-content:center;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background:#fff;border-radius:20px 20px 0 0;
      width:100%;max-width:600px;max-height:80vh;
      display:flex;flex-direction:column;overflow:hidden;
    `;

    modal.innerHTML = `
      <div style="padding:20px;border-bottom:1px solid #DCE8DC;
        display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;color:#1A2E1F;font-size:18px;">
          Facturas en Google Drive
        </h3>
        <button id="drivePickerClose" style="background:none;border:none;
          font-size:24px;cursor:pointer;color:#6B7C6E;">×</button>
      </div>
      <div id="drivePickerList" style="flex:1;overflow-y:auto;padding:12px;">
        <p style="text-align:center;color:#6B7C6E;padding:20px;">
          Cargando archivos...
        </p>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      if(overlay.parentNode) document.body.removeChild(overlay);
    };

    modal.querySelector("#drivePickerClose").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if(e.target === overlay) close();
    });

    const listEl = modal.querySelector("#drivePickerList");

    try {
      const token = await getGoogleToken();
      const files = await listDrivePdfs(token);

      if(files.length === 0){
        listEl.innerHTML = `<p style="text-align:center;color:#6B7C6E;padding:20px;">
          No hay PDFs en Google Drive.</p>`;
        return;
      }

      listEl.innerHTML = files.map(f => `
        <div class="drive-file-item" data-id="${f.id}" data-name="${String(f.name || "").replace(/"/g, "&quot;")}"
          style="padding:14px;border-radius:12px;margin-bottom:8px;
          border:1px solid #DCE8DC;cursor:pointer;display:flex;
          align-items:center;gap:12px;transition:background 0.2s;">
          <span style="font-size:28px;">📄</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:#1A2E1F;font-size:14px;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${String(f.name || "")}
            </div>
            <div style="font-size:12px;color:#6B7C6E;margin-top:2px;">
              ${formatDate(f.createdTime)} · ${formatSize(Number(f.size || 0))}
            </div>
          </div>
          <span style="color:#3D7A5A;font-size:20px;">→</span>
        </div>
      `).join("");

      listEl.querySelectorAll(".drive-file-item").forEach(item => {
        item.addEventListener("mouseenter", () => {
          item.style.background = "rgba(61,122,90,0.07)";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "";
        });
        item.addEventListener("click", async () => {
          const fileId = item.dataset.id;
          const fileName = item.dataset.name;
          item.style.background = "rgba(61,122,90,0.15)";
          item.innerHTML = `<span style="font-size:28px;">⏳</span>
            <div style="flex:1;color:#3D7A5A;font-weight:600;">
              Descargando ${fileName}...
            </div>`;
          try {
            const dataUrl = await downloadDriveFile(token, fileId);
            close();
            onSelect({ pdfDataUrl: dataUrl, fileName });
          } catch(err) {
            close();
            onError?.(err);
          }
        });
      });

    } catch(err) {
      listEl.innerHTML = `
        <div style="padding:20px;text-align:center;">
          <p style="color:#C0392B;margin-bottom:12px;">${err.message}</p>
          <p style="color:#6B7C6E;font-size:13px;">
            Conecta Google Drive en la pestaña "Otros" → Configuración
          </p>
        </div>`;
      onError?.(err);
    }
  }

  global.AppScannerDrivePicker = { openDrivePicker };
})(window);
