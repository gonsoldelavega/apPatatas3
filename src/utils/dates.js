(function(global){
  const DATE = new Intl.DateTimeFormat("es-ES");
  const MONTH_LABEL = new Intl.DateTimeFormat("es-ES", { month:"long", year:"numeric" });

  function date(value){
    if (!value) return "-";
    const iso = String(value).length === 10 ? value + "T00:00:00" : value;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "-" : DATE.format(d);
  }

  function today(){
    return new Date().toISOString().slice(0,10);
  }

  function monthKey(value){
    return String(value || "").slice(0,7);
  }

  function quarterOf(dateText){
    const month = Number(String(dateText || "").slice(5,7));
    if(!month) return 0;
    return Math.ceil(month / 3);
  }

  function quarterRange(year, quarter){
    const startMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
    const endMonth = String(quarter * 3).padStart(2, "0");
    return { start:`${year}-${startMonth}-01`, endPrefix:`${year}-${endMonth}` };
  }

  function periodMatchesQuarter(dateText, year, quarter){
    if(!dateText) return false;
    const range = quarterRange(year, quarter);
    return String(dateText).startsWith(String(year)) && quarterOf(dateText) === quarter && dateText >= range.start;
  }

  function formatMonthLabel(key){
    if(key === "Sin fecha") return key;
    const d = new Date(key + "-01T00:00:00");
    return isNaN(d.getTime()) ? key : MONTH_LABEL.format(d);
  }

  global.AppUtilsDates = {
    date,
    today,
    monthKey,
    quarterOf,
    quarterRange,
    periodMatchesQuarter,
    formatMonthLabel
  };
})(window);
