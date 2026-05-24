(function(global){
  const DEFAULT_SPREADSHEET_ID = "1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU";
  const DEFAULT_SHEET_NAME = "REGISTRO";
  const LAST_RUN_KEY = "factupapa-purchase-registry-last-run";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAY_2026_EXPECTED_TOTAL = 712.81;

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

  function normalizeFileKey(value){
    return normalizeText(value).replace(/[^a-z0-9]+/g, "");
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

  function monthKey(value){
    return String(parseDate(value) || "").slice(0, 7);
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
    let amounts = normalizeAmounts(row);
    const supplierName = normalizeSupplierName(row);
    const supplierNif = String(row[COLUMNS.nif] || "").trim();
    const concept = normalizeConcept(row);
    const number = normalizeInvoiceNumber(row);
    const date = parseDate(row[COLUMNS.documentDate]) || new Date().toISOString().slice(0, 10);
    const supplierId = findSupplierId(state.suppliers, supplierName, supplierNif);
    const id = buildPurchaseId(row);
    const status = normalizeRegistryStatus(row[COLUMNS.status]);
    const isGaycaMay20Fix = normalizeText(supplierName).includes("gayca")
      && date === "2026-05-20"
      && Math.abs(amounts.total - 0.56) < 0.001;
    if(isGaycaMay20Fix){
      amounts = { base:14, ivaPct:4, ivaAmount:0.56, total:14.56 };
    }
    const amountPaid = status === "paid" ? amounts.total : 0;
    const sourceRegistryFileName = fileName(row);
    const sourceRegistryFileId = extractDriveFileId(row[COLUMNS.driveLink]);
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
      sourceRegistryFileId,
      sourceRegistryFileName,
      driveLink:String(row[COLUMNS.driveLink] || "").trim(),
      lines:[line],
      items:[line],
      notes:["Importada del registro maestro", row[COLUMNS.observations]].filter(Boolean).join(" · "),
      internalNote:["Importada del registro maestro", row[COLUMNS.driveLink], sourceRegistryFileName].filter(Boolean).join(" · "),
      attachment:null,
      stockLines:[]
    };
  }

  function itemFileKey(item){
    return normalizeFileKey([
      item.sourceRegistryFileName,
      item.fileName,
      item.attachment?.name,
      item.documentName,
      item.internalNote,
      item.notes,
      item.driveLink
    ].filter(Boolean).join(" "));
  }

  function hasPurchase(state, purchase){
    return !!findMatchingPurchase(state, purchase);
  }

  function findMatchingPurchase(state, purchase){
    const purchaseNumber = normalizeText(purchase.number || purchase.invoiceNumber);
    const purchaseSupplier = normalizeText(purchase.supplierNif || purchase.supplierName || purchase.supplier);
    const purchaseDate = parseDate(purchase.date || purchase.issueDate);
    const purchaseTotal = parseEuro(purchase.totalAmount || purchase.total || purchase.amount);
    const purchaseFileId = purchase.sourceRegistryFileId || extractDriveFileId(purchase.driveLink);
    const purchaseFileKey = normalizeFileKey(purchase.sourceRegistryFileName || purchase.driveLink || "");
    const purchaseConcept = normalizeText(purchase.description || purchase.concept || "");

    return (state.purchases || []).find(item => {
      if(item.id && item.id === purchase.id) return true;

      const itemFileId = item.sourceRegistryFileId || extractDriveFileId(item.driveLink || item.internalNote || "");
      if(itemFileId && purchaseFileId && itemFileId === purchaseFileId) return true;

      const currentFileKey = itemFileKey(item);
      if(purchaseFileKey && currentFileKey && (currentFileKey.includes(purchaseFileKey) || purchaseFileKey.includes(currentFileKey))){
        return true;
      }

      const itemNumber = normalizeText(item.number || item.invoiceNumber);
      const itemSupplier = normalizeText(item.supplierNif || item.supplierName || item.supplier);
      const itemDate = parseDate(item.date || item.issueDate);
      const itemTotal = parseEuro(item.totalAmount || item.total || item.amount);
      const itemConcept = normalizeText(item.description || item.concept || "");

      if(purchaseNumber && itemNumber && purchaseNumber === itemNumber) return true;
      if(purchaseNumber && itemNumber && purchaseNumber.replace(/\.0+$/, "") === itemNumber.replace(/\.0+$/, "")) return true;

      if(purchaseDate && itemDate && purchaseDate === itemDate && purchaseSupplier && itemSupplier && purchaseSupplier === itemSupplier){
        return true;
      }

      if(purchaseDate && itemDate && purchaseDate === itemDate && purchaseConcept && itemConcept && (itemConcept.includes(purchaseConcept) || purchaseConcept.includes(itemConcept))){
        return true;
      }

      if(purchaseDate && itemDate && purchaseDate === itemDate && purchaseSupplier && itemSupplier && purchaseSupplier === itemSupplier && Math.abs(purchaseTotal - itemTotal) < 0.01){
        return true;
      }

      // Reparación específica de importes antiguos mal leídos: el total antiguo puede no coincidir.
      // Ejemplo real: GAYCA 20/05/2026 fue guardada como 0,56 € aunque el PDF suma 14,56 €.
      const bothGayca = normalizeText([purchase.supplierName, item.supplierName, item.supplier].join(" ")).includes("gayca");
      if(bothGayca && purchaseDate && itemDate && purchaseDate === itemDate){
        const oldLooksLikeVatOnly = Math.abs(itemTotal - parseEuro(purchase.ivaAmount)) < 0.02;
        const sameSmallPurchase = purchaseTotal < 30 && itemTotal < purchaseTotal;
        if(oldLooksLikeVatOnly || sameSmallPurchase) return true;
      }

      return false;
    }) || null;
  }

  function shouldRepairImportedPurchase(existing, purchase){
    if(!existing) return true;
    const isRegistryPurchase = existing.source === "google-registro-compras"
      || existing.sourceRegistryFileId
      || existing.sourceRegistryFileName
      || existing.id === purchase.id
      || itemFileKey(existing)
      || normalizeText(existing.internalNote || existing.notes).includes("registro maestro");
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

  function purchasesTotalForMonth(state, targetMonth){
    return (state.purchases || [])
      .filter(item => monthKey(item.date || item.issueDate) === targetMonth)
      .reduce((sum, item) => sum + parseEuro(item.totalAmount || item.total || item.amount), 0);
  }

  function may2026AlreadyComplete(state){
    return Math.abs(purchasesTotalForMonth(state, "2026-05") - MAY_2026_EXPECTED_TOTAL) < 0.01;
  }

  function purchasesDiffer(current, next){
    const fields = [
      "number","invoiceNumber","date","issueDate","supplierId","supplierName","supplierNif",
      "supplier","description","concept","iva","ivaPct","base","total","amount","baseAmount",
      "ivaAmount","totalAmount","status","paidDate","paymentDate","amountPaid","paymentMethod",
      "source","sourceRegistryFileId","sourceRegistryFileName","driveLink"
    ];
    return fields.some(field => String(current?.[field] ?? "") !== String(next?.[field] ?? ""))
      || JSON.stringify(current?.lines || []) !== JSON.stringify(next?.lines || []);
  }

  function createPurchaseRegistrySync(options){
    const settings = () => options.getState().settings || {};

    async function fetchServerRows(){
      const response = await fetch("/api/purchase-registry", {
        method:"GET",
        cache:"no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if(response.ok && payload?.ok === true && Array.isArray(payload.rows)){
        return { rows:payload.rows, source:payload.source || "vercel-google-sheets" };
      }
      if(payload?.error === "missing_server_google_config"){
        return { rows:null, source:"server-missing-config", missingConfig:true };
      }
      const error = new Error(payload?.error || `purchase-registry-${response.status}`);
      error.serverUnavailable = true;
      throw error;
    }

    async function fetchOAuthRows(interactive){
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
      return { rows:payload.values || [], source:"browser-google-oauth" };
    }

    async function fetchRows(interactive, silent){
      const server = await fetchServerRows();
      if(server.rows){
        if(!silent) options.toast("Compras sincronizadas desde servidor");
        return server;
      }
      if(server.missingConfig){
        if(!silent) options.toast("Servidor de compras no configurado");
        if(may2026AlreadyComplete(options.getState())){
          return { rows:[], source:"local-may-total-complete", skippedOAuth:true };
        }
        return fetchOAuthRows(interactive);
      }
      return fetchOAuthRows(interactive);
    }

    async function importNow({ interactive = true, silent = false } = {}){
      if(settings().purchaseRegistryAutoSync === false || settings().purchaseRegistryAutoSync === "false"){
        return { imported:0, repaired:0, skipped:0, disabled:true };
      }
      let fetched;
      try{
        fetched = await fetchRows(interactive, silent);
      }catch(error){
        if(error?.serverUnavailable && !silent) options.toast("Google Sheets no accesible desde servidor");
        throw error;
      }
      const rows = fetched.rows || [];
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
          const repairedPurchase = { ...existing, ...purchase, id:existing.id };
          if(shouldRepairImportedPurchase(existing, purchase) || purchasesDiffer(existing, repairedPurchase)){
            await options.savePurchase(repairedPurchase);
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
      if(!silent && imported) options.toast(`${imported} compras importadas del registro`);
      if(!silent && repaired) options.toast(`${repaired} compras reparadas desde el registro`);
      if(!silent && !imported && !repaired) options.toast("Registro revisado: no hay compras nuevas");
      return { imported, repaired, skipped, disabled:false, source:fetched.source };
    }

    async function runDaily(){
      const lastRun = Date.parse(global.localStorage.getItem(LAST_RUN_KEY) || "");
      if(Number.isFinite(lastRun) && Date.now() - lastRun < DAY_MS) return { skippedDaily:true };
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
