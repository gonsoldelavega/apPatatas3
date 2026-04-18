(function(global){
  const REMOTE_TABLES = {
    clientes: "clientes",
    productos: "productos",
    facturas: "facturas",
    gastos: "gastos",
    compras: "compras",
    monedero: "monedero"
  };

  async function getSupabaseHelpers(){
    return import("./supabase-client.js");
  }

  function logSupabaseError(scope, error){
    console.error(`[storage-local:${scope}] Error al usar Supabase`, error);
  }

  async function fetchAllRows(tableKey, scope){
    try{
      const { getAll } = await getSupabaseHelpers();
      return await getAll(REMOTE_TABLES[tableKey]);
    }catch(error){
      logSupabaseError(scope, error);
      return [];
    }
  }

  async function saveRow(tableKey, scope, payload){
    try{
      const { insert, update } = await getSupabaseHelpers();
      if(payload?.id){
        const rows = await update(REMOTE_TABLES[tableKey], payload.id, payload);
        return rows?.[0] || payload;
      }
      const rows = await insert(REMOTE_TABLES[tableKey], payload);
      return rows?.[0] || payload;
    }catch(error){
      logSupabaseError(scope, error);
      return payload || null;
    }
  }

  async function deleteRow(tableKey, scope, id){
    try{
      const { remove } = await getSupabaseHelpers();
      return await remove(REMOTE_TABLES[tableKey], id);
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
