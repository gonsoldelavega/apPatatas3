(function(global){
  const EUR = new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR" });

  function money(value, n){
    return EUR.format(n(value));
  }

  function csvCell(value){
    const stringValue = String(value ?? "");
    return /[;"\n]/.test(stringValue) ? '"' + stringValue.replaceAll('"', '""') + '"' : stringValue;
  }

  global.AppUtilsFormat = {
    money,
    csvCell
  };
})(window);
