(function(global){
  function lineBase(line, n){
    return n(line.quantity) * n(line.price);
  }

  function lineVat(line, n){
    return lineBase(line, n) * n(line.iva) / 100;
  }

  function lineTotal(line, n){
    return lineBase(line, n) + lineVat(line, n);
  }

  function period(start, end, date){
    if(!start && !end) return "Sin período";
    if(start && end && start !== end) return "Del " + date(start) + " al " + date(end);
    return date(start || end);
  }

  function parseInvoiceNumber(value){
    const match = String(value || "").match(/(\d+)(?=\/)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function composeInvoiceNumber(settings, seq){
    return `${settings.invoicePrefix}-${String(seq).padStart(3,"0")}/${settings.invoiceYear}`;
  }

  function invoiceTotals(invoice, n){
    const base = (invoice.lines || []).reduce((sum, line) => sum + lineBase(line, n), 0);
    const vat = (invoice.lines || []).reduce((sum, line) => sum + lineVat(line, n), 0);
    const total = base + vat;
    const paid = n(invoice.amountPaid);
    return { base, vat, total, paid, pending:Math.max(total - paid, 0) };
  }

  function invoicePaymentStatus(invoice, n){
    const totals = invoiceTotals(invoice, n);
    if(totals.paid >= totals.total - 0.009 && totals.total > 0) return "paid";
    if(totals.paid > 0.009) return "partial";
    return "pending";
  }

  function invoiceIsOverdue(invoice, n, today){
    if(!invoice?.dueDate) return false;
    if(invoicePaymentStatus(invoice, n) === "paid") return false;
    return String(invoice.dueDate) < String(today || "");
  }

  function groupInvoices(list, monthKey, formatMonthLabel, invoiceTotalsFn){
    const grouped = new Map();
    list.forEach(invoice => {
      const key = monthKey(invoice.issueDate) || "Sin fecha";
      if(!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(invoice);
    });
    return [...grouped.entries()].map(([key, items]) => ({
      label:formatMonthLabel(key),
      items,
      total:items.reduce((sum, invoice) => sum + invoiceTotalsFn(invoice).total, 0)
    }));
  }

  global.AppDomainInvoices = {
    lineBase,
    lineVat,
    lineTotal,
    period,
    parseInvoiceNumber,
    composeInvoiceNumber,
    invoiceTotals,
    invoicePaymentStatus,
    invoiceIsOverdue,
    groupInvoices
  };
})(window);
