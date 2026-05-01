(function(global){
  const TABLES = [
    "clientes",
    "proveedores",
    "productos",
    "facturas_venta",
    "facturas_compra",
    "gastos",
    "monedero",
    "app_settings",
    "app_aux_state"
  ];

  function subscribe(supabase, onChange){
    if(!supabase || typeof supabase.channel !== "function"){
      throw new Error("Supabase realtime no disponible");
    }
    if(typeof onChange !== "function"){
      throw new Error("Realtime callback no válido");
    }

    const channel = supabase.channel("factupapa-realtime");

    TABLES.forEach(table => {
      channel.on(
        "postgres_changes",
        { event:"*", schema:"public", table },
        payload => onChange({
          table,
          eventType:payload?.eventType || "UNKNOWN",
          payload
        })
      );
    });

    channel.subscribe(status => {
      if(status === "CHANNEL_ERROR"){
        console.error("[realtime] canal con error");
      }
    });

    const onVisible = () => {
      if(document.visibilityState === "visible"){
        onChange({ table:"__visibility__", eventType:"VISIBLE" });
      }
    };
    const onOnline = () => onChange({ table:"__reconnect__", eventType:"ONLINE" });

    document.addEventListener("visibilitychange", onVisible);
    global.addEventListener("online", onOnline);

    return {
      unsubscribe(){
        document.removeEventListener("visibilitychange", onVisible);
        global.removeEventListener("online", onOnline);
        supabase.removeChannel(channel);
      }
    };
  }

  global.AppRealtime = {
    subscribe
  };
})(window);
