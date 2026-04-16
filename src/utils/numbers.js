(function(global){
  function n(value){
    const parsed = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  global.AppUtilsNumbers = {
    n
  };
})(window);
