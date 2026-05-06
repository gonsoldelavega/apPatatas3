(function(global){
  const DEFAULT_SPREADSHEET_ID = "1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU";
  const DEFAULT_SHEET_NAME = "REGISTRO";
  const LAST_RUN_KEY = "factupapa-purchase-registry-last-run";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const COLUMNS = {
    documentDate:0,
    type:2,
    subtype:3,
    number:4,
    supplier:5,
    nif:6,
    concept:7,
    category:8,
    base:9,
    ivaPct:10,
    ivaAmount:11,
    total:12,
    status:13,
    paymentMethod:14,
    driveLink:18,
    fileName:19,
    reviewed:20,
    observations:21
  };

  function normalizeText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function parseEuro(value){
    if(typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value || "").trim();
    if(!raw) return 0;
    const normalized = raw
      .replace(/\s/g, "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseDate(value){
    const raw = String(value || "").trim();
    if(!raw) return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if(match){
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    }
    const date = new Date(raw);
    if(Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
    return "";
  }

  function extractDriveFileId(value){
    const raw = String(value || "");
    return raw.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
      || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]
      || "";
  }

  function stableHash(value){
    let hash = 0;
    const text = String(value || "");
    for(let i = 0; i < text.length; i += 1){
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function buildPurchaseId(row){
    const driveFileId = extractDriveFileId(row[COLUMNS.driveLink]);
    if(driveFileId) return `buy-registry-${driveFileId}`;
    return `buy-registry-${stableHash([
      row[COLUMNS.documentDate],
      row[COLUMNS.number],
      row[COLUMNS.supplier],
      row[COLUMNS.total],
      row[COLUMNS.fileName]
    ].join("|"))}`;
  }

  function isPurchaseInvoice(row){
    const type = normalizeText(row[COLUMNS.type]);
    const subtype = normalizeText(row[COLUMNS.subtype]);
    const reviewed = normalizeText(row[COLUMNS.reviewed]);
    return type === "compra"
      && (!subtype || subtype === "factura")
      && (!reviewed || reviewed === "si" || reviewed === "sí" || reviewed === "ok");
  }

  function findSupplierId(suppliers, supplierName, nif){
    const nameKey = normalizeText(supplierName);
    const nifKey = normalizeText(nif);
    if(!nameKey && !nifKey) return "";
    const match = (suppliers || []).find(supplier => {
      const supplierNameKey = normalizeText(supplier.name);
      const supplierNifKey = normalizeText(supplier.nif);
      return (nifKey && supplierNifKey && supplierNifKey === nifKey)
        || (nameKey && supplierNameKey && (supplierNameKey.includes(nameKey) || nameKey.includes(supplierNameKey)));
    });
    return match?.id || "";
  }

  function rowToPurchase(row, state){
    const base = parseEuro(row[COLUMNS.base]);
    const ivaAmount = parseEuro(row[COLUMNS.ivaAmount]);
    const total = parseEuro(row[COLUMNS.total]);
    const ivaPct = parseEuro(row[COLUMNS.ivaPct]);
    const supplierName = String(row[COLUMNS.supplier] || "").trim();
    const concept = String(row[COLUMNS.concept] || row[COLUMNS.category] || "Factura de compra").trim();
    const number = String(row[COLUMNS.number] || "").trim();
    const date = parseDate(row[COLUMNS.documentDate]) || new Date().toISOString().slice(0, 10);
    const supplierId = findSupplierId(state.suppliers, supplierName, row[COLUMNS.nif]);
    const id = buildPurchaseId(row);
    const line = {
      productId:"",
      description:concept,
      quantity:1,
      price:base || Math.max(total - ivaAmount, 0),
      iva:ivaPct,
      ivaPct
    };

    return {
      id,
      number,
      invoiceNumber:number,
      date,
      issueDate:date,
      supplierId,
      supplierName,
      supplier:supplierName,
      productId:"",
      description:concept,
      concept,
      quantity:1,
      unitCost:line.price,
      iva:ivaAmount,
      ivaPct,
      base,
      total,
      amount:total,
      baseAmount:base,
      ivaAmount,
      totalAmount:total,
      status:"paid",
      paidDate:date,
      paymentDate:date,
      amountPaid:total,
      paymentMethod:String(row[COLUMNS.paymentMethod] || "").trim(),
      type:"invoice",
      source:"google-registro-compras",
      sourceRegistryFileId:extractDriveFileId(row[COLUMNS.driveLink]),
      sourceRegistryFileName:String(row[COLUMNS.fileName] || "").trim(),
      driveLink:String(row[COLUMNS.driveLink] || "").trim(),
      lines:[line],
      items:[line],
      notes:["Importada del registro maestro", row[COLUMNS.observations]].filter(Boolean).join(" · "),
      internalNote:["Importada del registro maestro", row[COLUMNS.driveLink], row[COLUMNS.fileName]].filter(Boolean).join(" · "),
      attachment:null,
      stockLines:[]
    };
  }

  function hasPurchase(state, purchase){
    return (state.purchases || []).some(item => {
      if(item.id && item.id === purchase.id) return true;
      if(item.sourceRegistryFileId && purchase.sourceRegistryFileId && item.sourceRegistryFileId === purchase.sourceRegistryFileId) return true;
      return false;
    });
  }

  function createPurchaseRegistrySync(options){
    const settings = () => options.getState().settings || {};

    async function fetchRows(interactive){
      const spreadsheetId = settings().purchaseRegistrySpreadsheetId || DEFAULT_SPREADSHEET_ID;
      const sheetName = settings().purchaseRegistrySheetName || DEFAULT_SHEET_NAME;
      const token = await options.getAccessToken(interactive, "purchase-registry-sync");
      const range = encodeURIComponent(`${sheetName}!A2:V`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
        headers:{ Authorization:`Bearer ${token}` }
      });
      if(!response.ok){
        const detail = await response.text().catch(() => "");
        throw new Error(`sheets-api-${response.status}: ${detail.slice(0, 160)}`);
      }
      const payload = await response.json();
      return payload.values || [];
    }

    async function importNow({ interactive = true, silent = false } = {}){
      if(settings().purchaseRegistryAutoSync === false || settings().purchaseRegistryAutoSync === "false"){
        return { imported:0, skipped:0, disabled:true };
      }
      const rows = await fetchRows(interactive);
      let imported = 0;
      let skipped = 0;
      for(const row of rows){
        if(!isPurchaseInvoice(row)){
          skipped += 1;
          continue;
        }
        const current = options.getState();
        const purchase = rowToPurchase(row, current);
        if(!purchase.totalAmount || hasPurchase(current, purchase)){
          skipped += 1;
          continue;
        }
        await options.savePurchase(purchase);
        imported += 1;
      }
      global.localStorage.setItem(LAST_RUN_KEY, new Date().toISOString());
      if(!silent && imported) options.toast(`${imported} compras importadas del registro`);
      if(!silent && !imported) options.toast("Registro revisado: no hay compras nuevas");
      return { imported, skipped, disabled:false };
    }

    async function runDaily(){
      const lastRun = Date.parse(global.localStorage.getItem(LAST_RUN_KEY) || "");
      if(Number.isFinite(lastRun) && Date.now() - lastRun < DAY_MS) return { skippedDaily:true };
      if(typeof options.hasAccessToken === "function" && !options.hasAccessToken()){
        return { skippedAuth:true };
      }
      try{
        return await importNow({ interactive:false, silent:true });
      }catch(error){
        console.warn("[purchase-registry-sync] No se pudo sincronizar en segundo plano", error);
        return { error };
      }
    }

    return {
      importNow,
      runDaily
    };
  }

  global.AppPurchaseRegistrySync = {
    createPurchaseRegistrySync,
    DEFAULT_SPREADSHEET_ID,
    DEFAULT_SHEET_NAME
  };
})(window);
