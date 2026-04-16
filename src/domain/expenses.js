(function(global){
  function expenseTotal(expense, n){
    return n(expense.base) * (1 + n(expense.iva) / 100);
  }

  global.AppDomainExpenses = {
    expenseTotal
  };
})(window);
