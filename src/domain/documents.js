(function(global){
  function documentTypeLabel(type){
    return ({ ticket:"Ticket", supplierInvoice:"Factura proveedor", deliveryProof:"Albaran proveedor", receipt:"Justificante", other:"Otro" }[type] || "Documento");
  }

  function relatedCollection(type){
    return ({ purchase:"purchases", expense:"expenses", deliveryNote:"deliveryNotes", invoice:"invoices" }[type] || "");
  }

  function relatedLabel(type, id, deps){
    const entity = deps.relatedEntity(type, id);
    if(!entity) return "Sin vincular";
    if(type === "purchase") return `Compra ${deps.date(entity.date)}`;
    if(type === "expense") return `Gasto ${entity.concept || entity.category || deps.date(entity.date)}`;
    if(type === "deliveryNote") return entity.number || "Albaran";
    if(type === "invoice") return entity.number || "Factura";
    return "Documento";
  }

  function normalizeOcrText(text){
    return String(text || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function pickLargestAmount(text){
    const matches = [...String(text || "").matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b|\b\d+\.\d{2}\b/g)].map(match => {
      const raw = match[0];
      const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
      return { raw, value:Number(normalized) };
    }).filter(item => Number.isFinite(item.value));
    if(!matches.length) return null;
    return matches.sort((a, b) => b.value - a.value)[0];
  }

  function detectDateFromText(text){
    const candidate = String(text || "").match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b|\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if(!candidate) return "";
    if(candidate[1]){
      const day = candidate[1].padStart(2, "0");
      const month = candidate[2].padStart(2, "0");
      const year = candidate[3].length === 2 ? `20${candidate[3]}` : candidate[3];
      return `${year}-${month}-${day}`;
    }
    return `${candidate[4]}-${candidate[5].padStart(2, "0")}-${candidate[6].padStart(2, "0")}`;
  }

  function matchSupplierFromText(text, suppliers){
    const normalized = String(text || "").toLowerCase();
    return suppliers.find(supplier => {
      const name = String(supplier.name || "").toLowerCase();
      const nif = String(supplier.nif || "").toLowerCase();
      return (name && normalized.includes(name)) || (nif && normalized.includes(nif));
    }) || null;
  }

  function extractOcrSummary(text, suppliers){
    const cleaned = normalizeOcrText(text);
    const lines = cleaned.split("\n").map(item => item.trim()).filter(Boolean);
    const titleLine = lines.find(line => /[a-záéíóúñ]{3,}/i.test(line) && !/\d{2}[\/.-]\d{2}[\/.-]\d{2,4}/.test(line)) || "";
    const amount = pickLargestAmount(cleaned);
    const date = detectDateFromText(cleaned);
    const nif = (cleaned.match(/\b[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]\b|\b\d{8}[A-Z]\b/i) || [])[0] || "";
    const matchedSupplier = matchSupplierFromText(cleaned, suppliers);
    return {
      title:matchedSupplier?.name || titleLine || "",
      supplierId:matchedSupplier?.id || "",
      date,
      total:amount?.value ?? null,
      nif,
      preview:lines.slice(0, 8).join(" | "),
      text:cleaned
    };
  }

  global.AppDomainDocuments = {
    documentTypeLabel,
    relatedCollection,
    relatedLabel,
    normalizeOcrText,
    pickLargestAmount,
    detectDateFromText,
    matchSupplierFromText,
    extractOcrSummary
  };
})(window);
