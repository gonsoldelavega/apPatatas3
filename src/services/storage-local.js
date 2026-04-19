(function(global){
  const REMOTE_SPECS = {
    clientes:    { table: "clientes",        primaryKey: "cliente_id" },
    proveedores: { table: "proveedores",     primaryKey: "proveedor_id" },
    productos:   { table: "productos",       primaryKey: "producto_id" },
    facturas:    { table: "facturas_venta",  primaryKey: "registro_id" },
    compras:     { table: "facturas_compra", primaryKey: "registro_id" },
    gastos:      { table: "gastos",          primaryKey: "id" },
    monedero:    { table: "monedero",        primaryKey: "id" }
  };

  async function getSupabaseHelpers(){
    return import("./supabase-client.js");
  }

  function logSupabaseError(scope, error){
    console.error(`[storage-local:${scope}] Error al usar Supabase`, error);
  }

  function withPrimaryKey(tableKey, payload){
    const spec = REMOTE_SPECS[tableKey];
    if(!spec) return payload;
    if(!payload || typeof payload !== "object") return payload;
    const next = { ...payload };
    if(Object.prototype.hasOwnProperty.call(next, "id") && next.id){
      next[spec.primaryKey] = next.id;
    }
    if(tableKey === "productos"){
      next.precio = next.price;
    }
    return next;
  }

  function normalizeRow(tableKey, row){
    const spec = REMOTE_SPECS[tableKey];
    if(!spec || !row || typeof row !== "object") return row;
    if(Object.prototype.hasOwnProperty.call(row, "id") && row.id) return row;
    return {
      ...row,
      id: row[spec.primaryKey] || row.id || ""
    };
  }

  async function fetchAllRows(tableKey, scope){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const spec = REMOTE_SPECS[tableKey];
      console.log("[FETCH] tabla real en Supabase:", spec.table);
      const supabase = await getSupabaseClient();
      console.log("[FETCH] supabase client ok:", !!supabase);
      const { data, error } = await supabase.from(spec.table).select("*");
      console.log("[FETCH] data:", data, "error:", error);
      if(error) throw error;
      return (data || []).map(row => normalizeRow(tableKey, row));
    }catch(error){
      console.error("[FETCH ERROR]", scope, error);
      return [];
    }
  }

  async function saveRow(tableKey, scope, payload){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const spec = REMOTE_SPECS[tableKey];
      console.log("[SAVE] tabla:", spec.table, "primaryKey:", spec.primaryKey);
      const supabase = await getSupabaseClient();
      const rowPayload = withPrimaryKey(tableKey, payload);
      const spec2 = REMOTE_SPECS[tableKey];
      if(spec2.primaryKey !== "id"){
        delete rowPayload.id;
      }
      console.log("[SAVE] payload enviado a Supabase:", JSON.stringify(rowPayload));
      const { data, error } = await supabase
        .from(spec.table)
        .upsert(rowPayload, { onConflict: spec.primaryKey })
        .select();
      console.log("[SAVE] respuesta Supabase - data:", data, "error:", error);
      if(error) throw error;
      return normalizeRow(tableKey, data?.[0]) || payload;
    }catch(error){
      console.error("[SAVE ERROR]", scope, error);
      return payload || null;
    }
  }

  async function deleteRow(tableKey, scope, id){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const spec = REMOTE_SPECS[tableKey];
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from(spec.table)
        .delete()
        .eq(spec.primaryKey, id);
      if(error) throw error;
      return true;
    }catch(error){
      logSupabaseError(scope, error);
      return false;
    }
  }

  function createLocalStorageService(storage){
    return {
      async getItem(key){
        return storage.getItem(key);
      },
      async setItem(key, value){
        storage.setItem(key, value);
      },
      async removeItem(key){
        storage.removeItem(key);
      },
      loadState(options){
        try{
          const raw = storage.getItem(options.key);
          if(!raw){
            return options.applySeed(structuredClone(options.createDefaultState()), options.seed, options.uid);
          }
          return options.migrate(JSON.parse(raw), options);
        }catch{
          return options.applySeed(structuredClone(options.createDefaultState()), options.seed, options.uid);
        }
      },
      persistState(key, state){
        storage.setItem(key, JSON.stringify(state));
      },
      async getClientes(){
        return fetchAllRows("clientes", "getClientes");
      },
      async saveCliente(cliente){
        return saveRow("clientes", "saveCliente", cliente);
      },
      async deleteCliente(id){
        return deleteRow("clientes", "deleteCliente", id);
      },
      async getProveedores(){
        return fetchAllRows("proveedores", "getProveedores");
      },
      async saveProveedor(proveedor){
        return saveRow("proveedores", "saveProveedor", proveedor);
      },
      async deleteProveedor(id){
        return deleteRow("proveedores", "deleteProveedor", id);
      },
      async getProductos(){
        return fetchAllRows("productos", "getProductos");
      },
      async saveProducto(producto){
        return saveRow("productos", "saveProducto", producto);
      },
      async deleteProducto(id){
        return deleteRow("productos", "deleteProducto", id);
      },
      async getFacturas(){
        return fetchAllRows("facturas", "getFacturas");
      },
      async saveFactura(factura){
        return saveRow("facturas", "saveFactura", factura);
      },
      async deleteFactura(id){
        return deleteRow("facturas", "deleteFactura", id);
      },
      async getGastos(){
        return fetchAllRows("gastos", "getGastos");
      },
      async saveGasto(gasto){
        return saveRow("gastos", "saveGasto", gasto);
      },
      async deleteGasto(id){
        return deleteRow("gastos", "deleteGasto", id);
      },
      async getCompras(){
        return fetchAllRows("compras", "getCompras");
      },
      async saveCompra(compra){
        return saveRow("compras", "saveCompra", compra);
      },
      async deleteCompra(id){
        return deleteRow("compras", "deleteCompra", id);
      },
      async getMonedero(){
        return fetchAllRows("monedero", "getMonedero");
      },
      async saveMonedero(movimiento){
        return saveRow("monedero", "saveMonedero", movimiento);
      },
      async deleteMonedero(id){
        return deleteRow("monedero", "deleteMonedero", id);
      },
      async getWalletMovements(){
        return fetchAllRows("monedero", "getWalletMovements");
      },
      async saveWalletMovement(movimiento){
        return saveRow("monedero", "saveWalletMovement", movimiento);
      },
      async deleteWalletMovement(id){
        return deleteRow("monedero", "deleteWalletMovement", id);
      }
    };
  }

  global.AppStorageLocal = {
    createLocalStorageService
  };
})(window);
