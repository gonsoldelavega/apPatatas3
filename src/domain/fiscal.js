(function(global){
  function fiscalQuarterSummary(state, year, quarter, deps){
    const invoices = state.invoices.filter(item => deps.periodMatchesQuarter(item.issueDate, year, quarter));
    const expenses = state.expenses.filter(item => deps.periodMatchesQuarter(item.date, year, quarter));
    const purchases = state.purchases.filter(item => deps.periodMatchesQuarter(item.date, year, quarter));
    const salesBase = invoices.reduce((sum, item) => sum + deps.invoiceTotals(item).base, 0);
    const salesVat = invoices.reduce((sum, item) => sum + deps.invoiceTotals(item).vat, 0);
    const purchaseBaseTotal = purchases.reduce((sum, item) => sum + deps.purchaseBase(item), 0);
    const purchaseVatTotal = purchases.reduce((sum, item) => sum + (deps.purchaseTotal(item) - deps.purchaseBase(item)), 0);
    const expenseBaseTotal = expenses.reduce((sum, item) => sum + deps.n(item.base), 0);
    const expenseVatTotal = expenses.reduce((sum, item) => sum + (deps.expenseTotal(item) - deps.n(item.base)), 0);
    const deductibleVat = purchaseVatTotal + expenseVatTotal;
    const vatResult = salesVat - deductibleVat;
    const profitEstimate = salesBase - purchaseBaseTotal - expenseBaseTotal;
    const irpf130Estimate = Math.max(profitEstimate, 0) * 0.2;
    const alerts = [];
    if(state.expenses.some(item => deps.periodMatchesQuarter(item.date, year, quarter) && !item.supplierId)) alerts.push("Hay gastos del trimestre sin proveedor asignado.");
    if(state.documents.some(item => deps.periodMatchesQuarter(item.date, year, quarter) && !item.relatedType)) alerts.push("Hay documentos del trimestre sin vincular a compra, gasto, albaran o factura.");
    if(vatResult < 0) alerts.push("El IVA estimado sale a compensar o devolver.");
    return {
      year,
      quarter,
      invoices,
      expenses,
      purchases,
      salesBase,
      salesVat,
      purchaseBaseTotal,
      purchaseVatTotal,
      expenseBaseTotal,
      expenseVatTotal,
      deductibleVat,
      vatResult,
      profitEstimate,
      irpf130Estimate,
      alerts
    };
  }

  global.AppDomainFiscal = {
    fiscalQuarterSummary
  };
})(window);
