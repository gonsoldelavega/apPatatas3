(function(global){
  const REMOTE_SPECS = {
    clientes:    { table:"clientes",        primaryKey:"cliente_id" },
    proveedores: { table:"proveedores",     primaryKey:"proveedor_id" },
    productos:   { table:"productos",       primaryKey:"producto_id" },
    facturas:    { table:"facturas_venta",  primaryKey:"id" },
    compras:     { table:"facturas_compra", primaryKey:"id" },
    gastos:      { table:"gastos",          primaryKey:"id" },
    monedero:    { table:"monedero",        primaryKey:"id" }
  };
  const SHARED_SETTINGS_ROW_ID = "global";
  const AUX_STATE_ROW_ID = "global";

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
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from(spec.table).select("*");
      if(error) throw error;
      return (data || []).map(row => normalizeRow(tableKey, row));
    }catch(error){
      logSupabaseError(scope, error);
      return [];
    }
  }

  async function fetchSingleRow(table, scope, id = "global"){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if(error) throw error;
      return data || null;
    }catch(error){
      logSupabaseError(scope, error);
      return null;
    }
  }

  async function upsertSingleRow(table, scope, payload, id = "global"){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const supabase = await getSupabaseClient();
      const nextPayload = { id, ...payload };
      const { data, error } = await supabase
        .from(table)
        .upsert(nextPayload, { onConflict:"id" })
        .select()
        .maybeSingle();
      if(error) throw error;
      return data || nextPayload;
    }catch(error){
      logSupabaseError(scope, error);
      return null;
    }
  }

  async function saveRow(tableKey, scope, payload){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const spec = REMOTE_SPECS[tableKey];
      const supabase = await getSupabaseClient();
      const rowPayload = withPrimaryKey(tableKey, payload);
      if(spec.primaryKey !== "id"){
        delete rowPayload.id;
      }
      const { data, error } = await supabase
        .from(spec.table)
        .upsert(rowPayload, { onConflict:spec.primaryKey })
        .select();
      if(error) throw error;
      return normalizeRow(tableKey, data?.[0]) || payload;
    }catch(error){
      logSupabaseError(scope, error);
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

  async function reserveInvoiceNumber(scope, defaults = {}){
    try{
      const { getSupabaseClient } = await getSupabaseHelpers();
      const supabase = await getSupabaseClient();
      const fallbackNextNumber = Math.max(Number(defaults.next_invoice_number || defaults.nextInvoiceNumber || 1), 1);
      const fallbackYear = Number(defaults.invoice_year || defaults.invoiceYear || new Date().getFullYear());
      const fallbackPrefix = String(defaults.invoice_prefix || defaults.invoicePrefix || "FAC");
      for(let attempt = 0; attempt < 6; attempt += 1){
        const { data:currentRow, error:readError } = await supabase
          .from("app_settings")
          .select("*")
          .eq("id", SHARED_SETTINGS_ROW_ID)
          .maybeSingle();
        if(readError) throw readError;

        if(!currentRow){
          const reserved = fallbackNextNumber;
          const seedRow = {
            id:SHARED_SETTINGS_ROW_ID,
            invoice_prefix:fallbackPrefix,
            invoice_year:fallbackYear,
            next_invoice_number:reserved + 1,
            iban:String(defaults.iban || ""),
            account_holder:String(defaults.account_holder || defaults.accountHolder || ""),
            company_name:String(defaults.company_name || defaults.companyName || ""),
            company_nif:String(defaults.company_nif || defaults.companyNif || ""),
            company_address:String(defaults.company_address || defaults.companyAddress || ""),
            company_phone:String(defaults.company_phone || defaults.companyPhone || ""),
            company_email:String(defaults.company_email || defaults.companyEmail || ""),
            drive_client_id:String(defaults.drive_client_id || defaults.driveClientId || ""),
            drive_root_folder_name:String(defaults.drive_root_folder_name || defaults.driveRootFolderName || "apPatatas"),
            drive_auto_upload:Boolean(defaults.drive_auto_upload ?? defaults.driveAutoUpload),
            drive_state_file_name:String(defaults.drive_state_file_name || defaults.driveStateFileName || "apPatatas-state.json"),
            drive_state_auto_sync:Boolean(defaults.drive_state_auto_sync ?? defaults.driveStateAutoSync),
            updated_at:new Date().toISOString()
          };
          const { error:insertError } = await supabase
            .from("app_settings")
            .upsert(seedRow, { onConflict:"id" });
          if(insertError) throw insertError;
          return {
            reserved,
            row:seedRow
          };
        }

        const reserved = Math.max(Number(currentRow.next_invoice_number || fallbackNextNumber), 1);
        const updatePayload = {
          ...currentRow,
          next_invoice_number:reserved + 1,
          updated_at:new Date().toISOString()
        };
        const { data:updateRow, error:updateError } = await supabase
          .from("app_settings")
          .update(updatePayload)
          .eq("id", SHARED_SETTINGS_ROW_ID)
          .eq("next_invoice_number", reserved)
          .select()
          .maybeSingle();
        if(updateError) throw updateError;
        if(updateRow){
          return {
            reserved,
            row:updateRow
          };
        }
      }
      throw new Error("invoice_counter_conflict");
    }catch(error){
      logSupabaseError(scope, error);
      return null;
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
        try{
          const { getSupabaseClient } = await getSupabaseHelpers();
          const supabase = await getSupabaseClient();
          const { data, error } = await supabase
            .from("facturas_venta")
            .upsert(factura, { onConflict:"id" })
            .select();
          if(error) throw error;
          return data?.[0];
        }catch(error){
          logSupabaseError("saveFactura", error);
          return factura || null;
        }
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
        try{
          const { getSupabaseClient } = await getSupabaseHelpers();
          const supabase = await getSupabaseClient();
          const { data, error } = await supabase
            .from("facturas_compra")
            .upsert(compra, { onConflict:"id" })
            .select();
          if(error) throw error;
          return data?.[0];
        }catch(error){
          logSupabaseError("saveCompra", error);
          return compra || null;
        }
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
      },
      async getSharedSettings(){
        return fetchSingleRow("app_settings", "getSharedSettings", SHARED_SETTINGS_ROW_ID);
      },
      async saveSharedSettings(settings){
        return upsertSingleRow("app_settings", "saveSharedSettings", settings, SHARED_SETTINGS_ROW_ID);
      },
      async reserveInvoiceNumber(defaults){
        return reserveInvoiceNumber("reserveInvoiceNumber", defaults);
      },
      async getAuxState(){
        return fetchSingleRow("app_aux_state", "getAuxState", AUX_STATE_ROW_ID);
      },
      async saveAuxState(state){
        return upsertSingleRow("app_aux_state", "saveAuxState", state, AUX_STATE_ROW_ID);
      }
    };
  }

  global.AppStorageLocal = {
    createLocalStorageService
  };
})(window);
