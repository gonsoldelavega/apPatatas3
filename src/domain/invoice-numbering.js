(function(global){
  // Numeracion de facturas a prueba de multiples dispositivos.
  // Estrategia (Opcion B): cada dispositivo asigna un numero "provisional" al crear;
  // al sincronizar, si dos facturas comparten numero, se conserva la mas antigua y la
  // otra se renumera al siguiente libre. Determinista: ambos moviles convergen igual.

  function parseInvoiceNumber(number){
    const value = String(number || "").trim();
    const full = value.match(/(\d+)\s*\/\s*(20\d{2})\b/);
    if(full) return { seq:Number(full[1]), year:Number(full[2]) };
    const yearMatch = value.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : 0;
    const nums = (value.match(/\d+/g) || []).map(Number).filter(n => n !== year);
    return { seq:nums.length ? nums[0] : 0, year };
  }

  function composeNumber(prefix, seq, year){
    return `${prefix}-${String(seq).padStart(3, "0")}/${year}`;
  }

  // Orden determinista para elegir que factura CONSERVA el numero en un choque:
  // la de fecha de emision mas antigua; a igualdad, el id mas bajo (estable).
  function keeperOrder(a, b){
    const da = String(a.issueDate || a.date || "");
    const db = String(b.issueDate || b.date || "");
    if(da !== db) return da < db ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
  }

  function reconcileInvoiceNumbers(invoices, options){
    const prefix = (options && options.prefix) || "FAC";
    const list = Array.isArray(invoices) ? invoices : [];
    const groups = new Map();
    const maxSeqByYear = {};
    list.forEach(invoice => {
      const { seq, year } = parseInvoiceNumber(invoice && invoice.number);
      if(seq > 0 && year > 0){
        const key = `${year}#${seq}`;
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push(invoice);
        maxSeqByYear[year] = Math.max(maxSeqByYear[year] || 0, seq);
      }
    });

    const changes = [];
    const replaced = new Map();
    groups.forEach(group => {
      if(group.length <= 1) return;
      const sorted = group.slice().sort(keeperOrder);
      const { year } = parseInvoiceNumber(sorted[0].number);
      sorted.slice(1).forEach(invoice => {
        const newSeq = (maxSeqByYear[year] || 0) + 1;
        maxSeqByYear[year] = newSeq;
        const from = invoice.number;
        const to = composeNumber(prefix, newSeq, year);
        replaced.set(invoice.id, { ...invoice, number:to, invoiceNumber:to, renumberedFrom:from, updatedAt:new Date().toISOString() });
        changes.push({ id:invoice.id, from, to });
      });
    });

    const nextInvoices = changes.length
      ? list.map(invoice => replaced.get(invoice.id) || invoice)
      : list;
    const maxSeq = Object.keys(maxSeqByYear).length ? Math.max(...Object.values(maxSeqByYear)) : 0;
    return { invoices:nextInvoices, changes, nextSeq:maxSeq + 1 };
  }

  const api = { parseInvoiceNumber, composeNumber, reconcileInvoiceNumbers };
  if(global) global.AppInvoiceNumbering = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
