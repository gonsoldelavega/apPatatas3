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

  function round2(value){
    const number = Number(value);
    return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
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
    if(typeof value === "number" && Number.isFinite(value)){
      const epoch = Date.UTC(1899, 11, 30);
      const date = new Date(epoch + value * DAY_MS);
      return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
    }
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

  function normalizeRegistryStatus(value){
    const status = normalizeText(value);
    if(["pagado", "pagada", "paid", "cobrado", "abonado", "ok"].includes(status)) return "paid";
    if(["parcial", "pago parcial", "partial"].includes(status)) return "partial";
    return "pending";
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

  function fileName(row){
    return String(row[COLUMNS.fileName] || "").trim();
  }

  function inferDefaultVat(row){
    const haystack = normalizeText([
      row[COLUMNS.supplier], row[COLUMNS.concept], row[COLUMNS.category], fileName(row)
    ].join(" "));
    if(haystack.includes("higienlab") || haystack.includes("envase") || haystack.includes("bolsa")) return 21;
    if(haystack.includes("gayca") || haystack.includes("patata") || haystack.includes("agria") || haystack.includes("materia prima")) return 4;
    return 21;
  }

  function normalizeSupplierName(row){
    const raw = String(row[COLUMNS.supplier] || "").trim();
    const file = normalizeText(fileName(row));
    const supplier = normalizeText(raw);
    if(file.includes("higienlab") || supplier.includes("higienlab")) return "HIGIENLAB";
    if(file.includes("gayca") || supplier.includes("gayca") || supplier.includes("frutas y patatas")) return "FRUTAS Y PATATAS GAYCA, S.A.";
    return raw;
  }

  function normalizeConcept(row){
    const raw = String(row[COLUMNS.concept] || "").trim();
    const haystack = normalizeText([raw, row[COLUMNS.category], row[COLUMNS.supplier], fileName(row)].join(" "));
    if(!raw || normalizeText(raw) === "compra"){
      if(haystack.includes("gayca") || haystack.includes("materia prima")) return "PATATAS AGRIA";
      if(haystack.includes("higienlab") || haystack.includes("envase")) return "ENVASES";
      return "Factura de compra";
    }
    return raw;
  }

  function normalizeInvoiceNumber(row){
    const raw = row[COLUMNS.number];
    const text = String(raw || "").trim();
    if(text && !/^\d+(?:\.0+)?$/.test(text)) return text;
    const file = fileName(row);
    const match = file.match(/_(FV[^_]+|\d{1,2}-\d{1,2}-\d{2,4}|GONZALEZ|HIGIENLAB)_/i);
    if(match) return match[1];
    const date = parseDate(row[COLUMNS.documentDate]);
    if(date){
      const [year, month, day] = date.split("-");
      return `${day}-${month}-${year.slice(2)}`;
    }
    return text;
  }

  function normalizeAmounts(row){
    let base = parseEuro(row[COLUMNS.base]);
    let ivaPct = parseEuro(row[COLUMNS.ivaPct]);
    let ivaAmount = parseEuro(row[COLUMNS.ivaAmount]);
    let total = parseEuro(row[COLUMNS.total]);
    const defaultVat = inferDefaultVat(row);
    const invalidVat = !Number.isFinite(ivaPct) || ivaPct <= 0 || ivaPct > 30;
    const shiftedBase = total > 0 && base <= 0 && ivaAmount > 0 && ivaAmount < total;
    const incoherent = total > 0 && Math.abs(round2(base + ivaAmount) - round2(total)) > 0.03;

    if(total > 0 && (invalidVat || shiftedBase || incoherent)){
      ivaPct = defaultVat;
      base = round2(total / (1 + ivaPct / 100));
      ivaAmount = round2(total - base);
    }else{
      base = round2(base);
      ivaPct = round2(ivaPct || defaultVat);
      if(total > 0 && ivaAmount <= 0) ivaAmount = round2(total - base);
      ivaAmount = round2(ivaAmount);
      total = round2(total || base + ivaAmount);
    }

    return { base, ivaPct, ivaAmount, total };
  }

  function findSupplierId(suppliers, supplierName, nif){
    const nameKey = normalizeText(supplierName);
    const nifKey = normalizeText(nif);
    if(!nameKey && !nifKey) return "";
    const match = (suppliers || []).find(supplier => {
      const supplierNameKey = normalizeText(supplier.name);
      const supplierNifKey = normalizeText(supplier.taxId || supplier.nif || supplier.nifCif);
      return (nifKey && supplierNifKey && supplierNifKey === nifKey)
        || (nameKey && supplierNameKey && (supplierNameKey.includes(nameKey) || nameKey.includes(supplierNameKey)));
    });
    return match?.id || "";
  }

  function rowToPurchase(row, state){
    const amounts = normalizeAmounts(row);
    const supplierName = normalizeSupplierName(row);
    const supplierNif = String(row[COLUMNS.nif] || "").trim();
    const concept = normalizeConcept(row);
    const number = normalizeInvoiceNumber(row);
    const date = parseDate(row[COLUMNS.documentDate]) || new Date().toISOString().slice(0, 10);
    const supplierId = findSupplierId(state.suppliers, supplierName, supplierNif);
    const id = buildPurchaseId(row);
    const status = normalizeRegistryStatus(row[COLUMNS.status]);
    const amountPaid = status === "paid" ? amounts.total : 0;
    const line = {
      productId:"",
      description:concept,
      quantity:1,
      price:amounts.base,
      iva:amounts.ivaPct,
      ivaPct:amounts.ivaPct,
      ivaAmount:amounts.ivaAmount,
      base:amounts.base,
      total:amounts.total
    };

    return {
      id,
      number,
      invoiceNumber:number,
      date,
      issueDate:date,
      supplierId,
      supplierName,
      supplierNif,
      supplier:supplierName,
      productId:"",
      description:concept,
      concept,
      quantity:1,
      unitCost:line.price,
      iva:amounts.ivaAmount,
      ivaPct:amounts.ivaPct,
      base:amounts.base,
      total:amounts.total,
      amount:amounts.total,
      baseAmount:amounts.base,
      ivaAmount:amounts.ivaAmount,
      totalAmount:amounts.total,
      status,
      paidDate:status === "paid" ? date : "",
      paymentDate:status === "paid" ? date : "",
      amountPaid,
      paymentMethod:String(row[COLUMNS.paymentMethod] || "").trim(),
      type:"invoice",
      source:"google-registro-compras",
      sourceRegistryFileId:extractDriveFileId(row[COLUMNS.driveLink]),
      sourceRegistryFileName:fileName(row),
      driveLink:String(row[COLUMNS.driveLink] || "").trim(),
      lines:[line],
      items:[line],
      notes:["Importada del registro maestro", row[COLUMNS.observations]].filter(Boolean).join(" · "),
      internalNote:["Importada del registro maestro", row[COLUMNS.driveLink], fileName(row)].filter(Boolean).join(" · "),
      attachment:null,
      stockLines:[]
    };
  }

  function findMatchingPurchase(state, purchase){
    const purchaseNumber = normalizeText(purchase.number || purchase.invoiceNumber);
    const purchaseSupplier = normalizeText(purchase.supplierNif || purchase.supplierName || purchase.supplier);
    const purchaseDate = parseDate(purchase.date || purchase.issueDate);
    const purchaseTotal = parseEuro(purchase.totalAmount || purchase.total || purchase.amount);
    return (state.purchases || []).find(item => {
      if(item.id && item.id === purchase.id) return true;
      if(item.sourceRegistryFileId && purchase.sourceRegistryFileId && item.sourceRegistryFileId === purchase.sourceRegistryFileId) return true;
      const itemNumber = normalizeText(item.number || item.invoiceNumber);
      const itemSupplier = normalizeText(item.supplierNif || item.supplierName || item.supplier);
      const itemDate = parseDate(item.date || item.issueDate);
      const itemTotal = parseEuro(item.totalAmount || item.total || item.amount);
      if(purchaseNumber && itemNumber && purchaseNumber === itemNumber && purchaseSupplier && itemSupplier && purchaseSupplier === itemSupplier){
        return true;
      }
      if(purchaseDate && itemDate && purchaseDate === itemDate && purchaseSupplier && itemSupplier && purchaseSupplier === itemSupplier && Math.abs(purchaseTotal - itemTotal) < 0.01){
        return true;
      }
      return false;
    }) || null;
  }

  function shouldRepairImportedPurchase(existing, purchase){
    if(!existing) return true;
    const isRegistryPurchase = existing.source === "google-registro-compras" || existing.sourceRegistryFileId || existing.id === purchase.id;
    if(!isRegistryPurchase) return false;
    const fields = [
      [existing.totalAmount || existing.total || existing.amount, purchase.totalAmount],
      [existing.baseAmount || existing.base, purchase.baseAmount],
      [existing.ivaAmount || existing.iva, purchase.ivaAmount],
      [existing.ivaPct, purchase.ivaPct]
    ];
    if(fields.some(([a, b]) => Math.abs(parseEuro(a) - parseEuro(b)) > 0.01)) return true;
    if(normalizeText(existing.supplierName || existing.supplier) !== normalizeText(purchase.supplierName)) return true;
    if(normalizeText(existing.description || existing.concept) !== normalizeText(purchase.description)) return true;
    return false;
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
        return { imported:0, repaired:0, skipped:0, disabled:true };
      }
      const rows = await fetchRows(interactive);
      let imported = 0;
      let repaired = 0;
      let skipped = 0;
      for(const row of rows){
        if(!isPurchaseInvoice(row)){
          skipped += 1;
          continue;
        }
        const current = options.getState();
        const purchase = rowToPurchase(row, current);
        if(!purchase.totalAmount){
          skipped += 1;
          continue;
        }
        const existing = findMatchingPurchase(current, purchase);
        if(existing){
          if(shouldRepairImportedPurchase(existing, purchase)){
            await options.savePurchase({ ...purchase, id:existing.id || purchase.id });
            repaired += 1;
          }else{
            skipped += 1;
          }
          continue;
        }
        await options.savePurchase(purchase);
        imported += 1;
      }
      global.localStorage.setItem(LAST_RUN_KEY, new Date().toISOString());
      if(!silent && (imported || repaired)) options.toast(`${imported} compras nuevas · ${repaired} reparadas`);
      if(!silent && !imported && !repaired) options.toast("Registro revisado: no hay compras nuevas ni reparaciones");
      return { imported, repaired, skipped, disabled:false };
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
