  (async () => {
      const { getSupabaseClient } = await import("../services/supabase-client.js");
      const KEY = window.AppInitialState.STORAGE_KEY;
      const APP_VERSION = "2026.04.16-vercel-sync";
      const SYNC_TOKEN_KEY = "factupapa-sync-token";
      const SYNC_META_KEY = "factupapa-sync-meta-v1";
      const PRIMARY_REMOTE_COLLECTIONS = ["clients","products","invoices","expenses","purchases","walletMovements"];
      const YEAR = new Date().getFullYear();
      const LEGAL_PAYMENT_TEXT = {
        payment: "Forma de pago: El importe de la presente factura deberá ser abonado en un plazo máximo de 72 horas desde su fecha de emisión.",
        breach: [
          "Se devengarán automáticamente intereses de demora conforme a la Ley 3/2004, aplicando el tipo de interés legal vigente más 8 puntos porcentuales.",
          "Se aplicará una indemnización mínima de 40EUR por costes de gestión de cobro, según establece dicha ley.",
          "El proveedor se reserva el derecho a suspender el suministro de mercancía hasta la regularización de la deuda.",
          "Cualquier gasto adicional derivado de la reclamación (gestoría, abogado, recobro) será repercutido al cliente."
        ],
        acceptance: "La recepción de la mercancía o de la factura implica la aceptación expresa de estas condiciones."
      };
        const navItems = [{id:"dashboard",label:"Inicio",icon:"⌂"},{id:"action-sheet",label:"Crear",icon:"+"},{id:"settings",label:"Ajustes",icon:"⚙"}];
      const ui = window.AppUIState.createUiState();
      const selectors = window.AppSelectors;
      const numbers = window.AppUtilsNumbers;
      const strings = window.AppUtilsStrings;
      const ids = window.AppUtilsIds;
      const dates = window.AppUtilsDates;
      const format = window.AppUtilsFormat;
      const invoicesDomain = window.AppDomainInvoices;
      const productsDomain = window.AppDomainProducts;
      const stockDomain = window.AppDomainStock;
      const purchasesDomain = window.AppDomainPurchases;
      const expensesDomain = window.AppDomainExpenses;
      const fiscalDomain = window.AppDomainFiscal;
      const documentsDomain = window.AppDomainDocuments;
      const invoiceCardUI = window.AppUICardInvoice;
      const clientCardUI = window.AppUICardClient;
      const productCardUI = window.AppUICardProduct;
      const documentCardUI = window.AppUICardDocument;
      const scannerViewUI = window.AppUIScannerView;
      const renderNavUI = window.AppUIRenderNav;
      const renderViewsUI = window.AppUIRenderViews;
      const modalUI = window.AppUIModal;
      const lineEditorUI = window.AppUILineEditor;
      const clientFormUI = window.AppUIFormClient;
      const supplierFormUI = window.AppUIFormSupplier;
      const productFormUI = window.AppUIFormProduct;
      const purchaseFormUI = window.AppUIFormPurchase;
      const expenseFormUI = window.AppUIFormExpense;
      const walletFormUI = window.AppUIFormWallet;
      const invoiceFormUI = window.AppUIFormInvoice;
      const documentFormUI = window.AppUIFormDocument;
      const ocrService = window.AppOcrService;
      const deliveryNoteFormUI = window.AppUIFormDeliveryNote;
      let deferredPrompt = null;
      let suppressSyncPersistence = false;
      let syncManager = null;
      let supabaseHydrated = false;

      function uid(prefix){ return ids.uid(prefix); }
      const storageService = window.AppStorageLocal.createLocalStorageService(window.localStorage);
      const store = window.AppStore.createStore({
        key: KEY,
        storage: storageService,
        createDefaultState: window.AppInitialState.createDefaultState,
        applySeed: window.AppMigrations.applySeed,
        migrate: window.AppMigrations.migrateState,
        seed: window.AppInitialState.getSeedData(),
        uid,
        beforePersist(snapshot){
          if(suppressSyncPersistence) return snapshot;
          const updatedAt = safeIso(undefined, "");
          return {
            ...snapshot,
            settings:{
              ...(snapshot.settings || {}),
              lastSavedAt:updatedAt
            },
            _sync:{
              ...(snapshot._sync || {}),
              updatedAt,
              version:1
            }
          };
        },
        onPersist(snapshot, meta){
          if(suppressSyncPersistence || !syncManager) return;
          syncManager.onLocalPersist(snapshot, meta);
        }
      });
      let state = store.getState();
      function syncState(){ state = store.getState(); return state; }
      function n(v){ return numbers.n(v); }
      function money(v){ return format.money(v, n); }
      function date(v){ return dates.date(v); }
      function today(){ return dates.today(); }
      function esc(v){ return strings.esc(v); }
      function csvCell(v){ return format.csvCell(v); }
      function monthKey(v){ return dates.monthKey(v); }
      function templateName(id){ return selectors.templateName(state, id); }
      function getClient(id){ return selectors.getClient(state, id); }
      function getSupplier(id){ return selectors.getSupplier(state, id); }
      function getProduct(id){ return selectors.getProduct(state, id); }
      function normalizeName(value){ return strings.normalizeName(value); }
      function inferStockGroup(product){ return productsDomain.inferStockGroup(product, normalizeName); }
      function stockGroupKey(productOrId){ return stockDomain.stockGroupKey(productOrId, getProduct, inferStockGroup); }
      function stockGroupLabel(productOrId){ return stockDomain.stockGroupLabel(productOrId, getProduct, stockGroupKey); }
      function lineBase(line){ return invoicesDomain.lineBase(line, n); }
      function lineVat(line){ return invoicesDomain.lineVat(line, n); }
      function lineTotal(line){ return invoicesDomain.lineTotal(line, n); }
      function purchaseBase(x){ return purchasesDomain.purchaseBase(x, n); }
      function purchaseTotal(x){ return purchasesDomain.purchaseTotal(x, n); }
      function expenseTotal(x){ return expensesDomain.expenseTotal(x, n); }
      function walletMovementDelta(item){
        if(!item) return 0;
        if(item.kind === "in") return Math.max(n(item.amount), 0);
        if(item.kind === "out") return -Math.max(n(item.amount), 0);
        return n(item.delta);
      }
      function walletBalance(list = state.walletMovements || []){
        return (list || []).reduce((sum, item) => sum + walletMovementDelta(item), 0);
      }
      function walletKindLabel(kind){
        return kind === "in" ? "Entrada" : kind === "out" ? "Salida" : "Ajuste";
      }
      function walletScopeLabel(scope){
        return scope === "business" ? "Negocio" : scope === "personal" ? "Personal" : "General";
      }
      function period(start,end){ return invoicesDomain.period(start, end, date); }
      function parseInvoiceNumber(value){ return invoicesDomain.parseInvoiceNumber(value); }
      function composeInvoiceNumber(seq){ return invoicesDomain.composeInvoiceNumber(state.settings, seq); }
      function blankLine(){ return productsDomain.buildBlankLine(state.products); }
      function stock(productId){ return stockDomain.stock(productId, state, { getProduct, stockGroupKey, n }); }
      function invoiceTotals(invoice){ return invoicesDomain.invoiceTotals(invoice, n); }
      function invoicePaymentStatus(invoice){ return invoicesDomain.invoicePaymentStatus(invoice, n); }
      function invoiceIsOverdue(invoice){ return invoicesDomain.invoiceIsOverdue(invoice, n, today()); }

      function loadState(){ return store.getState(); }
      function applySeed(base){ return window.AppMigrations.applySeed(base, window.AppInitialState.getSeedData(), uid); }
      function migrate(saved){ return store.migrate(saved); }
      function persist(){ store.persist(); syncState(); }
      function ensureDataNotice(){
        let node = document.getElementById("dataSourceNotice");
        if(node) return node;
        node = document.createElement("div");
        node.id = "dataSourceNotice";
        node.style.display = "none";
        node.style.margin = "10px 0 0";
        node.style.padding = "12px 14px";
        node.style.borderRadius = "16px";
        node.style.border = "1px solid rgba(180,84,45,.18)";
        node.style.background = "rgba(255,244,237,.92)";
        node.style.color = "#7a3d1d";
        node.style.fontWeight = "600";
        document.querySelector(".app")?.insertBefore(node, document.getElementById("tabs"));
        return node;
      }
      function showDataNotice(message, tone = "warn"){
        const node = ensureDataNotice();
        if(!node) return;
        node.textContent = message;
        node.style.display = "block";
        if(tone === "ok"){
          node.style.borderColor = "rgba(29,127,72,.18)";
          node.style.background = "rgba(238,250,242,.92)";
          node.style.color = "#1d7f48";
        }else{
          node.style.borderColor = "rgba(180,84,45,.18)";
          node.style.background = "rgba(255,244,237,.92)";
          node.style.color = "#7a3d1d";
        }
      }
      function hideDataNotice(){
        const node = document.getElementById("dataSourceNotice");
        if(node) node.style.display = "none";
      }
      function encodePackedText(value){
        return `__APP_JSON__${JSON.stringify(value || {})}`;
      }
      function decodePackedText(value){
        const text = String(value || "");
        if(!text.startsWith("__APP_JSON__")) return null;
        try{
          return JSON.parse(text.slice("__APP_JSON__".length));
        }catch{
          return null;
        }
      }
      function parseJsonLines(value){
        if(Array.isArray(value)) return value;
        if(typeof value === "string"){
          try{
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          }catch{
            return [];
          }
        }
        return [];
      }
      function mapClientToSupabase(item){
        return {
          cliente_id:item.id,
          nombre:item.name || "",
          nif:item.taxId || "",
          telefono:item.phone || "",
          email:item.email || "",
          direccion:item.address || "",
          cp:item.cp || "",
          ciudad:item.city || "",
          provincia:item.province || "",
          pais:item.country || "",
          notas:item.notes || ""
        };
      }
      function mapClientFromSupabase(row){
        return {
          id:row.cliente_id || "",
          name:row.nombre || "",
          taxId:row.nif || "",
          phone:row.telefono || "",
          email:row.email || "",
          address:row.direccion || "",
          cp:row.cp || "",
          city:row.ciudad || "",
          province:row.provincia || "",
          country:row.pais || "",
          notes:row.notas || "",
          contactPerson:"",
          shippingAddress:"",
          debtManual:0,
          templateId:"base",
          paymentTermsDefault:false
        };
      }
      function mapSupplierFromSupabase(row){
        return {
          id:row.proveedor_id || "",
          name:row.nombre || "",
          taxId:row.nif || "",
          phone:row.telefono || "",
          email:row.email || "",
          address:row.direccion || "",
          cp:row.cp || "",
          city:row.ciudad || "",
          province:row.provincia || "",
          country:row.pais || "",
          notes:row.notas || ""
        };
      }
      function mapProductToSupabase(item){
        return {
          producto_id:item.id,
          nombre:item.name || "",
          aliases:item.aliases || "",
          tipo:item.type || "",
          unidad:item.unit || "",
          iva_pct:n(item.ivaPct),
          precio:n(item.price),
          notas:item.notes || ""
        };
      }
      function mapProductFromSupabase(row){
        return {
          id:row.producto_id || "",
          name:row.nombre || "",
          aliases:row.aliases || "",
          type:row.tipo || "",
          unit:row.unidad || "",
          ivaPct:n(row.iva_pct),
          notes:row.notas || "",
          price:n(row.precio),
          iva:n(row.iva_pct),
          observations:row.notas || "",
          category:"",
          supplierId:"",
          cost:0,
          stockBase:0,
          stockMin:0
        };
      }
      function mapInvoiceToSupabase(item){
        return {
          id:item.id,
          numero_factura:item.number || "",
          fecha_factura:item.issueDate || item.date || today(),
          fecha_vencimiento:item.dueDate || null,
          cliente_id:item.clientId || "",
          cliente_nombre:item.clientName || "",
          estado_cobro:item.status || "pending",
          fecha_cobro:item.paidDate || item.paymentDate || null,
          amount_paid:n(item.amountPaid),
          payment_method:item.paymentMethod || "",
          base_factura:n(item.base),
          iva_factura:n(item.iva),
          total_factura:n(item.total),
          lines:JSON.stringify(item.lines || []),
          internal_note:item.internalNote || "",
          template_id:item.templateId || "base"
        };
      }
      function mapInvoiceFromSupabase(row){
        const lines = parseJsonLines(row.lines).map(line => ({
          ...line,
          iva: line.iva ?? line.ivaPct ?? 0,
          ivaPct: line.ivaPct ?? line.iva ?? 0,
          ivaAmount: line.ivaAmount ?? line.ivaLinea ?? 0,
          total: line.total ?? line.totalLinea ?? 0,
          base: line.base ?? line.baseLinea ?? 0,
          price: line.price ?? line.precioUnitarioBase ?? 0
        }));
        return {
          id:row.id || "",
          number:row.numero_factura || "",
          issueDate:row.fecha_factura || today(),
          date:row.fecha_factura || today(),
          dueDate:row.fecha_vencimiento || "",
          clientId:row.cliente_id || "",
          clientName:row.cliente_nombre || "",
          status:row.estado_cobro || "pending",
          paidDate:row.fecha_cobro || "",
          amountPaid:n(row.amount_paid),
          paymentMethod:row.payment_method || "",
          base:n(row.base_factura),
          iva:n(row.iva_factura),
          total:n(row.total_factura),
          lines,
          internalNote:row.internal_note || "",
          templateId:row.template_id || "base",
          paymentDate:row.fecha_cobro || "",
          sendStatus:"",
          showPaymentTerms:false,
          paymentNote:"",
          items:lines
        };
      }
      function mapExpenseToSupabase(item){
        return {
          id:item.id,
          fecha:item.date || today(),
          supplier_id:item.supplierId || "",
          categoria:item.category || "",
          concepto:item.concept || "",
          base:n(item.base),
          iva:n(item.iva),
          notas:item.notes || ""
        };
      }
      function mapExpenseFromSupabase(row){
        return {
          id:row.id,
          date:row.fecha || today(),
          supplierId:row.supplier_id || "",
          category:row.categoria || "",
          concept:row.concepto || "",
          base:n(row.base),
          iva:n(row.iva),
          notes:row.notas || ""
        };
      }
      function mapPurchaseToSupabase(item){
        return {
          id:item.id,
          numero_factura:item.number || "",
          fecha_factura:item.issueDate || item.date || today(),
          proveedor_id:item.supplierId || "",
          proveedor_nombre:item.supplierName || "",
          estado_pago:item.status || "pending",
          fecha_pago:item.paidDate || item.paymentDate || null,
          amount_paid:n(item.amountPaid),
          base_factura:n(item.base),
          iva_factura:n(item.iva),
          total_factura:n(item.total),
          lines:JSON.stringify(item.lines || []),
          internal_note:item.internalNote || ""
        };
      }
      function mapPurchaseFromSupabase(row){
        const lines = parseJsonLines(row.lines).map(line => ({
          ...line,
          iva: line.iva ?? line.ivaPct ?? 0,
          ivaPct: line.ivaPct ?? line.iva ?? 0,
          ivaAmount: line.ivaAmount ?? line.ivaLinea ?? 0,
          total: line.total ?? line.totalLinea ?? 0,
          base: line.base ?? line.baseLinea ?? 0,
          price: line.price ?? line.precioUnitarioBase ?? 0
        }));
        const firstLine = lines[0] || {};
        return {
          id:row.id || "",
          number:row.numero_factura || "",
          date:row.fecha_factura || today(),
          issueDate:row.fecha_factura || today(),
          supplierId:row.proveedor_id || "",
          supplierName:row.proveedor_nombre || "",
          status:row.estado_pago || "pending",
          paidDate:row.fecha_pago || "",
          amountPaid:n(row.amount_paid),
          base:n(row.base_factura),
          iva:n(row.iva_factura),
          total:n(row.total_factura),
          lines,
          items:lines,
          productId:firstLine.productId || "",
          description:firstLine.description || "",
          quantity:firstLine.quantity || 0,
          unitCost:firstLine.price || firstLine.unitCost || 0,
          concept:firstLine.description || "",
          supplier:row.proveedor_nombre || "",
          amount:n(row.total_factura),
          baseAmount:n(row.base_factura),
          ivaAmount:n(row.iva_factura),
          totalAmount:n(row.total_factura),
          invoiceNumber:row.numero_factura || "",
          type:"invoice",
          internalNote:row.internal_note || "",
          paymentDate:row.fecha_pago || "",
          attachment:null
        };
      }
      function mapWalletToSupabase(item){
        return {
          id:item.id,
          fecha:item.date || today(),
          tipo:item.kind,
          importe:n(item.amount),
          delta:n(item.delta),
          saldo_objetivo:n(item.targetBalance),
          ambito:item.scope || "",
          registrar_como:item.registerAs || "",
          supplier_id:item.supplierId || "",
          expense_category:item.expenseCategory || "",
          product_id:item.productId || "",
          quantity:n(item.quantity),
          linked_type:item.linkedType || "",
          linked_id:item.linkedId || "",
          notas:item.notes || "",
        };
      }
      function mapWalletFromSupabase(row){
        return {
          id:row.id,
          date:row.fecha || today(),
          kind:row.tipo || "out",
          amount:n(row.importe),
          delta:n(row.delta),
          targetBalance:n(row.saldo_objetivo),
          scope:row.ambito || "neutral",
          registerAs:row.registrar_como || "none",
          supplierId:row.supplier_id || "",
          expenseCategory:row.expense_category || "",
          productId:row.product_id || "",
          quantity:n(row.quantity),
          linkedType:row.linked_type || "",
          linkedId:row.linked_id || "",
          notes:row.notas || ""
        };
      }
      async function loadSupabaseTableWithLogs(label, loader){
        console.log(`[SUPABASE] cargando ${label}...`);
        try{
          const rows = await loader();
          console.log(`[SUPABASE] ${label} → ${(rows || []).length} registros`);
          return rows || [];
        }catch(error){
          console.error(`[SUPABASE ERROR] ${label} → ${error?.message || String(error)}`);
          throw error;
        }
      }
      async function hydratePrimaryEntitiesFromSupabase(){
        try{
          const [clientsRows, suppliersRows, productsRows, invoicesRows, expensesRows, purchasesRows, walletRows] = await Promise.all([
            loadSupabaseTableWithLogs("clientes", () => storageService.getClientes()),
            loadSupabaseTableWithLogs("proveedores", () => storageService.getProveedores()),
            loadSupabaseTableWithLogs("productos", () => storageService.getProductos()),
            loadSupabaseTableWithLogs("facturas", () => storageService.getFacturas()),
            loadSupabaseTableWithLogs("gastos", () => storageService.getGastos()),
            loadSupabaseTableWithLogs("compras", () => storageService.getCompras()),
            loadSupabaseTableWithLogs("monedero", () => storageService.getWalletMovements())
          ]);
          store.updateState(current => {
            current.clients = (clientsRows || []).map(mapClientFromSupabase);
            current.suppliers = (suppliersRows || []).map(mapSupplierFromSupabase);
            current.products = (productsRows || []).map(mapProductFromSupabase);
            current.invoices = (invoicesRows || []).map(mapInvoiceFromSupabase);
            current.expenses = (expensesRows || []).map(mapExpenseFromSupabase);
            current.purchases = (purchasesRows || []).map(mapPurchaseFromSupabase);
            current.walletMovements = (walletRows || []).map(mapWalletFromSupabase);
          }, { persist:true, reason:"supabase:hydrate-primary" });
          syncState();
          supabaseHydrated = true;
          hideDataNotice();
          return true;
        }catch(error){
          console.error("[supabase] No se pudieron cargar los datos principales. Se usara la copia local temporal.", error);
          showDataNotice("Trabajando con copia temporal local. La nube principal no ha respondido.", "warn");
          return false;
        }
      }
      function firstDayOfCurrentMonth(){
        const current = today();
        return `${String(current || "").slice(0, 7)}-01`;
      }
      function ensureMonthlyRecurringExpenses(){
        const currentMonth = String(today() || "").slice(0, 7);
        if(!currentMonth) return;
        const recurringExpenses = [
          {
            concept:"Gestoría mensual",
            category:"gestoria",
            base:24.00,
            iva:21,
            ivaPct:21,
            ivaAmount:5.04,
            total:29.04,
            notes:"Gasto recurrente mensual automático"
          },
          {
            concept:"Cuota autónomos",
            category:"seguridad_social",
            base:88.56,
            iva:0,
            ivaPct:0,
            ivaAmount:0,
            total:88.56,
            notes:"Gasto recurrente mensual automático"
          }
        ];
        const existing = new Set(
          (state.expenses || [])
            .filter(item => monthKey(item.date) === currentMonth)
            .map(item => String(item.concept || "").trim().toLowerCase())
        );
        recurringExpenses.forEach(item => {
          const key = String(item.concept || "").trim().toLowerCase();
          if(existing.has(key)) return;
          saveEntity("expenses", {
            id:uid("exp"),
            date:firstDayOfCurrentMonth(),
            supplierId:"",
            category:item.category,
            concept:item.concept,
            base:item.base,
            iva:item.iva,
            ivaPct:item.ivaPct,
            ivaAmount:item.ivaAmount,
            total:item.total,
            notes:item.notes
          });
        });
      }
      async function savePrimaryCollectionToSupabase(collection, entity){
        console.log("[SAVE-COLLECTION]", collection, JSON.stringify(entity).substring(0, 300));
        if(collection === "clients") return storageService.saveCliente(mapClientToSupabase(entity));
        if(collection === "products") return storageService.saveProducto(mapProductToSupabase(entity));
        if(collection === "invoices") return storageService.saveFactura(mapInvoiceToSupabase(entity));
        if(collection === "expenses") return storageService.saveGasto(mapExpenseToSupabase(entity));
        if(collection === "purchases") return storageService.saveCompra(mapPurchaseToSupabase(entity));
        if(collection === "walletMovements") return storageService.saveWalletMovement(mapWalletToSupabase(entity));
        return null;
      }
      async function deletePrimaryCollectionFromSupabase(collection, id){
        if(collection === "clients") return storageService.deleteCliente(id);
        if(collection === "products") return storageService.deleteProducto(id);
        if(collection === "invoices") return storageService.deleteFactura(id);
        if(collection === "expenses") return storageService.deleteGasto(id);
        if(collection === "purchases") return storageService.deleteCompra(id);
        if(collection === "walletMovements") return storageService.deleteWalletMovement(id);
        return false;
      }
      async function saveEntity(collection, entity, id){
        const isPrimaryRemote = PRIMARY_REMOTE_COLLECTIONS.includes(collection);
        if(!isPrimaryRemote){
          store.saveEntity(collection, entity, id);
          syncState();
          renderAll();
          return;
        }
        store.saveEntity(collection, entity, id);
        syncState();
        renderAll();
        savePrimaryCollectionToSupabase(collection, entity)
          .then(() => {
            hideDataNotice();
          })
          .catch(error => {
            console.error(`[supabase] No se pudo guardar ${collection}. Se mantiene copia local temporal.`, error);
            showDataNotice("No se pudo guardar en Supabase. Se ha conservado una copia local temporal.", "warn");
          });
      }
      function createWalletMovement(payload){
        const mode = payload?.mode || "out";
        const amount = Math.max(n(payload?.amount), 0);
        const targetBalance = n(payload?.targetBalance);
        const currentBalance = walletBalance();
        const delta = mode === "adjust" ? targetBalance - currentBalance : mode === "in" ? amount : -amount;
        if(mode !== "adjust" && amount <= 0){
          toast("Indica una cantidad valida");
          return false;
        }
        if(mode === "adjust" && Math.abs(delta) < 0.0001){
          toast("El saldo ya coincide con esa cantidad");
          return false;
        }
        const dateValue = payload?.date || today();
        const notes = String(payload?.notes || "").trim();
        const scope = payload?.scope || (mode === "out" ? "business" : "neutral");
        const registerAs = scope === "business" ? (payload?.registerAs || "none") : "none";
        const supplierId = payload?.supplierId || "";
        const expenseCategory = payload?.expenseCategory || "";
        const productId = payload?.productId || "";
        const quantity = Math.max(n(payload?.quantity), 0);
        let createdExpense = null;
        let createdPurchase = null;
        let createdWalletMovement = null;

        store.updateState(current => {
          let linkedType = "";
          let linkedId = "";
          if(mode === "out" && scope === "business" && registerAs === "expense"){
            const expense = {
              id:uid("exp"),
              date:dateValue,
              supplierId,
              category:expenseCategory,
              concept:notes || "Salida de monedero",
              base:amount,
              iva:0,
              notes:["Pagado desde monedero", notes].filter(Boolean).join(" · ")
            };
            current.expenses.unshift(expense);
            createdExpense = expense;
            linkedType = "expense";
            linkedId = expense.id;
          }
          if(mode === "out" && scope === "business" && registerAs === "purchase"){
            const affectsStock = !!productId && quantity > 0;
            const safeQuantity = affectsStock ? quantity : 1;
            const purchase = {
              id:uid("buy"),
              date:dateValue,
              supplierId,
              productId:affectsStock ? productId : "",
              quantity:safeQuantity,
              unitCost:safeQuantity > 0 ? amount / safeQuantity : amount,
              iva:0,
              notes:["Pagado desde monedero", notes].filter(Boolean).join(" · "),
              attachment:null
            };
            current.purchases.unshift(purchase);
            createdPurchase = purchase;
            linkedType = "purchase";
            linkedId = purchase.id;
          }
          createdWalletMovement = {
            id:uid("wal"),
            date:dateValue,
            kind:mode === "adjust" ? "adjust" : mode,
            amount:mode === "adjust" ? Math.abs(delta) : amount,
            delta,
            targetBalance:mode === "adjust" ? targetBalance : null,
            scope:mode === "adjust" ? "neutral" : scope,
            registerAs,
            supplierId,
            expenseCategory,
            productId,
            quantity,
            linkedType,
            linkedId,
            notes
          };
          current.walletMovements.unshift(createdWalletMovement);
        }, { persist:true, reason:`wallet:${mode}` });
        syncState();
        renderAll();
        if(createdExpense) savePrimaryCollectionToSupabase("expenses", createdExpense).catch(error => {
          console.error("[supabase] No se pudo guardar el gasto generado desde monedero", error);
          showDataNotice("El movimiento se guardo en local, pero el gasto vinculado no llego a Supabase.", "warn");
        });
        if(createdPurchase) savePrimaryCollectionToSupabase("purchases", createdPurchase).catch(error => {
          console.error("[supabase] No se pudo guardar la compra generada desde monedero", error);
          showDataNotice("El movimiento se guardo en local, pero la compra vinculada no llego a Supabase.", "warn");
        });
        if(createdWalletMovement) savePrimaryCollectionToSupabase("walletMovements", createdWalletMovement).catch(error => {
          console.error("[supabase] No se pudo guardar el movimiento de monedero", error);
          showDataNotice("El movimiento de monedero se ha quedado en local temporalmente.", "warn");
        });
        toast(mode === "adjust" ? "Saldo del monedero ajustado" : "Movimiento de monedero guardado");
        return true;
      }
      async function removeEntity(collection, id, message){
        if(!confirm(message)) return;
        const isPrimaryRemote = PRIMARY_REMOTE_COLLECTIONS.includes(collection);
        if(isPrimaryRemote){
          try{
            await deletePrimaryCollectionFromSupabase(collection, id);
            hideDataNotice();
          }catch(error){
            console.error(`[supabase] No se pudo eliminar ${collection}. Se usara borrado local temporal.`, error);
            showDataNotice("No se pudo borrar en Supabase. Se ha aplicado un borrado local temporal.", "warn");
          }
        }
        store.removeEntity(collection, id);
        syncState();
        renderAll();
      }
      function deleteWalletMovement(id){
        const item = state.walletMovements.find(x => x.id === id);
        if(!item) return;
        const linkedText = item.linkedType === "expense" ? " y tambien se eliminara el gasto vinculado" : item.linkedType === "purchase" ? " y tambien se eliminara la compra vinculada" : "";
        if(!confirm(`¿Eliminar este movimiento del monedero?${linkedText}`)) return;
        store.updateState(current => {
          const target = current.walletMovements.find(x => x.id === id);
          if(!target) return;
          if(target.linkedType === "expense" && target.linkedId){
            current.expenses = current.expenses.filter(x => x.id !== target.linkedId);
          }
          if(target.linkedType === "purchase" && target.linkedId){
            current.purchases = current.purchases.filter(x => x.id !== target.linkedId);
          }
          current.walletMovements = current.walletMovements.filter(x => x.id !== id);
        }, { persist:true, reason:"wallet:delete" });
        syncState();
        renderAll();
        deletePrimaryCollectionFromSupabase("walletMovements", id).catch(error => {
          console.error("[supabase] No se pudo borrar el movimiento de monedero", error);
          showDataNotice("El movimiento se borro en local, pero no en Supabase.", "warn");
        });
        if(item.linkedType === "expense" && item.linkedId){
          deletePrimaryCollectionFromSupabase("expenses", item.linkedId).catch(error => {
            console.error("[supabase] No se pudo borrar el gasto vinculado", error);
            showDataNotice("El gasto vinculado no se pudo borrar en Supabase.", "warn");
          });
        }
        if(item.linkedType === "purchase" && item.linkedId){
          deletePrimaryCollectionFromSupabase("purchases", item.linkedId).catch(error => {
            console.error("[supabase] No se pudo borrar la compra vinculada", error);
            showDataNotice("La compra vinculada no se pudo borrar en Supabase.", "warn");
          });
        }
        toast("Movimiento del monedero eliminado");
      }
      function toast(message){
        const wrap = document.getElementById("toasts");
        const node = document.createElement("div");
        node.className = "toast";
        node.textContent = message;
        wrap.appendChild(node);
        setTimeout(() => node.remove(), 2600);
      }
      function downloadFile(name, content, type){
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
      }
      function readDeviceLocal(key){
        try{
          return window.localStorage.getItem(key) || "";
        }catch(_error){
          return "";
        }
      }
      function writeDeviceLocal(key, value){
        try{
          if(value === null || value === undefined || value === ""){
            window.localStorage.removeItem(key);
            return;
          }
          window.localStorage.setItem(key, String(value));
        }catch(_error){}
      }
      function readSyncMeta(){
        try{
          const raw = readDeviceLocal(SYNC_META_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          const cleaned = {
            ...parsed,
            lastSuccessAt:safeSyncStamp(parsed?.lastSuccessAt, "sync-meta.lastSuccessAt"),
            lastRemoteTimestamp:safeSyncStamp(parsed?.lastRemoteTimestamp, "sync-meta.lastRemoteTimestamp"),
            lastLocalTimestamp:safeSyncStamp(parsed?.lastLocalTimestamp, "sync-meta.lastLocalTimestamp")
          };
          if(JSON.stringify(parsed || {}) !== JSON.stringify(cleaned)) writeSyncMeta(cleaned);
          return cleaned;
        }catch(_error){
          return {};
        }
      }
      function writeSyncMeta(meta){
        try{
          writeDeviceLocal(SYNC_META_KEY, JSON.stringify(meta || {}));
        }catch(_error){}
      }
      function logInvalidSyncTimestamp(field, rawValue){
        console.warn("[SharedSync] invalid-timestamp", { field, rawValue });
      }
      function isValidDateValue(value){
        if(value instanceof Date) return Number.isFinite(value.getTime());
        if(value === null || value === undefined) return false;
        const text = String(value).trim();
        if(!text) return false;
        const parsed = Date.parse(text);
        return Number.isFinite(parsed);
      }
      function safeIso(value, fallback = ""){
        if(value === undefined){
          const now = new Date();
          return Number.isFinite(now.getTime()) ? now.toISOString() : fallback;
        }
        if(!isValidDateValue(value)){
          logInvalidSyncTimestamp("safeIso", value);
          return fallback;
        }
        return new Date(value).toISOString();
      }
      function safeTime(value, fallback = 0, field = "sync-time"){
        if(!isValidDateValue(value)){
          if(value !== "" && value !== null && value !== undefined) logInvalidSyncTimestamp(field, value);
          return fallback;
        }
        return Date.parse(String(value).trim());
      }
      function safeSyncStamp(value, field = "sync-stamp"){
        if(!isValidDateValue(value)){
          if(value !== "" && value !== null && value !== undefined) logInvalidSyncTimestamp(field, value);
          return "";
        }
        return safeIso(value, "");
      }
      function safeSyncLabel(value){
        const stamp = safeSyncStamp(value, "sync-label");
        return stamp ? `${date(stamp)} ${esc(String(stamp).slice(11,16))}` : "desconocida";
      }
      function mergeSyncMeta(patch){
        const next = { ...readSyncMeta(), ...(patch || {}) };
        if(Object.prototype.hasOwnProperty.call(next, "lastSuccessAt")) next.lastSuccessAt = safeSyncStamp(next.lastSuccessAt, "sync-meta.lastSuccessAt");
        if(Object.prototype.hasOwnProperty.call(next, "lastRemoteTimestamp")) next.lastRemoteTimestamp = safeSyncStamp(next.lastRemoteTimestamp, "sync-meta.lastRemoteTimestamp");
        if(Object.prototype.hasOwnProperty.call(next, "lastLocalTimestamp")) next.lastLocalTimestamp = safeSyncStamp(next.lastLocalTimestamp, "sync-meta.lastLocalTimestamp");
        writeSyncMeta(next);
        return next;
      }
      function syncLog(step, details = {}){
        console.info("[SharedSync]", step, details);
      }
      function uiRenderContext(){
        return {
          state,
          ui,
          n,
          money,
          date,
          today,
          esc,
          monthKey,
          templateName,
          getClient,
          getSupplier,
          getProduct,
          stockGroupLabel,
          stock,
          lineTotal,
          purchaseTotal,
           expenseTotal,
           walletBalance,
           walletMovementDelta,
           walletKindLabel,
           walletScopeLabel,
           invoiceTotals,
          invoicePaymentStatus,
          invoiceIsOverdue,
          period,
          groupInvoices,
          documentTypeLabel,
          relatedLabel,
          invoiceCard,
          clientCard,
          productCard,
          documentCard
        };
      }

      function bumpNextInvoiceNumber(seq){
        store.updateState(current => {
          current.settings.nextInvoiceNumber = seq + 1;
        });
        syncState();
      }
      function formContext(){
        return {
          state,
          year:YEAR,
          uid,
          n,
          money,
          date,
          today,
          esc,
          getClient,
          getSupplier,
          getProduct,
          templateName,
          inferStockGroup,
          blankLine,
           purchaseTotal,
           expenseTotal,
           walletBalance,
           walletMovementDelta,
           walletKindLabel,
           walletScopeLabel,
           lineTotal,
          invoiceTotals,
          composeInvoiceNumber,
           parseInvoiceNumber,
           saveEntity,
           createWalletMovement,
           deleteWalletMovement,
           toast,
          getAnthropicKey: () => readDeviceLocal("anthropic-api-key") || "",
          relatedOptions,
            parseRelatedValue,
            processAttachmentFile,
            openAttachment,
            processDocumentFile,
            runDocumentOcr,
            bumpNextInvoiceNumber,
            openScannerFlow: options => scannerViewUI.openScannerFlow(options)
          };
        }

      function invoiceCard(invoice){ return invoiceCardUI.renderInvoiceCard(invoice, uiRenderContext()); }
      function clientCard(client){ return clientCardUI.renderClientCard(client, uiRenderContext()); }
      function supplierCard(supplier){
        return `<article class="card">
          <div class="head"><div><h3>${esc(supplier.name)}</h3><p>${esc(supplier.nif || "Sin NIF/CIF")} · ${esc(supplier.phone || "Sin teléfono")}</p></div></div>
          <div class="meta"><span class="chip">${esc(supplier.email || "Sin email")}</span><span class="chip">${esc(supplier.address || "Sin dirección")}</span></div>
          <div class="card-actions"><button data-action="edit-supplier" data-id="${supplier.id}">Editar</button><button class="danger" data-action="delete-supplier" data-id="${supplier.id}">Eliminar</button></div>
        </article>`;
      }
      function productCard(product){ return productCardUI.renderProductCard(product, uiRenderContext()); }
      function purchaseCard(item){
        return `<article class="card">
          <div class="head"><div><h3>${esc(getProduct(item.productId)?.name || "Producto")}</h3><p>${esc(getSupplier(item.supplierId)?.name || "Proveedor")} · ${date(item.date)}</p></div><span class="chip good">${money(purchaseTotal(item))}</span></div>
          <div class="meta"><span class="chip">Cantidad: ${n(item.quantity)}</span><span class="chip">Coste: ${money(item.unitCost)}</span><span class="chip">IVA: ${n(item.iva)}%</span></div>
          <div class="card-actions"><button data-action="edit-purchase" data-id="${item.id}">Editar</button><button class="danger" data-action="delete-purchase" data-id="${item.id}">Eliminar</button></div>
        </article>`;
      }
      function expenseCard(item){
        return `<article class="card">
          <div class="head"><div><h3>${esc(item.concept || item.category || "Gasto")}</h3><p>${esc(item.category || "Sin categoría")} · ${date(item.date)}</p></div><span class="chip warn">${money(expenseTotal(item))}</span></div>
          <div class="meta"><span class="chip">Proveedor: ${esc(getSupplier(item.supplierId)?.name || "-")}</span><span class="chip">Base: ${money(item.base)}</span><span class="chip">IVA: ${n(item.iva)}%</span></div>
          <div class="card-actions"><button data-action="edit-expense" data-id="${item.id}">Editar</button><button class="danger" data-action="delete-expense" data-id="${item.id}">Eliminar</button></div>
        </article>`;
      }
      function deliveryCard(item){
        return `<article class="card">
          <div class="head"><div><h3>${esc(item.number)}</h3><p>${esc(getClient(item.clientId)?.name || "Cliente")} · ${date(item.date)}</p></div><span class="chip ${item.status === "firmado" ? "good" : item.status === "pendiente" ? "warn" : ""}">${esc(item.status)}</span></div>
          <div class="meta"><span class="chip">${(item.lines || []).length} líneas</span>${item.notes ? `<span class="chip">${esc(item.notes)}</span>` : ""}</div>
          <div class="card-actions"><button data-action="print-delivery-note" data-id="${item.id}">Imprimir</button><button data-action="edit-delivery-note" data-id="${item.id}">Editar</button><button class="danger" data-action="delete-delivery-note" data-id="${item.id}">Eliminar</button></div>
        </article>`;
      }

      function documentTypeLabel(type){ return documentsDomain.documentTypeLabel(type); }
      function relatedCollection(type){ return documentsDomain.relatedCollection(type); }
      function relatedEntity(type, id){
        const collection = relatedCollection(type);
        return collection ? state[collection].find(x => x.id === id) : null;
      }
      function relatedLabel(type, id){ return documentsDomain.relatedLabel(type, id, { relatedEntity, date }); }
      function documentCard(item){ return documentCardUI.renderDocumentCard(item, uiRenderContext()); }
      function normalizeOcrText(text){ return documentsDomain.normalizeOcrText(text); }
      function pickLargestAmount(text){ return documentsDomain.pickLargestAmount(text); }
      function detectDateFromText(text){ return documentsDomain.detectDateFromText(text); }
      function matchSupplierFromText(text){ return documentsDomain.matchSupplierFromText(text, state.suppliers); }
      function extractOcrSummary(text){ return documentsDomain.extractOcrSummary(text, state.suppliers); }
      function knownSuppliersForAi(){
        return (state.suppliers || []).map(supplier => ({
          id:supplier.id || "",
          name:supplier.name || "",
          nif:supplier.nif || ""
        }));
      }
      function mergeOcrSummary(baseSummary, aiSummary, text){
        const inferred = extractOcrSummary(text || "");
        const supplierId = aiSummary?.supplierId || inferred?.supplierId || "";
        const matchedSupplier = supplierId ? getSupplier(supplierId) : matchSupplierFromText(text || "");
        return {
          ...inferred,
          ...(baseSummary || {}),
          ...(aiSummary || {}),
          supplierId:supplierId || matchedSupplier?.id || "",
          title:aiSummary?.title || matchedSupplier?.name || inferred?.title || baseSummary?.title || "",
          date:aiSummary?.date || inferred?.date || baseSummary?.date || "",
          total:Number.isFinite(Number(aiSummary?.total)) ? Number(aiSummary.total) : (baseSummary?.total ?? inferred?.total ?? null),
          nif:aiSummary?.nif || inferred?.nif || baseSummary?.nif || "",
          supplierName:aiSummary?.supplierName || matchedSupplier?.name || ""
        };
      }
      async function enhanceDocumentOcrWithAnthropic(dataUrl, localResult){
        const anthropicKey = readDeviceLocal("anthropic-api-key") || "";
        if(!anthropicKey) return null;
        const response = await fetch("/api/anthropic-ocr", {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "x-anthropic-api-key":anthropicKey
          },
          body:JSON.stringify({
            imageDataUrl:dataUrl,
            ocrText:localResult?.text || "",
            suppliers:knownSuppliersForAi()
          })
        });
        const payload = await response.json().catch(() => ({}));
        if(!response.ok || payload?.ok === false) throw new Error(payload?.error || `anthropic-${response.status}`);
        return payload;
      }
      function groupInvoices(list){ return invoicesDomain.groupInvoices(list, monthKey, dates.formatMonthLabel, invoiceTotals); }
        function renderNav(){
          renderNavUI.renderNav(document.getElementById("tabs"), {
            activeView: ui.activeView,
            onSelect: nextView => { ui.activeView = nextView; renderAll(); },
            onOpenActionMenu: () => handleAction("open-action-sheet")
          });
        }
      function renderViews(){
        renderViewsUI.renderViews(document.getElementById("views"), uiRenderContext());
        bindViewEvents();
      }
      function renderAll(){ renderNav(); renderViews(); }


      function bindViewEvents(){
        document.querySelectorAll("[data-search]").forEach(input => {
          const evt = input.tagName === "SELECT" ? "change" : "input";
          input.addEventListener(evt, () => { ui.search[input.dataset.search] = input.value; renderAll(); });
        });
        document.querySelectorAll("#views [data-view]").forEach(node => node.addEventListener("click", () => {
          ui.activeView = node.dataset.view;
          renderAll();
        }));
        document.querySelectorAll("#views [data-dashboard-nav]").forEach(node => node.addEventListener("click", () => {
          const target = node.dataset.dashboardNav;
          if(target === "income"){
            ui.search.invoicesMonth = today().slice(0,7);
            ui.search.invoicesStatus = "";
            ui.activeView = "billing";
            renderAll();
            return;
          }
          if(target === "expenses"){
            ui.activeView = "operations";
            renderAll();
            requestAnimationFrame(() => document.getElementById("operations-expenses")?.scrollIntoView({ behavior:"smooth", block:"start" }));
            return;
          }
          if(target === "purchases"){
            ui.activeView = "operations";
            renderAll();
            requestAnimationFrame(() => document.getElementById("operations-purchases")?.scrollIntoView({ behavior:"smooth", block:"start" }));
          }
        }));
        document.querySelectorAll("#views [data-invoice-status]").forEach(node => node.addEventListener("click", e => {
          e.stopPropagation();
          ui.search.invoicesStatus = node.dataset.invoiceStatus || "";
          renderAll();
        }));
        const settingsForm = document.getElementById("settingsForm");
        if(settingsForm) settingsForm.addEventListener("submit", e => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(settingsForm).entries());
          if (data.anthropicApiKey && data.anthropicApiKey.trim()) {
            writeDeviceLocal("anthropic-api-key", data.anthropicApiKey.trim());
          }
          if (Object.prototype.hasOwnProperty.call(data, "syncToken")) {
            const syncToken = String(data.syncToken || "").trim();
            writeDeviceLocal(SYNC_TOKEN_KEY, syncToken);
            window.__SYNC_TOKEN__ = syncToken;
          }
          delete data.anthropicApiKey;
          delete data.syncToken;
          store.updateState(current => {
            current.settings = { ...current.settings, ...data, invoiceYear:n(data.invoiceYear), nextInvoiceNumber:n(data.nextInvoiceNumber) };
          }, { persist:true });
          syncState(); toast("Ajustes guardados"); renderAll();
        });
        document.querySelectorAll("[data-action]").forEach(node => node.addEventListener("click", e => {
          e.stopPropagation();
          handleAction(node.dataset.action, node.dataset.id, node.dataset.kind);
        }));
      }
      function openModal(title, sub, body, onMount, actions = []){ return modalUI.openModal(title, sub, body, onMount, actions); }
      function closeModal(){ return modalUI.closeModal(); }
      function renderLineItem(line, index, invoiceMode){ return lineEditorUI.renderLineItem(line, index, invoiceMode, formContext()); }
      function setupLineEditor(root, lines, invoiceMode, onChange){ return lineEditorUI.setupLineEditor(root, lines, invoiceMode, onChange, formContext()); }
      function collectLines(root, invoiceMode){ return lineEditorUI.collectLines(root, invoiceMode, formContext()); }

      function openClientForm(id){ return clientFormUI.openClientForm(formContext(), id); }
      function openSupplierForm(id){ return supplierFormUI.openSupplierForm(formContext(), id); }
      function openProductForm(id){ return productFormUI.openProductForm(formContext(), id); }
      function openProductStockForm(id){
        const product = getProduct(id); if(!product) return;
        const current = stock(id);
        openModal("Ajustar stock", product.name, `<form id="stockForm" class="sheet-grid">
          <div class="summary" style="grid-column:1/-1;"><div class="summary-row"><span>Stock actual calculado</span><strong>${current} ${esc(product.unit)}</strong></div><div class="summary-row"><span>Stock base manual</span><strong>${n(product.stockBase)}</strong></div></div>
          <div class="field"><label>Nuevo stock exacto</label><input name="exactStock" type="number" step="0.01" value="${current}"></div>
          <div class="field"><label>Incremento manual</label><input name="deltaStock" type="number" step="0.01" value="0"></div>
        </form>`, (body, actions) => {
          actions.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
            const data = Object.fromEntries(new FormData(body.querySelector("#stockForm")).entries());
            store.updateState(currentState => {
              const currentProduct = currentState.products.find(x => x.id === id);
              if(!currentProduct) return;
              if(btn.dataset.modalAction === "zero") currentProduct.stockBase = n(currentProduct.stockBase) - current;
              if(btn.dataset.modalAction === "apply-exact") currentProduct.stockBase = n(data.exactStock) - (current - n(currentProduct.stockBase));
              if(btn.dataset.modalAction === "apply-delta") currentProduct.stockBase = n(currentProduct.stockBase) + n(data.deltaStock);
            }, { persist:true });
            syncState(); renderAll(); closeModal(); toast("Stock actualizado");
          }));
        }, [{id:"zero",label:"Poner a cero",className:"danger"},{id:"apply-delta",label:"Aplicar incremento",className:"ghost"},{id:"apply-exact",label:"Guardar stock exacto",className:"primary"}]);
      }
      function openPurchaseForm(id){ return purchaseFormUI.openPurchaseForm(formContext(), id); }
      function openExpenseForm(id){ return expenseFormUI.openExpenseForm(formContext(), id); }
      function openWalletMovementForm(mode){ return walletFormUI.openWalletMovementForm(formContext(), mode); }
      function relatedOptions(selectedType, selectedId){
        const groups = [
          { id:"purchase", label:"Compra", items:state.purchases.map(x => ({ id:x.id, label:`${date(x.date)} · ${getProduct(x.productId)?.name || "Compra"}` })) },
          { id:"expense", label:"Gasto", items:state.expenses.map(x => ({ id:x.id, label:`${date(x.date)} · ${x.concept || x.category || "Gasto"}` })) },
          { id:"deliveryNote", label:"Albaran", items:state.deliveryNotes.map(x => ({ id:x.id, label:`${x.number}` })) },
          { id:"invoice", label:"Factura", items:state.invoices.map(x => ({ id:x.id, label:`${x.number}` })) }
        ];
        return groups.map(group => `<option value="${group.id}:${selectedType === group.id ? selectedId || "" : ""}" ${selectedType === group.id && !selectedId ? "selected" : ""}>${group.label}</option>${group.items.map(item => `<option value="${group.id}:${item.id}" ${selectedType === group.id && selectedId === item.id ? "selected" : ""}>${group.label} · ${esc(item.label)}</option>`).join("")}`).join("");
      }
      function parseRelatedValue(value){
        const [type, id] = String(value || "").split(":");
        return { relatedType:type || "", relatedId:id || "" };
      }
      function readFileAsDataUrl(file){
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      async function processAttachmentFile(file){
        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: uid("att"),
          name: file.name || "documento",
          mimeType: file.type || (String(file.name || "").toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
          size: Number(file.size || 0),
          dataUrl,
          createdAt: new Date().toISOString()
        };
      }
      function openAttachment(attachment){
        if(!attachment?.dataUrl) return toast("No hay documento adjunto");
        const opened = window.open(attachment.dataUrl, "_blank", "noopener,noreferrer");
        if(opened) return;
        const link = document.createElement("a");
        link.href = attachment.dataUrl;
        link.download = attachment.name || "documento";
        link.click();
      }
      function loadImageFromDataUrl(src){
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }
      let openCvReadyPromise = null;
      function ensureOpenCv(){
        if(window.cv?.Mat) return Promise.resolve();
        if(openCvReadyPromise) return openCvReadyPromise;
        openCvReadyPromise = new Promise((resolve, reject) => {
          const finish = () => {
            if(window.cv?.Mat){
              resolve();
              return true;
            }
            return false;
          };
          if(finish()) return;
          const existing = [...document.scripts].find(s => s.src && s.src.includes("opencv.js"));
          const watchReady = () => {
            const started = Date.now();
            const timer = setInterval(() => {
              if(finish()){
                clearInterval(timer);
                return;
              }
              if(Date.now() - started > 20000){
                clearInterval(timer);
                reject(new Error("opencv-timeout"));
              }
            }, 120);
          };
          if(existing){
            watchReady();
            return;
          }
          const script = document.createElement("script");
          script.async = true;
          script.src = "https://docs.opencv.org/4.x/opencv.js";
          script.onload = watchReady;
          script.onerror = () => reject(new Error("opencv-load"));
          document.head.appendChild(script);
        }).catch(error => {
          openCvReadyPromise = null;
          throw error;
        });
        return openCvReadyPromise;
      }
      function distanceBetween(a, b){
        return Math.hypot(a.x - b.x, a.y - b.y);
      }
      function orderQuadPoints(points){
        const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
        const byDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x));
        return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
      }
      function simpleDocumentFallback(img, mode){
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        if(mode !== "photo"){
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          for(let i = 0; i < data.length; i += 4){
            const gray = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
            const boosted = mode === "contrast"
              ? (gray > 170 ? 255 : gray < 90 ? 20 : Math.min(255, Math.max(0, (gray - 110) * 1.55 + 110)))
              : (gray > 145 ? 255 : 0);
            data[i] = boosted;
            data[i + 1] = boosted;
            data[i + 2] = boosted;
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return {
          dataUrl: canvas.toDataURL("image/jpeg", .92),
          scanMeta: { detected:false, mode, width, height }
        };
      }
      async function processDocumentFile(file, mode = "scanner"){
        const src = await readFileAsDataUrl(file);
        const img = await loadImageFromDataUrl(src);
        const fallback = () => {
          const simple = simpleDocumentFallback(img, mode);
          return {
            id: uid("img"),
            name: file.name,
            dataUrl: simple.dataUrl,
            createdAt: new Date().toISOString(),
            scanMeta: simple.scanMeta
          };
        };
        if(mode === "photo") return fallback();
        try{
          await ensureOpenCv();
          const maxSide = 1800;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const sourceCanvas = document.createElement("canvas");
          sourceCanvas.width = width;
          sourceCanvas.height = height;
          const sourceCtx = sourceCanvas.getContext("2d");
          sourceCtx.fillStyle = "#ffffff";
          sourceCtx.fillRect(0, 0, width, height);
          sourceCtx.drawImage(img, 0, 0, width, height);
          const srcMat = cv.imread(sourceCanvas);
          const gray = new cv.Mat();
          const blur = new cv.Mat();
          const edges = new cv.Mat();
          const contours = new cv.MatVector();
          const hierarchy = new cv.Mat();
          cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0);
          cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
          cv.Canny(blur, edges, 60, 180, 3, false);
          cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
          let bestPoints = null;
          let bestArea = 0;
          for(let i = 0; i < contours.size(); i += 1){
            const contour = contours.get(i);
            const peri = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * peri, true);
            const area = Math.abs(cv.contourArea(contour));
            if(approx.rows === 4 && area > bestArea && area > (width * height * 0.12)){
              const pts = [];
              for(let j = 0; j < 4; j += 1){
                pts.push({ x: approx.intPtr(j, 0)[0], y: approx.intPtr(j, 0)[1] });
              }
              bestPoints = orderQuadPoints(pts);
              bestArea = area;
            }
            contour.delete();
            approx.delete();
          }
          gray.delete();
          blur.delete();
          edges.delete();
          contours.delete();
          hierarchy.delete();
          let resultMat = srcMat.clone();
          let detected = false;
          if(bestPoints){
            detected = true;
            const [tl, tr, br, bl] = bestPoints;
            const targetWidth = Math.max(900, Math.round(Math.max(distanceBetween(br, bl), distanceBetween(tr, tl))));
            const targetHeight = Math.max(1200, Math.round(Math.max(distanceBetween(tr, br), distanceBetween(tl, bl))));
            const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
            const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, targetWidth - 1, 0, targetWidth - 1, targetHeight - 1, 0, targetHeight - 1]);
            const transform = cv.getPerspectiveTransform(srcTri, dstTri);
            const warped = new cv.Mat();
            cv.warpPerspective(srcMat, warped, transform, new cv.Size(targetWidth, targetHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
            resultMat.delete();
            resultMat = warped;
            srcTri.delete();
            dstTri.delete();
            transform.delete();
          }
          if(mode !== "photo"){
            const normalized = new cv.Mat();
            const mono = new cv.Mat();
            cv.cvtColor(resultMat, mono, cv.COLOR_RGBA2GRAY, 0);
            if(mode === "scanner"){
              cv.adaptiveThreshold(mono, normalized, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12);
            }else{
              cv.normalize(mono, normalized, 0, 255, cv.NORM_MINMAX);
            }
            resultMat.delete();
            mono.delete();
            resultMat = new cv.Mat();
            cv.cvtColor(normalized, resultMat, cv.COLOR_GRAY2RGBA, 0);
            normalized.delete();
          }
          const outputCanvas = document.createElement("canvas");
          cv.imshow(outputCanvas, resultMat);
          const output = {
            id: uid("img"),
            name: file.name,
            dataUrl: outputCanvas.toDataURL("image/jpeg", .92),
            createdAt: new Date().toISOString(),
            scanMeta: { detected, mode, width:outputCanvas.width, height:outputCanvas.height }
          };
          srcMat.delete();
          resultMat.delete();
          return output;
        }catch(error){
          console.warn("scan-fallback", error);
          return fallback();
        }
      }
      function openDocumentForm(id, options = {}){ return documentFormUI.openDocumentForm(formContext(), id, options); }
      function viewDocument(id){
        const item = state.documents.find(x => x.id === id); if(!item) return;
        openModal(item.title || documentTypeLabel(item.type), "Documento registrado en la app", `<div class="grid">
          <div class="summary"><div class="summary-row"><span>Fecha</span><strong>${date(item.date)}</strong></div><div class="summary-row"><span>Tipo</span><strong>${esc(documentTypeLabel(item.type))}</strong></div><div class="summary-row"><span>Proveedor</span><strong>${esc(getSupplier(item.supplierId)?.name || "-")}</strong></div><div class="summary-row"><span>Vinculado</span><strong>${esc(item.relatedType && item.relatedId ? relatedLabel(item.relatedType, item.relatedId) : "Sin vincular")}</strong></div></div>
          <div class="doc-grid">${(item.images || []).map(img => `<div class="doc-thumb"><img src="${img.dataUrl}" alt="${esc(item.title || "Documento")}"></div>`).join("")}</div>
          ${item.ocrSummary ? `<div class="card"><div class="meta"><span class="chip good">OCR</span>${item.ocrSummary.total != null ? `<span class="chip">Total detectado: ${money(item.ocrSummary.total)}</span>` : ""}${item.ocrSummary.date ? `<span class="chip">Fecha: ${esc(item.ocrSummary.date)}</span>` : ""}${item.ocrSummary.nif ? `<span class="chip">NIF: ${esc(item.ocrSummary.nif)}</span>` : ""}</div></div>` : ""}
          ${item.ocrText ? `<div class="card"><p style="margin:0 0 10px;color:var(--muted)">Texto OCR</p><pre style="white-space:pre-wrap;margin:0;font:inherit;color:var(--text);max-height:240px;overflow:auto">${esc(item.ocrText)}</pre></div>` : ""}
          ${item.notes ? `<div class="card"><p style="margin:0;color:var(--muted)">${esc(item.notes)}</p></div>` : ""}
        </div>`, null, [{id:"close",label:"Cerrar",className:"ghost"}]);
      }
      function openDeliveryNoteForm(id){ return deliveryNoteFormUI.openDeliveryNoteForm(formContext(), id); }
      function openInvoiceForm(id, preset = null){ return invoiceFormUI.openInvoiceForm(formContext(), id, preset); }
      function openInvoicePaymentForm(id){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        const totals = invoiceTotals(invoice);
        const suggestedDate = invoice.paidDate || today();
        openModal("Actualizar cobro", invoice.number, `<form id="invoicePaymentForm" class="sheet-grid">
          <div class="summary" style="grid-column:1/-1;">
            <div class="summary-row"><span>Total factura</span><strong>${money(totals.total)}</strong></div>
            <div class="summary-row"><span>Cobrado</span><strong>${money(totals.paid)}</strong></div>
            <div class="summary-row"><span>Pendiente</span><strong>${money(totals.pending)}</strong></div>
          </div>
          <div class="field"><label>Importe cobrado</label><input name="paidAmount" type="number" step="0.01" min="0" value="${esc(totals.pending > 0.009 ? totals.pending : totals.total)}"></div>
          <div class="field"><label>Fecha de pago</label><input name="paidDate" type="date" value="${esc(suggestedDate)}"></div>
          <div class="field"><label>Método de pago</label><input name="paymentMethod" value="${esc(invoice.paymentMethod || "")}" placeholder="Transferencia, efectivo, tarjeta..."></div>
          <div class="field" style="grid-column:1/-1;"><label>Nota</label><textarea name="paymentNote" placeholder="Observación interna opcional">${esc(invoice.paymentNote || "")}</textarea></div>
          <div class="summary" style="grid-column:1/-1;" id="invoicePaymentSummary"></div>
        </form>`, (body, actions) => {
          const form = body.querySelector("#invoicePaymentForm");
          const amountInput = form.elements.paidAmount;
          const summary = body.querySelector("#invoicePaymentSummary");
          const refresh = () => {
            const addedPaid = Math.max(n(amountInput.value), 0);
            const nextPaid = Math.min(totals.total, totals.paid + addedPaid);
            const nextPending = Math.max(totals.total - nextPaid, 0);
            const nextStatus = nextPaid >= totals.total - 0.009 ? "Pagada" : nextPaid > 0.009 ? "Pago parcial" : "Pendiente";
            summary.innerHTML = `<div class="summary-row"><span>Nuevo cobrado</span><strong>${money(nextPaid)}</strong></div><div class="summary-row"><span>Nuevo pendiente</span><strong>${money(nextPending)}</strong></div><div class="summary-row"><span>Estado resultante</span><strong>${esc(nextStatus)}</strong></div>`;
          };
          amountInput.addEventListener("input", refresh);
          refresh();
          actions.querySelectorAll("[data-modal-action]").forEach(btn => btn.addEventListener("click", () => {
            const action = btn.dataset.modalAction;
              if(action === "mark-paid"){
                store.updateState(current => {
                  const target = current.invoices.find(x => x.id === id);
                  if(!target) return;
                  target.status = "paid";
                  target.amountPaid = totals.total;
                  target.paidDate = form.elements.paidDate.value || today();
                  target.paymentMethod = form.elements.paymentMethod.value || "";
                  target.paymentNote = form.elements.paymentNote.value || "";
                }, { persist:true });
                const updatedInvoice1 = store.getState().invoices.find(x => x.id === id);
                if(updatedInvoice1) savePrimaryCollectionToSupabase("invoices", updatedInvoice1).catch(console.error);
                syncState(); renderAll(); closeModal(); toast("Factura marcada como pagada");
                return;
              }
            if(action !== "save") return;
            if(!form.reportValidity()) return;
            const addedPaid = Math.max(n(form.elements.paidAmount.value), 0);
            const nextPaid = Math.min(totals.total, totals.paid + addedPaid);
              store.updateState(current => {
                const target = current.invoices.find(x => x.id === id);
                if(!target) return;
                target.amountPaid = nextPaid;
                target.status = nextPaid >= totals.total - 0.009 ? "paid" :
                  nextPaid > 0.009 ? "partial" : "pending";
                target.paidDate = addedPaid > 0 ? (form.elements.paidDate.value || today()) : (target.paidDate || "");
                target.paymentMethod = form.elements.paymentMethod.value || "";
                target.paymentNote = form.elements.paymentNote.value || "";
              }, { persist:true });
              const updatedInvoice2 = store.getState().invoices.find(x => x.id === id);
              if(updatedInvoice2) savePrimaryCollectionToSupabase("invoices", updatedInvoice2).catch(console.error);
              syncState(); renderAll(); closeModal();
              toast(nextPaid >= totals.total - 0.009 ? "Factura pagada" : nextPaid > 0.009 ? "Pago parcial registrado" : "Cobro actualizado");
            }));
        }, [{id:"cancel",label:"Cancelar",className:"ghost"},{id:"save",label:"Registrar cobro",className:"ghost"},{id:"mark-paid",label:"Marcar como pagada",className:"primary"}]);
      }

      function buildInvoicePrint(invoice){
        const client = getClient(invoice.clientId) || {};
        const totals = invoiceTotals(invoice);
        const showDeliveryDate = invoice.templateId === "quincenal";
        const showCompact = invoice.templateId === "compacta";
          const showPaymentTerms = !!invoice.showPaymentTerms;
        const rows = invoice.lines.map(line => `<tr>${showDeliveryDate ? `<td>${esc(date(line.deliveryDate))}</td>` : ""}<td>${esc(line.description || getProduct(line.productId)?.name || "")}</td><td>${n(line.quantity)}</td>${showCompact ? "" : `<td>${money(line.price)}</td>`}<td>${n(line.iva)}%</td><td>${money(lineTotal(line))}</td></tr>`).join("");
        return `<div class="invoice-print">
          <div class="doc-head">
            <div class="issuer">
              <div class="issuer-kicker">Emisor</div>
              <h1>${esc(state.settings.companyName)}</h1>
              <p>${esc(state.settings.companyNif)}</p>
              <p>${esc(state.settings.companyAddress)}</p>
              <p>${esc(state.settings.companyPhone)} · ${esc(state.settings.companyEmail)}</p>
            </div>
            <div class="meta-block">
              <h2>Factura</h2>
              <div class="meta-number">${esc(invoice.number)}</div>
              <p>Emisión: ${esc(date(invoice.issueDate))}</p>
              <p>Periodo: ${esc(period(invoice.periodStart, invoice.periodEnd))}</p>
            </div>
          </div>
            <div class="info">
              <div class="box">
                <h3>Cliente</h3>
                <p>${esc(client.name || "")}</p>
                <p>${esc(client.taxId || "")}</p>
                <p>${esc(client.address || "")}</p>
                <p>${esc(client.phone || "")}</p>
                <p>${esc(client.email || "")}</p>
              </div>
            </div>
            <table>
            <thead>
              <tr>${showDeliveryDate ? "<th>Entrega</th>" : ""}<th>Concepto</th><th>Cantidad</th>${showCompact ? "" : "<th>Precio</th>"}<th>IVA</th><th>Total</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
            <div class="totals"><div class="total-box"><p><span>Base imponible</span><span>${money(totals.base)}</span></p><p><span>IVA</span><span>${money(totals.vat)}</span></p><p><span>Total</span><strong>${money(totals.total)}</strong></p></div></div>
          <div class="bank">
            <div>
              <h3>Transferencia bancaria</h3>
              <p>Titular: ${esc(state.settings.accountHolder)}</p>
              <p>IBAN: ${esc(state.settings.iban)}</p>
            </div>
            <div class="bank-total">
              <p>Total factura</p>
              <p>${money(totals.total)}</p>
            </div>
          </div>
          ${showPaymentTerms ? `<div class="notes-legal"><p><strong>Forma de pago:</strong> ${esc(LEGAL_PAYMENT_TEXT.payment.replace("Forma de pago: ",""))}</p><p><strong>Incumplimiento:</strong></p><p>1. ${esc(LEGAL_PAYMENT_TEXT.breach[0])}</p><p>2. ${esc(LEGAL_PAYMENT_TEXT.breach[1])}</p><p>3. ${esc(LEGAL_PAYMENT_TEXT.breach[2])}</p><p>4. ${esc(LEGAL_PAYMENT_TEXT.breach[3])}</p><p><strong>Aceptación:</strong> ${esc(LEGAL_PAYMENT_TEXT.acceptance)}</p></div>` : ""}
        </div>`;
      }
      function buildDeliveryPrint(item){
        const client = getClient(item.clientId) || {};
        return `<div class="invoice-print"><div class="top"><div><h1>Albarán</h1><p><strong>${esc(item.number)}</strong></p><p>Fecha: ${esc(date(item.date))}</p></div><div class="meta-block"><p>${esc(state.settings.companyName)}</p><p>${esc(state.settings.companyPhone)}</p></div></div><div class="info"><div class="box"><h3>Cliente</h3><p>${esc(client.name || "")}</p><p>${esc(client.address || "")}</p></div><div class="box"><h3>Estado</h3><p>${esc(item.status)}</p><p>${esc(item.notes || "")}</p></div></div><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Descripción</th></tr></thead><tbody>${item.lines.map(line => `<tr><td>${esc(getProduct(line.productId)?.name || line.description || "")}</td><td>${n(line.quantity)}</td><td>${esc(line.description || "")}</td></tr>`).join("")}</tbody></table></div>`;
      }
      function popupPrint(title, html){
        const win = window.open("", "_blank");
        if(!win) return toast("El navegador bloqueó la ventana de impresión");
        win.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#fff} ${document.querySelector("style").textContent}</style></head><body>${html}</body></html>`);
        win.document.close(); win.focus(); setTimeout(() => win.print(), 200);
      }
      function previewInvoice(id){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        openModal("Vista previa de factura", "Salida limpia sin controles internos", `<div style="background:#fff;border-radius:18px;overflow:auto">${buildInvoicePrint(invoice)}</div>`, null, [{id:"close",label:"Cerrar",className:"ghost"},{id:"print",label:"Imprimir",className:"primary"}]);
        document.querySelector('[data-modal-action="print"]').addEventListener("click", () => printInvoice(id));
      }
      function printInvoice(id){ const invoice = state.invoices.find(x => x.id === id); if(invoice) popupPrint(invoice.number, buildInvoicePrint(invoice)); }
      function printDeliveryNote(id){ const item = state.deliveryNotes.find(x => x.id === id); if(item) popupPrint(item.number, buildDeliveryPrint(item)); }
      function duplicateInvoice(id){ const source = state.invoices.find(x => x.id === id); if(!source) return; const copy = structuredClone(source); copy.id = uid("fac"); copy.number = composeInvoiceNumber(state.settings.nextInvoiceNumber); copy.issueDate = today(); copy.amountPaid = 0; openInvoiceForm(null, copy); }
      function shareInvoiceWhatsApp(id){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        const client = getClient(invoice.clientId); const totals = invoiceTotals(invoice);
        const text = encodeURIComponent(`Hola ${client?.name || ""}, te envío la factura ${invoice.number} por importe de ${money(totals.total)}. Periodo: ${period(invoice.periodStart, invoice.periodEnd)}.`);
        window.open("https://wa.me/?text=" + text, "_blank");
      }
      function shareInvoiceEmail(id){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        const client = getClient(invoice.clientId); const totals = invoiceTotals(invoice);
        const subject = encodeURIComponent("Factura " + invoice.number);
        const body = encodeURIComponent(`Hola ${client?.name || ""},\n\nAdjunto la factura ${invoice.number}.\nPeriodo: ${period(invoice.periodStart, invoice.periodEnd)}\nImporte total: ${money(totals.total)}\n\nGracias.`);
        window.location.href = `mailto:${client?.email || ""}?subject=${subject}&body=${body}`;
      }
      function exportInvoicePng(id){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        const client = getClient(invoice.clientId) || {}; const totals = invoiceTotals(invoice);
        const canvas = document.createElement("canvas"); const width = 1400; const height = Math.max(900, 520 + invoice.lines.length * 72);
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0,0,width,height); ctx.fillStyle = "#111";
        ctx.lineWidth = 3; ctx.strokeStyle = "#111"; ctx.beginPath(); ctx.moveTo(70,178); ctx.lineTo(1330,178); ctx.stroke();
        ctx.fillStyle = "#676767"; ctx.font = "700 16px Segoe UI"; ctx.fillText("EMISOR",70,64);
        ctx.fillStyle = "#111"; ctx.font = "600 28px Segoe UI"; ctx.fillText(state.settings.companyName,70,98);
        ctx.font = "22px Segoe UI"; ctx.fillText(state.settings.companyNif,70,132); ctx.fillText(state.settings.companyAddress,70,160);
        ctx.fillText(state.settings.companyPhone + " · " + state.settings.companyEmail,70,188);
        ctx.font = "700 34px Segoe UI"; ctx.fillText("FACTURA",1040,84);
        ctx.font = "700 26px Segoe UI"; ctx.fillText(invoice.number,1040,122);
        ctx.font = "22px Segoe UI"; ctx.fillText("Emisión: " + date(invoice.issueDate),1040,156); ctx.fillText("Periodo: " + period(invoice.periodStart, invoice.periodEnd),960,188);
          ctx.strokeStyle = "#d7d7d7"; ctx.lineWidth = 2; ctx.strokeRect(70,230,1260,128);
          ctx.fillStyle = "#666"; ctx.font = "700 16px Segoe UI"; ctx.fillText("CLIENTE",96,266);
          ctx.fillStyle = "#111"; ctx.font = "22px Segoe UI"; ctx.fillText(client.name || "",96,302); ctx.fillText(client.address || "",96,334);
        const y0 = 404; ctx.fillStyle = "#f2f2f2"; ctx.fillRect(70,y0,1260,52); ctx.fillStyle = "#5d5d5d"; ctx.font = "700 18px Segoe UI"; [ ["Concepto",96], ["Cantidad",640], ["Precio",820], ["IVA",980], ["Total",1150] ].forEach(([t,x]) => ctx.fillText(t,x,y0+34));
        let y = y0 + 92; ctx.font = "20px Segoe UI";
        invoice.lines.forEach(line => { ctx.fillText((line.description || getProduct(line.productId)?.name || "").slice(0,38),96,y); ctx.fillText(String(n(line.quantity)),660,y); ctx.fillText(money(line.price),820,y); ctx.fillText(n(line.iva) + "%",995,y); ctx.fillText(money(lineTotal(line)),1150,y); ctx.strokeStyle = "#ececec"; ctx.beginPath(); ctx.moveTo(70,y+26); ctx.lineTo(1330,y+26); ctx.stroke(); y += 58; });
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.strokeRect(960,y+30,370,130); ctx.font = "24px Segoe UI"; ctx.fillText("Base: " + money(totals.base),990,y+74); ctx.fillText("IVA: " + money(totals.vat),990,y+108); ctx.font = "700 30px Segoe UI"; ctx.fillText("TOTAL: " + money(totals.total),990,y+144); ctx.font = "22px Segoe UI"; ctx.fillText("Transferencia: " + state.settings.accountHolder,70,y+94); ctx.fillText("IBAN: " + state.settings.iban,70,y+132);
        canvas.toBlob(blob => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = invoice.number + ".png"; a.click(); setTimeout(() => URL.revokeObjectURL(url),1200); toast("PNG generado"); });
      }
      function exportCsv(kind){
        let rows = [];
        if(kind === "invoices"){ rows = [["Numero","Cliente","Fecha","Periodo","Plantilla","Base","IVA","Total","Cobrado","Pendiente","Estado envio","Notas internas"]]; state.invoices.forEach(i => { const t = invoiceTotals(i); rows.push([i.number, getClient(i.clientId)?.name || "", i.issueDate, period(i.periodStart, i.periodEnd), templateName(i.templateId), t.base.toFixed(2), t.vat.toFixed(2), t.total.toFixed(2), t.paid.toFixed(2), t.pending.toFixed(2), i.sendStatus || "", i.internalNote || ""]); }); }
        if(kind === "purchases"){ rows = [["Fecha","Proveedor","Producto","Cantidad","Coste unitario","IVA","Total","Notas"]]; state.purchases.forEach(i => rows.push([i.date, getSupplier(i.supplierId)?.name || "", getProduct(i.productId)?.name || "", i.quantity, i.unitCost, i.iva, purchaseTotal(i).toFixed(2), i.notes || ""])); }
        if(kind === "expenses"){ rows = [["Fecha","Proveedor","Categoria","Concepto","Base","IVA","Total","Notas"]]; state.expenses.forEach(i => rows.push([i.date, getSupplier(i.supplierId)?.name || "", i.category || "", i.concept || "", n(i.base).toFixed(2), n(i.iva), expenseTotal(i).toFixed(2), i.notes || ""])); }
        if(kind === "deliveryNotes"){ rows = [["Numero","Cliente","Fecha","Estado","Lineas","Notas"]]; state.deliveryNotes.forEach(i => rows.push([i.number, getClient(i.clientId)?.name || "", i.date, i.status, (i.lines || []).map(line => `${line.description || getProduct(line.productId)?.name || ""} x${line.quantity}`).join(" | "), i.notes || ""])); }
        if(kind === "documents"){ rows = [["Fecha","Tipo","Titulo","Proveedor","Vinculado","Numero fotos","Notas"]]; state.documents.forEach(i => rows.push([i.date, documentTypeLabel(i.type), i.title || "", getSupplier(i.supplierId)?.name || "", i.relatedType && i.relatedId ? relatedLabel(i.relatedType, i.relatedId) : "", (i.images || []).length, i.notes || ""])); }
        if(!rows.length) return toast("No hay datos para exportar");
        downloadFile(`${kind}-${today()}.csv`, rows.map(r => r.map(csvCell).join(";")).join("\n"), "text/csv;charset=utf-8");
      }
      function quarterOf(dateText){ return dates.quarterOf(dateText); }
      function quarterRange(year, quarter){ return dates.quarterRange(year, quarter); }
      function periodMatchesQuarter(dateText, year, quarter){ return dates.periodMatchesQuarter(dateText, year, quarter); }
      function fiscalQuarterSummary(year, quarter){
        return fiscalDomain.fiscalQuarterSummary(state, year, quarter, {
          periodMatchesQuarter,
          invoiceTotals,
          purchaseBase,
          purchaseTotal,
          expenseTotal,
          n
        });
      }
      function fiscalPanelHtml(){
        const now = new Date();
        const year = now.getFullYear();
        const quarter = quarterOf(today()) || 1;
        const current = fiscalQuarterSummary(year, quarter);
        const deadlineMap = { 1:"1-20 abril", 2:"1-20 julio", 3:"1-20 octubre", 4:"1-30 enero" };
        return `<div class="panel" id="fiscalPanel"><div class="panel-h"><div><h2>Fiscalidad</h2><div class="sub">Estimación interna para IVA e IRPF trimestral. Revisar siempre antes de presentar.</div></div></div><div class="panel-b"><div class="cards"><div class="card"><div class="head"><div><h3>Trimestre actual</h3><p>${current.quarter}T ${current.year} · cierre orientativo ${deadlineMap[current.quarter]}</p></div><span class="chip ${current.vatResult > 0 ? "warn" : "good"}">${money(current.vatResult)}</span></div><div class="meta"><span class="chip">Ventas base: ${money(current.salesBase)}</span><span class="chip">IVA repercutido: ${money(current.salesVat)}</span><span class="chip">IVA soportado: ${money(current.deductibleVat)}</span><span class="chip">Beneficio estimado: ${money(current.profitEstimate)}</span><span class="chip">IRPF 130 estimado: ${money(current.irpf130Estimate)}</span></div></div><div class="card"><div class="head"><div><h3>Modelos orientativos</h3><p>Resumen rápido para preparar gestoría</p></div></div><div class="summary"><div class="summary-row"><span>Modelo 303</span><strong>${current.vatResult >= 0 ? `A ingresar ${money(current.vatResult)}` : `A compensar ${money(Math.abs(current.vatResult))}`}</strong></div><div class="summary-row"><span>Modelo 130</span><strong>${money(current.irpf130Estimate)}</strong></div><div class="summary-row"><span>Modelo 390</span><strong>Resumen anual en enero</strong></div><div class="summary-row"><span>Retenciones</span><strong>111/115 solo si aplican</strong></div></div></div></div>${current.alerts.length ? `<div class="card" style="margin-top:14px"><div class="head"><div><h3>Alertas fiscales</h3><p>Cosas a revisar antes del cierre</p></div></div><div class="meta">${current.alerts.map(alert => `<span class="chip warn">${esc(alert)}</span>`).join("")}</div></div>` : ""}</div></div>`;
      }
      function exportJson(){ downloadFile(`apPatatas-backup-${today()}.json`, JSON.stringify(state, null, 2), "application/json"); }
      function importJson(){
        const input = document.createElement("input");
        input.type = "file"; input.accept = "application/json";
        input.addEventListener("change", async () => {
          const file = input.files?.[0]; if(!file) return;
          try{
            store.replaceState(migrate(JSON.parse(await file.text())));
            syncState();
            persist();
            renderAll();
            toast("Backup importado");
          }catch{ toast("No se pudo importar el JSON"); }
        });
        input.click();
      }
        function resetStorage(){
          if(!confirm("Se borraran todos los datos locales de la app. ¿Continuar?")) return;
          store.resetState();
          syncState();
          renderAll();
          toast("Datos reiniciados");
        }
        function openActionSheet(){
          openModal("Acciones rápidas", "Atajos directos para trabajar desde móvil sin navegar por pantallas intermedias", `
            <div class="action-sheet-grid">
              <button class="primary" data-action="new-invoice">Crear factura</button>
              <button data-action="new-delivery-note">Crear albarán</button>
              <button data-action="new-purchase">Registrar compra</button>
              <button data-action="new-expense">Registrar gasto</button>
              <button data-action="new-wallet-out">Salida de monedero</button>
              <button class="ghost" data-action="new-document">Nuevo documento</button>
              <button class="ghost disabled-action" data-action="new-quote">Crear presupuesto</button>
              <p class="sheet-note">Presupuestos queda señalado aquí como siguiente paso de producto, sin alterar todavía la lógica actual.</p>
            </div>
          `, body => {
            body.querySelectorAll("[data-action]").forEach(node => node.addEventListener("click", () => {
              const nextAction = node.dataset.action;
              closeModal();
              handleAction(nextAction, node.dataset.id, node.dataset.kind);
            }));
          }, [{ id:"close", label:"Cerrar", className:"ghost" }]);
        }
        function handleAction(action, id, kind){
          ({ "open-action-sheet":openActionSheet, "new-quote":() => toast("Presupuestos: siguiente fase de producto"), "new-client":() => openClientForm(), "edit-client":() => openClientForm(id), "delete-client":() => removeEntity("clients", id, "¿Eliminar este cliente?"),
            "new-supplier":() => openSupplierForm(), "edit-supplier":() => openSupplierForm(id), "delete-supplier":() => removeEntity("suppliers", id, "¿Eliminar este proveedor?"),
            "new-product":() => openProductForm(), "edit-product":() => openProductForm(id), "delete-product":() => removeEntity("products", id, "¿Eliminar este producto?"), "edit-product-stock":() => openProductStockForm(id),
            "new-purchase":() => openPurchaseForm(), "edit-purchase":() => openPurchaseForm(id), "delete-purchase":() => removeEntity("purchases", id, "¿Eliminar esta compra? El stock se recalculara automáticamente."),
          "new-expense":() => openExpenseForm(), "edit-expense":() => openExpenseForm(id), "delete-expense":() => removeEntity("expenses", id, "¿Eliminar este gasto?"),
          "new-delivery-note":() => openDeliveryNoteForm(), "edit-delivery-note":() => openDeliveryNoteForm(id), "delete-delivery-note":() => removeEntity("deliveryNotes", id, "¿Eliminar este albarán?"), "print-delivery-note":() => printDeliveryNote(id),
            "new-invoice":() => openInvoiceForm(), "edit-invoice":() => openInvoiceForm(id), "new-invoice-for-client":() => openInvoiceForm(null, { clientId:id }), "duplicate-invoice":() => duplicateInvoice(id), "delete-invoice":() => removeEntity("invoices", id, "¿Eliminar esta factura? Esto recalculara el stock."), "preview-invoice":() => previewInvoice(id), "print-invoice":() => printInvoice(id), "share-whatsapp":() => shareInvoiceWhatsApp(id), "share-email":() => shareInvoiceEmail(id), "export-invoice-png":() => exportInvoicePng(id), "update-invoice-payment":() => openInvoicePaymentForm(id),
            "export-csv":() => exportCsv(kind), "export-json":exportJson, "import-json":importJson, "reset-storage":resetStorage }[action] || (() => {}))();
        }
      function registerGlobalButtons(){ document.querySelectorAll(".quick [data-action]").forEach(btn => btn.addEventListener("click", () => handleAction(btn.dataset.action))); }
      function registerPwa(){
        window.addEventListener("beforeinstallprompt", e => {
          e.preventDefault();
          deferredPrompt = e;
          document.getElementById("installBtn").classList.add("primary");
        });
        const installBtn = document.getElementById("installBtn");
        if(installBtn && !installBtn.dataset.bound){
          installBtn.dataset.bound = "true";
          installBtn.addEventListener("click", async () => {
            if(!deferredPrompt) return toast("Instalacion disponible al abrir desde navegador compatible");
            deferredPrompt.prompt();
            deferredPrompt = null;
          });
        }
        if("serviceWorker" in navigator){
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if(refreshing) return;
            refreshing = true;
            toast("La app se ha actualizado");
            window.location.reload();
          });
          navigator.serviceWorker.register("./sw.js", { updateViaCache:"none" }).then(registration => {
            if(registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
            registration.update().catch(() => {});
            setInterval(() => registration.update().catch(() => {}), 60000);
          }).catch(console.error);
        }
      }
      const baseHandleAction = handleAction;
        handleAction = function(action, id, kind){
          if(action === "open-purchase-attachment"){
            const purchase = state.purchases.find(x => x.id === id);
            if(!purchase?.attachment) return toast("Esta compra no tiene documento adjunto");
            return openAttachment(purchase.attachment);
          }
          if(action === "open-scanner-pdf") return scannerViewUI.openScannerFlow({
            onComplete(session){
              const pages = (session?.pages || []).length;
              toast(pages ? `Escaneo listo con ${pages} pagina(s). Puedes exportar el PDF desde el escaner.` : "Escaneo finalizado");
            }
          });
          if(action === "new-scanned-ticket") return scannerViewUI.openScannerFlow({
            onComplete(session){
              documentFormUI.openDocumentForm(formContext(), null, {
                scannedSession:session,
                defaults:{ type:"ticket" }
              });
            }
          });
          if(action === "new-scanned-supplier-invoice") return scannerViewUI.openScannerFlow({
            onComplete(session){
              documentFormUI.openDocumentForm(formContext(), null, {
                scannedSession:session,
                defaults:{ type:"supplierInvoice" }
              });
            }
          });
          if(action === "new-document") return openDocumentForm(null);
          if(action === "edit-document") return openDocumentForm(id);
          if(action === "view-document") return viewDocument(id);
          if(action === "delete-document") return removeEntity("documents", id, "¿Eliminar este documento escaneado?");
          return baseHandleAction(action, id, kind);
        };
      document.title = "Factupapa";
      document.querySelector(".brand h1").textContent = "Factupapa";
      document.querySelector(".brand p").textContent = "Facturacion clara, escaneo documental y control diario del negocio";
      document.getElementById("installBtn").textContent = "App";

      store.updateState(current => {
        current.settings.driveClientId = current.settings.driveClientId || "607811965960-bokrfeloj97tel1fgbnhj0fgkm3ekrsg.apps.googleusercontent.com";
        current.settings.driveRootFolderName = current.settings.driveRootFolderName || "apPatatas";
        current.settings.driveAutoUpload = current.settings.driveAutoUpload === true || current.settings.driveAutoUpload === "true";
        current.settings.driveStateFileName = current.settings.driveStateFileName || "apPatatas-state.json";
        current.settings.driveStateAutoSync = current.settings.driveStateAutoSync === true || current.settings.driveStateAutoSync === "true";
        current.settings.backendUrl = current.settings.backendUrl || "/api/app-state";
        current.settings.backendAutoSync = current.settings.backendAutoSync === true || current.settings.backendAutoSync === "true";
        current.settings.deviceId = current.settings.deviceId || (crypto?.randomUUID ? crypto.randomUUID() : uid("device"));
      });
      syncState();
      const baseBindViewEvents = bindViewEvents;
        bindViewEvents = function(){
          baseBindViewEvents();
        document.querySelectorAll("#views [data-view]").forEach(btn => btn.addEventListener("click", () => {
          ui.activeView = btn.dataset.view;
          renderAll();
        }));
        const settingsForm = document.getElementById("settingsForm");
          if(settingsForm && !settingsForm.querySelector('[name="driveClientId"]')){
            const anchor = settingsForm.lastElementChild;
            anchor.insertAdjacentHTML("beforebegin", `<div class="field"><label>API Key Anthropic (escáner IA)</label><input name="anthropicApiKey" type="password" value="${esc(readDeviceLocal('anthropic-api-key') || '')}" placeholder="sk-ant-..."></div><div class="field"><label>Backend URL</label><input name="backendUrl" value="${esc(state.settings.backendUrl || "/api/app-state")}" placeholder="/api/app-state"></div><div class="field"><label>Sincronizacion automatica nube</label><select name="backendAutoSync"><option value="false" ${state.settings.backendAutoSync ? "" : "selected"}>No</option><option value="true" ${state.settings.backendAutoSync ? "selected" : ""}>Si</option></select></div><div class="field"><label>ID dispositivo</label><input name="deviceId" value="${esc(state.settings.deviceId || "")}"></div><div class="field"><label>Google OAuth Client ID</label><input name="driveClientId" value="${esc(state.settings.driveClientId || "")}" placeholder="Pega tu Client ID web para Drive"></div><div class="field"><label>Carpeta raiz Drive</label><input name="driveRootFolderName" value="${esc(state.settings.driveRootFolderName || "apPatatas")}"></div><div class="field"><label>PDF factura a Drive</label><select name="driveAutoUpload"><option value="false" ${state.settings.driveAutoUpload ? "" : "selected"}>No</option><option value="true" ${state.settings.driveAutoUpload ? "selected" : ""}>Si</option></select></div><div class="field"><label>Archivo datos Drive</label><input name="driveStateFileName" value="${esc(state.settings.driveStateFileName || "apPatatas-state.json")}"></div><div class="field"><label>Sincronizacion automatica datos Drive</label><select name="driveStateAutoSync"><option value="false" ${state.settings.driveStateAutoSync ? "" : "selected"}>No</option><option value="true" ${state.settings.driveStateAutoSync ? "selected" : ""}>Si</option></select></div>`);
          }
          const syncTokenField = settingsForm?.querySelector('[name="syncToken"]');
          if(syncTokenField && !syncTokenField.value) syncTokenField.value = readDeviceLocal(SYNC_TOKEN_KEY) || "";
          renderSyncStatusPanel(settingsForm);
          settingsForm?.querySelectorAll('#syncStatusPanel [data-action]').forEach(node => node.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            handleAction(node.dataset.action, node.dataset.id, node.dataset.kind);
          }));
          const exportActions = document.querySelector("#view-exports .panel .actions");
        if(exportActions && !exportActions.querySelector('[data-action="upload-state-drive"]')){
          exportActions.insertAdjacentHTML("beforeend", `<button data-action="sync-backend-push">Subir nube</button><button data-action="sync-backend-pull">Traer nube</button><button data-action="upload-state-drive">Backup Drive</button><button data-action="download-state-drive">Traer de Drive</button>`);
        }
        const exportsView = document.getElementById("view-exports");
        if(exportsView && !exportsView.querySelector("#fiscalPanel")){
          exportsView.insertAdjacentHTML("beforeend", fiscalPanelHtml());
        }
      };
      const baseSaveEntity = saveEntity;
      let driveStateSyncTimer = null;
      function queueDriveStateSync(){
        if(!(state.settings.driveStateAutoSync === true || state.settings.driveStateAutoSync === "true")) return;
        clearTimeout(driveStateSyncTimer);
        driveStateSyncTimer = setTimeout(() => uploadStateToDrive(true).catch(() => {}), 1500);
      }
      saveEntity = function(collection, entity, id){
        baseSaveEntity(collection, entity, id);
        if(collection === "invoices" && (state.settings.driveAutoUpload === true || state.settings.driveAutoUpload === "true")){
          setTimeout(() => uploadInvoiceToDrive(entity.id, true).catch(() => {}), 0);
        }
        queueDriveStateSync();
      };

      const ensureExternalScript = src => new Promise((resolve, reject) => {
        const existing = [...document.scripts].find(s => s.src === src);
        if(existing){ if(existing.dataset.loaded === "true") return resolve(); existing.addEventListener("load", () => resolve(), { once:true }); existing.addEventListener("error", reject, { once:true }); return; }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => { script.dataset.loaded = "true"; resolve(); };
        script.onerror = reject;
        document.head.appendChild(script);
      });
      async function ensurePdfStack(){
        await ensureExternalScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
        await ensureExternalScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
      }
      let tesseractReadyPromise = null;
      async function ensureTesseract(){
        if(window.Tesseract?.recognize) return;
        if(tesseractReadyPromise) return tesseractReadyPromise;
        tesseractReadyPromise = ensureExternalScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js").catch(error => {
          tesseractReadyPromise = null;
          throw error;
        });
        return tesseractReadyPromise;
      }
        async function runDocumentOcr(dataUrl){
          const localResult = await ocrService.recognizeImage(dataUrl);
          const localText = normalizeOcrText(localResult?.text || "");
          const localSummary = extractOcrSummary(localText);
          try{
            const aiResult = await enhanceDocumentOcrWithAnthropic(dataUrl, { text:localText, summary:localSummary });
            const finalText = normalizeOcrText(aiResult?.text || localText);
            const finalSummary = mergeOcrSummary(localSummary, aiResult?.summary || {}, finalText);
            return {
              text:finalText,
              summary:finalSummary,
              confidence:Math.max(localResult?.confidence || 0, 95),
              raw:{ local:localResult || null, anthropic:aiResult || null },
              provider:"anthropic+tesseract"
            };
          }catch(error){
            console.warn("anthropic-ocr-fallback", error);
            return { text:localText, summary:localSummary, confidence:localResult?.confidence || 0, raw:{ local:localResult || null, anthropicError:error?.message || String(error) }, provider:"tesseract" };
          }
        }
      async function buildInvoicePdfBlob(invoice){
        await ensurePdfStack();
        const host = document.createElement("div");
        host.style.position = "fixed";
        host.style.left = "-99999px";
        host.style.top = "0";
        host.style.width = "900px";
        host.innerHTML = buildInvoicePrint(invoice);
        document.body.appendChild(host);
        const target = host.firstElementChild;
        const canvas = await window.html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        host.remove();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        const imageData = canvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(imageData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while(heightLeft > 0){
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imageData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        return pdf.output("blob");
      }
      async function getInvoicePdfFile(id){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) throw new Error("Factura no encontrada");
        const blob = await buildInvoicePdfBlob(invoice);
        return new File([blob], `${invoice.number}.pdf`, { type: "application/pdf" });
      }
      async function downloadInvoicePdf(id){
        const file = await getInvoicePdfFile(id);
        downloadFile(file.name, file, "application/pdf");
      }
      async function shareInvoiceFile(id, channel){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        const client = getClient(invoice.clientId);
        const totals = invoiceTotals(invoice);
        const file = await getInvoicePdfFile(id);
        const shareData = { title: `Factura ${invoice.number}`, text: `Factura ${invoice.number} - ${client?.name || ""} - ${money(totals.total)}`, files: [file] };
        if(navigator.canShare && navigator.canShare({ files: [file] })){
          await navigator.share(shareData);
          return;
        }
        await downloadInvoicePdf(id);
        if(channel === "email"){
          const subject = encodeURIComponent(`Factura ${invoice.number}`);
          const body = encodeURIComponent(`He descargado la factura ${invoice.number} para adjuntarla manualmente.\nCliente: ${client?.name || ""}\nImporte: ${money(totals.total)}`);
          window.location.href = `mailto:${client?.email || ""}?subject=${subject}&body=${body}`;
        }else{
          const text = encodeURIComponent(`He descargado la factura ${invoice.number} para adjuntarla manualmente por WhatsApp.`);
          window.open("https://wa.me/?text=" + text, "_blank");
        }
        toast("Tu navegador no permite adjuntar el PDF automaticamente aqui. He descargado el archivo para adjuntarlo manualmente.");
      }
      shareInvoiceWhatsApp = id => shareInvoiceFile(id, "whatsapp").catch(() => toast("No se pudo compartir la factura"));
      shareInvoiceEmail = id => shareInvoiceFile(id, "email").catch(() => toast("No se pudo compartir la factura"));
      let driveTokenClient = null;
      let driveAccessToken = "";
      function driveLog(step, details = {}){
        console.info("[Drive]", step, details);
      }
      function buildDriveError(code, message, meta = {}){
        const error = new Error(message || code || "drive-error");
        error.code = code || "drive-error";
        Object.assign(error, meta);
        return error;
      }
      function explainDriveError(error, fallbackMessage){
        const code = error?.code || error?.type || error?.error || error?.message || "";
        if(code === "drive-client-id-missing") return "Falta el Google OAuth Client ID de Drive en Ajustes.";
        if(code === "popup_failed_to_open") return "Google no pudo abrir la autorización. En móvil, prueba en el navegador normal y permite ventanas emergentes.";
        if(code === "popup_closed" || code === "access_denied") return "La autorización de Google se canceló antes de completarse.";
        if(code === "idpiframe_initialization_failed") return "Google OAuth no pudo iniciarse. Revisa el dominio autorizado en Google Cloud Console.";
        if(code === "drive-auth-start-failed") return "No se pudo iniciar la autorización de Google Drive.";
        if(code === "drive-auth-missing-token") return "Google autorizó la sesión pero no devolvió un token válido.";
        if(code === "drive-api-401" || code === "drive-api-403") return "Google rechazó el acceso a Drive. Revisa el Client ID, el dominio autorizado y los permisos OAuth.";
        if(code === "drive-state-missing") return "No existe una copia guardada en Google Drive.";
        return fallbackMessage || "No se pudo completar la acción de Google Drive.";
      }
      function reportDriveFailure(step, error, fallbackMessage){
        driveLog(`${step}:failure`, {
          code:error?.code || error?.type || error?.error || error?.message || "unknown",
          message:error?.message || String(error),
          mobile:/Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
          standalone:window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true
        });
        toast(explainDriveError(error, fallbackMessage));
      }
      async function ensureGoogleIdentity(){
        driveLog("auth-script:start", {});
        try{
          await ensureExternalScript("https://accounts.google.com/gsi/client");
          driveLog("auth-script:ready", {});
        }catch(error){
          driveLog("auth-script:failure", { message:error?.message || String(error) });
          throw buildDriveError("drive-auth-script-failed", "No se pudo cargar Google Identity Services");
        }
      }
      async function getDriveAccessToken(interactive = true, reason = "drive-action"){
        driveLog("auth:start", {
          reason,
          interactive,
          clientIdPresent:!!state.settings.driveClientId,
          mobile:/Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
          standalone:window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true
        });
        await ensureGoogleIdentity();
        if(!state.settings.driveClientId){
          throw buildDriveError("drive-client-id-missing", "Sin Client ID");
        }
        return new Promise((resolve, reject) => {
          driveTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: state.settings.driveClientId,
            scope: "https://www.googleapis.com/auth/drive.file",
            callback: response => {
              if(response.error){
                driveLog("auth:failure", { reason, code:response.error });
                return reject(buildDriveError(response.error, response.error, { response }));
              }
              if(!response.access_token){
                driveLog("auth:failure", { reason, code:"drive-auth-missing-token" });
                return reject(buildDriveError("drive-auth-missing-token", "Google no devolvió token", { response }));
              }
              driveAccessToken = response.access_token;
              driveLog("auth:success", { reason });
              resolve(driveAccessToken);
            },
            error_callback: error => {
              driveLog("auth:failure", { reason, code:error?.type || "drive-auth-start-failed" });
              reject(buildDriveError(error?.type || "drive-auth-start-failed", error?.message || "No se pudo iniciar la autorización", { response:error }));
            }
          });
          try{
            driveTokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
          }catch(error){
            reject(buildDriveError("drive-auth-start-failed", error?.message || "No se pudo lanzar la autorización", { response:error }));
          }
        });
      }
      async function driveFetch(url, options = {}, interactive = true, reason = "drive-request"){
        const token = driveAccessToken || await getDriveAccessToken(interactive, reason);
        const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
        if(!response.ok) throw buildDriveError(`drive-api-${response.status}`, `Drive API ${response.status}`);
        return response;
      }
      async function findOrCreateDriveFolder(name, parentId = "root"){
        const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and trashed=false and name='${String(name).replaceAll("'", "\\'")}' and '${parentId}' in parents`);
        const list = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {}, true, "drive-folder-lookup");
        const data = await list.json();
        if(data.files?.length) return data.files[0].id;
        const create = await driveFetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
        }, true, "drive-folder-create");
        const created = await create.json();
        return created.id;
      }
      async function findDriveFileByName(name, parentId){
        const q = encodeURIComponent(`trashed=false and name='${String(name).replaceAll("'", "\\'")}' and '${parentId}' in parents`);
        const list = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)`, {}, true, "drive-file-lookup");
        const data = await list.json();
        return data.files?.[0] || null;
      }
      async function upsertDriveJsonFile(parentId, fileName, payload){
        const existing = await findDriveFileByName(fileName, parentId);
        const form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(existing ? { name:fileName } : { name:fileName, parents:[parentId] })], { type:"application/json" }));
        form.append("file", new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" }));
        const response = await driveFetch(existing
          ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,webViewLink`
          : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
          { method: existing ? "PATCH" : "POST", body: form },
          true,
          "drive-state-upload"
        );
        return response.json();
      }
      async function uploadStateToDrive(silent = false, authPrimed = false){
        driveLog("upload-state:start", { authPrimed, silent });
        if(!authPrimed) await getDriveAccessToken(true, "upload-state-drive");
        const rootId = await findOrCreateDriveFolder(state.settings.driveRootFolderName || "apPatatas");
        const dataId = await findOrCreateDriveFolder("Datos", rootId);
        const payload = { ...state, _meta:{ exportedAt:new Date().toISOString(), source:"apPatatas", version:1 } };
        const result = await upsertDriveJsonFile(dataId, state.settings.driveStateFileName || "apPatatas-state.json", payload);
        driveLog("upload-state:success", {});
        if(!silent) toast("Datos subidos a Google Drive");
        return result;
      }
      async function downloadStateFromDrive(authPrimed = false){
        if(!confirm("Se reemplazarán los datos locales con la copia guardada en Drive. ¿Continuar?")) return;
        driveLog("download-state:start", { authPrimed });
        if(!authPrimed) await getDriveAccessToken(true, "download-state-drive");
        const rootId = await findOrCreateDriveFolder(state.settings.driveRootFolderName || "apPatatas");
        const dataId = await findOrCreateDriveFolder("Datos", rootId);
        const remoteFile = await findDriveFileByName(state.settings.driveStateFileName || "apPatatas-state.json", dataId);
        if(!remoteFile) throw buildDriveError("drive-state-missing", "No existe copia en Drive");
        const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${remoteFile.id}?alt=media`, {}, true, "download-state-drive");
        const json = await response.json();
        store.replaceState(migrate(json));
        syncState();
        persist();
        renderAll();
        driveLog("download-state:success", {});
        toast("Datos cargados desde Google Drive");
      }
      async function uploadInvoiceToDrive(id, silent = false, authPrimed = false){
        const invoice = state.invoices.find(x => x.id === id); if(!invoice) return;
        driveLog("upload-invoice:start", { id, authPrimed, silent });
        if(!authPrimed) await getDriveAccessToken(true, "upload-invoice-drive");
        const client = getClient(invoice.clientId);
        const file = await getInvoicePdfFile(id);
        const yearFolder = String(invoice.issueDate || today()).slice(0,4);
        const monthFolder = String(invoice.issueDate || today()).slice(0,7);
        const clientFolder = (client?.name || "Sin cliente").replace(/[\\\\/:*?\"<>|]/g, "-").slice(0, 80);
        const rootId = await findOrCreateDriveFolder(state.settings.driveRootFolderName || "apPatatas");
        const invoicesId = await findOrCreateDriveFolder("Facturas", rootId);
        const yearId = await findOrCreateDriveFolder(yearFolder, invoicesId);
        const monthId = await findOrCreateDriveFolder(monthFolder, yearId);
        const clientId = await findOrCreateDriveFolder(clientFolder, monthId);
        const metadata = { name: file.name, parents: [clientId], mimeType: "application/pdf" };
        const form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", file);
        const response = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", body: form }, true, "upload-invoice-drive");
        const result = await response.json();
        driveLog("upload-invoice:success", { id });
        if(!silent) toast("Factura subida a Google Drive");
        return result;
      }
      async function beginDriveInvoiceUploadFromClick(id){
        driveLog("click", { action:"upload-invoice-drive", id });
        await getDriveAccessToken(true, "upload-invoice-drive");
        return uploadInvoiceToDrive(id, false, true);
      }
      async function beginDriveStateUploadFromClick(){
        driveLog("click", { action:"upload-state-drive" });
        await getDriveAccessToken(true, "upload-state-drive");
        return uploadStateToDrive(false, true);
      }
      async function beginDriveStateDownloadFromClick(){
        driveLog("click", { action:"download-state-drive" });
        await getDriveAccessToken(true, "download-state-drive");
        return downloadStateFromDrive(true);
      }
      const previousHandleAction = handleAction;
      handleAction = function(action, id, kind){
        if(action === "download-invoice-pdf") return downloadInvoicePdf(id).catch(() => toast("No se pudo generar el PDF"));
        if(action === "upload-invoice-drive") return beginDriveInvoiceUploadFromClick(id).catch(error => reportDriveFailure("upload-invoice", error, "No se pudo subir la factura a Google Drive"));
        if(action === "upload-state-drive") return beginDriveStateUploadFromClick().catch(error => reportDriveFailure("upload-state", error, "No se pudo subir la copia a Google Drive"));
        if(action === "download-state-drive") return beginDriveStateDownloadFromClick().catch(error => reportDriveFailure("download-state", error, "No se pudo traer la copia desde Google Drive"));
        return previousHandleAction(action, id, kind);
      };
      function syncStamp(snapshot){
        return safeSyncStamp(snapshot?._sync?.updatedAt || snapshot?.settings?.lastSavedAt || "", "state._sync.updatedAt");
      }
      function syncStampScore(value){
        return safeTime(value, 0, "syncStampScore");
      }
      function isStructurallyValidState(snapshot){
        return !!snapshot
          && typeof snapshot === "object"
          && snapshot.settings && typeof snapshot.settings === "object"
          && ["templates","clients","suppliers","products","purchases","expenses","walletMovements","deliveryNotes","invoices","documents"].every(key => Array.isArray(snapshot[key]));
      }
      function isMeaningfulState(snapshot){
        return isStructurallyValidState(snapshot)
          && ["templates","clients","suppliers","products","purchases","expenses","walletMovements","deliveryNotes","invoices","documents"].some(key => (snapshot[key] || []).length > 0);
      }
      function hasSavedLocalState(){
        return !!window.localStorage.getItem(KEY);
      }
      function requestRuntimeSyncToken(){
        const stored = readDeviceLocal(SYNC_TOKEN_KEY).trim();
        if(stored){
          window.__SYNC_TOKEN__ = stored;
          syncLog("token-load", { source:"localStorage", present:true });
          return stored;
        }
        if(getRuntimeSyncToken()) return getRuntimeSyncToken();
        syncLog("token-load", { source:"prompt", present:false });
        const provided = window.prompt("Introduce el token de sincronización para compartir datos entre dispositivos:", "");
        if(typeof provided !== "string") return "";
        const trimmed = provided.trim();
        if(!trimmed) return "";
        window.__SYNC_TOKEN__ = trimmed;
        writeDeviceLocal(SYNC_TOKEN_KEY, trimmed);
        syncLog("token-save", { source:"prompt", present:true });
        return trimmed;
      }
      function getRuntimeSyncToken(){
        return typeof window.__SYNC_TOKEN__ === "string" && window.__SYNC_TOKEN__.trim()
          ? window.__SYNC_TOKEN__.trim()
          : "";
      }
        function getSyncStatusSummary(){
          const tokenPresent = !!readDeviceLocal(SYNC_TOKEN_KEY).trim();
          const meta = readSyncMeta();
          const syncEnabled = (state.settings.backendAutoSync === true || state.settings.backendAutoSync === "true") && tokenPresent;
          const liveStatus = syncManager?.getStatus?.() || (navigator.onLine ? "synced" : "offline");
        return {
          syncEnabled,
          tokenPresent,
          liveStatus,
          localTimestamp:syncStamp(syncState()),
          remoteTimestamp:meta.lastRemoteTimestamp || "",
          lastSuccessAt:meta.lastSuccessAt || "",
          lastPullResult:meta.lastPullResult || "",
          lastPushResult:meta.lastPushResult || "",
            lastError:meta.lastError || "",
            backendUrl:state.settings.backendUrl || "/api/app-state"
          };
        }
        function describeSyncStatus(summary){
          const lastError = String(summary.lastError || "").trim();
          if(!summary.tokenPresent) return { tone:"Pendiente", detail:"Falta poner el token compartido en este dispositivo." };
          if(lastError === "backend-token-missing" || lastError === "missing_sync_token" || lastError === "backend-500") return { tone:"Servidor incompleto", detail:"En Vercel falta APP_SYNC_TOKEN o la API no esta bien configurada." };
          if(lastError === "backend-auth" || lastError === "unauthorized") return { tone:"Token incorrecto", detail:"La clave guardada aqui no coincide con la que tiene Vercel." };
          if(lastError.startsWith("backend-")) return { tone:"Error del servidor", detail:"La app llega a la nube, pero el servidor ha respondido con error." };
          if(summary.liveStatus === "offline") return { tone:"Sin internet", detail:"Este dispositivo esta ahora mismo sin conexion." };
          if(summary.lastSuccessAt) return { tone:"Conectada", detail:"La nube esta respondiendo correctamente." };
          return { tone:"Preparada", detail:"La configuracion parece correcta, pero aun no hay confirmacion de nube." };
        }
        function syncResultLabel(value, fallback = "Sin dato"){
          const text = String(value || "").trim();
          if(!text) return fallback;
          const map = {
            "omitted:sync-disabled":"Desactivada",
            "omitted:missing-token":"Falta token",
            "omitted:offline":"Sin internet",
            "omitted:already-pushed":"Ya estaba al dia",
            "omitted:in-flight":"En proceso",
            "304:not-modified":"Sin cambios",
            "bootstrap:seed-local":"Subio tus datos a la nube",
            "bootstrap:seed-local-empty-remote":"Creo la nube con tus datos",
            "200:applied":"Datos recibidos",
            "200:saved":"Datos subidos"
          };
          return map[text] || text;
        }
        function renderSyncStatusPanel(settingsForm){
          if(!settingsForm) return;
          const summary = getSyncStatusSummary();
          const diagnosis = describeSyncStatus(summary);
          let panel = settingsForm.querySelector("#syncStatusPanel");
        if(!panel){
          panel = document.createElement("div");
          panel.id = "syncStatusPanel";
          panel.className = "summary";
          const anchor = settingsForm.lastElementChild;
          if(anchor){
            anchor.insertAdjacentElement("beforebegin", panel);
          }else{
            settingsForm.appendChild(panel);
          }
        }
        panel.innerHTML = `<div class="summary-row"><span>DEBUG SYNC ACTIVO</span><strong>${summary.syncEnabled ? "Activada" : "Desactivada"}</strong></div>
          <div class="summary-row"><span>Sincronización</span><strong>${summary.syncEnabled ? "Activada" : "Desactivada"}</strong></div>
          <div class="summary-row"><span>Token</span><strong>${summary.tokenPresent ? "Presente" : "Ausente"}</strong></div>
          <div class="summary-row"><span>Estado</span><strong>${esc(summary.liveStatus)}</strong></div>
          <div class="summary-row"><span>Timestamp local</span><strong>${safeSyncLabel(summary.localTimestamp)}</strong></div>
          <div class="summary-row"><span>Timestamp remoto</span><strong>${safeSyncLabel(summary.remoteTimestamp)}</strong></div>
          <div class="summary-row"><span>Último pull</span><strong>${esc(summary.lastPullResult || "Sin dato")}</strong></div>
          <div class="summary-row"><span>Último push</span><strong>${esc(summary.lastPushResult || "Sin dato")}</strong></div>
          <div class="summary-row"><span>Último error</span><strong>${esc(summary.lastError || "Ninguno")}</strong></div>
          <div class="summary-row"><span>Backend URL</span><strong>${esc(summary.backendUrl)}</strong></div>
          <div class="summary-row"><span>Última sync correcta</span><strong>${summary.lastSuccessAt ? safeSyncLabel(summary.lastSuccessAt) : "desconocida"}</strong></div>
          <div class="card-actions"><button type="button" data-action="sync-debug-force">Forzar sync ahora</button><button type="button" data-action="sync-debug-clear-cache">Limpiar caché local de sync</button></div>`;
      }
      async function backendRequest(method = "GET", body = null, headers = {}){
        const runtimeToken = getRuntimeSyncToken();
        const backendUrl = state.settings.backendUrl || "/api/app-state";
        const syncHeaders = {
          ...(body ? { "Content-Type":"application/json" } : {}),
          "x-sync-token": runtimeToken,
          ...headers
        };
        syncLog("auth-debug-request", {
          url:backendUrl,
          method,
          tokenPresent:!!runtimeToken,
          tokenLength:runtimeToken ? runtimeToken.length : 0,
          headerAttached:Object.prototype.hasOwnProperty.call(syncHeaders, "x-sync-token"),
          headerLength:typeof syncHeaders["x-sync-token"] === "string" ? syncHeaders["x-sync-token"].length : 0
        });
        if(!runtimeToken) throw new Error("backend-token-missing");
        syncLog(`${method}-start`, { url:backendUrl, tokenPresent:true });
        const response = await fetch(backendUrl, {
          method,
          headers: syncHeaders,
          body: body ? JSON.stringify(body) : null,
          cache: "no-store"
        });
        syncLog(`${method}-result`, { url:backendUrl, status:response.status });
        if(response.status === 401) throw new Error("backend-auth");
        if(!response.ok && response.status !== 304) throw new Error(`backend-${response.status}`);
        return response;
      }
      syncManager = (() => {
        const meta = readSyncMeta();
        const runtime = {
          status:navigator.onLine ? "synced" : "offline",
          inFlight:false,
          bootstrapped:false,
          pendingPush:false,
          debounceTimer:null,
          pollTimer:null,
          localStampAtLastPush:"",
          lastRemoteEtag:"",
          lastSuccessAt:meta.lastSuccessAt || ""
        };

        function setStatus(nextStatus){
          runtime.status = nextStatus;
          const settingsForm = document.getElementById("settingsForm");
          if(settingsForm) renderSyncStatusPanel(settingsForm);
        }

        function markSyncSuccess(){
          runtime.lastSuccessAt = safeIso(undefined, "");
          mergeSyncMeta({ lastSuccessAt:runtime.lastSuccessAt });
          const settingsForm = document.getElementById("settingsForm");
          if(settingsForm) renderSyncStatusPanel(settingsForm);
        }
        function rememberRemoteTimestamp(value){
          if(!value) return;
          mergeSyncMeta({ lastRemoteTimestamp:value });
        }
        function rememberOutcome(kind, value){
          mergeSyncMeta({ [kind]:value });
        }
        function rememberError(message){
          mergeSyncMeta({ lastError:message || "" });
        }

          async function applyRemoteState(nextState){
            if(!isStructurallyValidState(nextState)) return false;
            syncLog("remote-apply", { remoteTimestamp:syncStamp(nextState) });
            suppressSyncPersistence = true;
            try{
              if(supabaseHydrated){
                const preserved = {
                  clients:state.clients,
                  products:state.products,
                  invoices:state.invoices,
                  expenses:state.expenses,
                  purchases:state.purchases,
                  walletMovements:state.walletMovements,
                  suppliers:state.suppliers
                };
                store.replaceState({ ...nextState, ...preserved });
              }else{
                store.replaceState(nextState);
              }
              syncState();
              store.persist();
              syncState();
          } finally {
            suppressSyncPersistence = false;
          }
          renderAll();
          return true;
        }

        async function requestRemote(method = "GET", body = null){
          const headers = runtime.lastRemoteEtag && method === "GET" ? { "If-None-Match":runtime.lastRemoteEtag } : {};
          syncLog("request-remote", { method, hasEtag:!!headers["If-None-Match"] });
          const response = await backendRequest(method, body, headers);
          const etag = response.headers.get("etag");
          if(etag) runtime.lastRemoteEtag = etag;
          return response;
        }

        async function pushCurrentState(silent = true, force = false){
          const snapshot = syncState();
          mergeSyncMeta({ lastLocalTimestamp:syncStamp(snapshot) });
          syncLog("push-start", { localTimestamp:syncStamp(snapshot), force, silent });
          if(runtime.inFlight){
            runtime.pendingPush = true;
            rememberOutcome("lastPushResult", "omitted:in-flight");
            return false;
          }
          if(!(state.settings.backendAutoSync === true || state.settings.backendAutoSync === "true")){
            rememberOutcome("lastPushResult", "omitted:sync-disabled");
            return false;
          }
          if(!getRuntimeSyncToken()){
            rememberOutcome("lastPushResult", "omitted:missing-token");
            return false;
          }
          if(!navigator.onLine){
            setStatus("offline");
            rememberOutcome("lastPushResult", "omitted:offline");
            return false;
          }
          if(!isMeaningfulState(snapshot) || !isStructurallyValidState(snapshot)){
            rememberOutcome("lastPushResult", "omitted:invalid-local");
            return false;
          }
          if(!force && syncStamp(snapshot) && syncStamp(snapshot) === runtime.localStampAtLastPush){
            rememberOutcome("lastPushResult", "omitted:already-pushed");
            return false;
          }

          runtime.inFlight = true;
          setStatus("syncing");
          try{
            const response = await requestRemote("PUT", {
              state:snapshot,
              updatedAt:syncStamp(snapshot),
              deviceId:snapshot.settings?.deviceId || "unknown",
              appVersion:APP_VERSION
            });
            const payload = await response.json();
            if(payload?.ignored && payload?.state){
              const remote = migrate(payload.state);
              syncLog("push-result", { status:"ignored", reason:payload?.reason || "remote_newer", remoteTimestamp:syncStamp(remote) });
              rememberOutcome("lastPushResult", `ignorado:${payload?.reason || "remote_newer"}`);
              rememberRemoteTimestamp(syncStamp(remote));
              if(isMeaningfulState(remote) && syncStampScore(syncStamp(remote)) >= syncStampScore(syncStamp(snapshot))){
                await applyRemoteState(remote);
                runtime.localStampAtLastPush = syncStamp(remote);
              }
            }else{
              runtime.localStampAtLastPush = payload?.meta?.updatedAt || payload?.savedAt || syncStamp(snapshot);
              syncLog("push-result", { status:"saved", savedAt:runtime.localStampAtLastPush });
              rememberOutcome("lastPushResult", `guardado:${runtime.localStampAtLastPush || "ok"}`);
              rememberRemoteTimestamp(payload?.meta?.updatedAt || payload?.savedAt || "");
            }
            rememberError("");
            markSyncSuccess();
            setStatus("synced");
            if(!silent) toast("Datos sincronizados");
            return true;
          }catch(error){
            console.warn("shared-sync-push", error);
            syncLog("push-error", { message:error?.message || String(error) });
            rememberOutcome("lastPushResult", "error");
            rememberError(error?.message || String(error));
            setStatus(navigator.onLine ? "error" : "offline");
            if(!silent) toast("No se pudo sincronizar con la nube");
            return false;
          }finally{
            runtime.inFlight = false;
            if(runtime.pendingPush){
              runtime.pendingPush = false;
              queuePush();
            }
          }
        }

        async function pullRemoteState(silent = true){
          syncLog("pull-start", { silent });
          if(runtime.inFlight) return false;
          if(!getRuntimeSyncToken()){
            rememberOutcome("lastPullResult", "omitted:missing-token");
            return false;
          }
          if(!navigator.onLine){
            setStatus("offline");
            rememberOutcome("lastPullResult", "omitted:offline");
            return false;
          }
          runtime.inFlight = true;
          setStatus("syncing");
          try{
            const response = await requestRemote("GET");
            if(response.status === 304){
              syncLog("pull-result", { status:"not-modified" });
              rememberOutcome("lastPullResult", "304:not-modified");
              rememberError("");
              markSyncSuccess();
              setStatus("synced");
              return false;
            }
            const payload = await response.json();
            if(!payload?.state){
              syncLog("pull-result", { status:"empty-remote" });
              rememberOutcome("lastPullResult", "vacío");
              rememberError("");
              markSyncSuccess();
              setStatus("synced");
              return false;
            }
            const remote = migrate(payload.state);
            rememberRemoteTimestamp(syncStamp(remote));
            if(!isMeaningfulState(remote)){
              syncLog("pull-result", { status:"invalid-remote" });
              rememberOutcome("lastPullResult", "remoto-no-válido");
              setStatus("synced");
              return false;
            }
            const local = syncState();
            const remoteStamp = syncStamp(remote);
            const localStamp = syncStamp(local);
            const remoteScore = syncStampScore(syncStamp(remote));
            const localScore = syncStampScore(syncStamp(local));
            if(remoteScore === 0 && localScore === 0){
              syncLog("pull-result", { status:"invalid-both-timestamps", remoteTimestamp:remoteStamp, localTimestamp:localStamp });
              rememberOutcome("lastPullResult", "error:timestamps-inválidos");
              rememberError("Timestamps de sync inválidos en local y remoto");
              setStatus("error");
              return false;
            }
            if(remoteScore > localScore || !hasSavedLocalState()){
              syncLog("pull-result", { status:"applied", remoteTimestamp:syncStamp(remote), localTimestamp:syncStamp(local) });
              rememberOutcome("lastPullResult", "aplicado");
              rememberError("");
              await applyRemoteState(remote);
              runtime.localStampAtLastPush = syncStamp(remote);
              if(!silent) toast("Datos actualizados desde la nube");
              markSyncSuccess();
              setStatus("synced");
              return true;
            }
            syncLog("pull-result", { status:"skipped-local-newer", remoteTimestamp:syncStamp(remote), localTimestamp:syncStamp(local) });
            rememberOutcome("lastPullResult", "ignorado:local-más-nuevo");
            rememberError("");
            markSyncSuccess();
            setStatus("synced");
            return false;
          }catch(error){
            console.warn("shared-sync-pull", error);
            syncLog("pull-error", { message:error?.message || String(error) });
            rememberOutcome("lastPullResult", "error");
            rememberError(error?.message || String(error));
            setStatus(navigator.onLine ? "error" : "offline");
            if(!silent) toast("No se pudo traer la copia compartida");
            return false;
          }finally{
            runtime.inFlight = false;
          }
        }

        async function bootstrap(){
          if(runtime.bootstrapped) return;
          runtime.bootstrapped = true;
          const local = syncState();
          mergeSyncMeta({ lastLocalTimestamp:syncStamp(local) });
          syncLog("bootstrap-start", {
            localTimestamp:syncStamp(local),
            tokenPresent:!!getRuntimeSyncToken(),
            backendUrl:state.settings.backendUrl || "/api/app-state"
          });
          if(!getRuntimeSyncToken()) return;
          if(!navigator.onLine){
            setStatus("offline");
            return;
          }
          try{
            setStatus("syncing");
            const response = await requestRemote("GET");
            if(response.status === 304){
              syncLog("bootstrap-result", { status:"304:not-modified" });
              rememberOutcome("lastPullResult", "304:not-modified");
              rememberError("");
              markSyncSuccess();
              setStatus("synced");
              return;
            }
            const payload = await response.json();
            const remote = payload?.state ? migrate(payload.state) : null;
            const localValid = isMeaningfulState(local);
            const remoteValid = isMeaningfulState(remote);
            const localStamp = syncStamp(local);
            const remoteStamp = syncStamp(remote);
            const localScore = syncStampScore(localStamp);
            const remoteScore = syncStampScore(remoteStamp);
            rememberRemoteTimestamp(remoteStamp);

            if(remoteValid){
              if(remoteScore === 0 && localScore === 0){
                syncLog("bootstrap-result", { status:"invalid-both-timestamps", remoteTimestamp:remoteStamp, localTimestamp:localStamp });
                rememberOutcome("lastPullResult", "bootstrap:error-timestamps-inválidos");
                rememberError("Timestamps de sync inválidos en local y remoto");
                setStatus("error");
                return;
              }
              if(remoteScore >= localScore || !hasSavedLocalState()){
                syncLog("bootstrap-result", { status:"remote-applied", remoteTimestamp:syncStamp(remote), localTimestamp:syncStamp(local) });
                rememberOutcome("lastPullResult", "bootstrap:remoto-aplicado");
                rememberError("");
                await applyRemoteState(remote);
                runtime.localStampAtLastPush = syncStamp(remote);
              }else if(localValid){
                syncLog("bootstrap-result", { status:"seed-local-to-remote", localTimestamp:syncStamp(local), remoteTimestamp:syncStamp(remote) });
                rememberOutcome("lastPushResult", "bootstrap:seed-local");
                await pushCurrentState(true, true);
              }
              markSyncSuccess();
              setStatus("synced");
              return;
            }

            if(localValid){
              syncLog("bootstrap-result", { status:"seed-local-to-empty-remote", localTimestamp:syncStamp(local) });
              rememberOutcome("lastPushResult", "bootstrap:seed-local-empty-remote");
              await pushCurrentState(true, true);
            }
            rememberError("");
            markSyncSuccess();
            setStatus("synced");
          }catch(error){
            console.warn("shared-sync-bootstrap", error);
            syncLog("bootstrap-error", { message:error?.message || String(error) });
            rememberError(error?.message || String(error));
            setStatus(navigator.onLine ? "error" : "offline");
          }
        }

        function queuePush(){
          if(!(state.settings.backendAutoSync === true || state.settings.backendAutoSync === "true")) return;
          clearTimeout(runtime.debounceTimer);
          runtime.debounceTimer = setTimeout(() => pushCurrentState(true).catch(() => {}), 900);
        }

        function onLocalPersist(snapshot){
          if(!isMeaningfulState(snapshot) || !isStructurallyValidState(snapshot)) return;
          queuePush();
        }

        async function forceNow(){
          syncLog("force-sync", { step:"start" });
          const pulled = await pullRemoteState(false);
          const pushed = await pushCurrentState(false, true);
          const summary = getSyncStatusSummary();
          syncLog("force-sync", {
            step:"done",
            pulled,
            pushed,
            lastPullResult:summary.lastPullResult,
            lastPushResult:summary.lastPushResult,
            lastError:summary.lastError
          });
          return summary;
        }

        function clearLocalSyncCache(){
          writeDeviceLocal(SYNC_TOKEN_KEY, "");
          writeDeviceLocal(SYNC_META_KEY, "");
          window.__SYNC_TOKEN__ = "";
          syncLog("clear-sync-cache", { cleared:true });
          const settingsForm = document.getElementById("settingsForm");
          if(settingsForm) renderSyncStatusPanel(settingsForm);
        }

        function startAutoSync(){
          const refreshFromCloud = () => pullRemoteState(true).catch(() => {});
          document.addEventListener("visibilitychange", () => {
            if(document.visibilityState === "visible"){
              refreshFromCloud();
            }
          });
          window.addEventListener("focus", refreshFromCloud);
          window.addEventListener("pageshow", refreshFromCloud);
          window.addEventListener("online", () => {
            setStatus("syncing");
            refreshFromCloud().finally(() => queuePush());
          });
          if(runtime.pollTimer) clearInterval(runtime.pollTimer);
          runtime.pollTimer = setInterval(() => {
            if(document.visibilityState === "visible"){
              refreshFromCloud();
            }
          }, 12000);
          setTimeout(refreshFromCloud, 1200);
        }

        return {
          onLocalPersist,
          bootstrap,
          startAutoSync,
          pushNow:silent => pushCurrentState(!!silent, true),
          pullNow:silent => pullRemoteState(!!silent),
          forceNow,
          clearLocalSyncCache,
          getStatus:() => runtime.status,
          getLastSuccessAt:() => runtime.lastSuccessAt
        };
      })();
      const previousSaveEntityWithDrive = saveEntity;
      saveEntity = function(collection, entity, id){
        previousSaveEntityWithDrive(collection, entity, id);
      };
      const previousHandleActionWithDrive = handleAction;
      handleAction = function(action, id, kind){
        if(action === "new-wallet-in") return openWalletMovementForm("in");
        if(action === "new-wallet-out") return openWalletMovementForm("out");
        if(action === "new-wallet-adjust") return openWalletMovementForm("adjust");
        if(action === "delete-wallet-movement") return deleteWalletMovement(id);
        if(action === "sync-backend-push") return syncManager.pushNow(false).catch(() => toast("No se pudo subir a la nube"));
        if(action === "sync-backend-pull") return syncManager.pullNow(false).catch(() => toast("No se pudo traer la copia de la nube"));
        if(action === "sync-debug-force") return syncManager.forceNow().then(summary => {
          renderAll();
          if(summary?.lastError){
            toast(`Sync forzada con error: ${summary.lastError}`);
            return;
          }
          toast(`Sync forzada OK · Pull: ${summary?.lastPullResult || "ok"} · Push: ${summary?.lastPushResult || "ok"}`);
        }).catch(error => {
          console.error("[SharedSync] force-sync-error", error);
          toast(`La sync forzada falló: ${error?.message || "error desconocido"}`);
        });
        if(action === "sync-debug-clear-cache") return (() => { syncManager.clearLocalSyncCache(); renderAll(); toast("Caché local de sync limpiada"); })();
        return previousHandleActionWithDrive(action, id, kind);
      };
      store.updateState(current => {
        current.products = current.products.map(product => ({ ...product, stockGroup:product.stockGroup || inferStockGroup(product) || "" }));
      });
      syncState();
      modalUI.bindModalChrome();
      showDataNotice("Cargando datos principales desde Supabase...", "ok");
      try{
        await getSupabaseClient();
      }catch(error){
        console.error("[supabase] No se pudo inicializar el cliente", error);
        showDataNotice("No se pudo cargar configuración de Supabase. Se usará la copia local temporal.", "warn");
      }
      requestRuntimeSyncToken();
      try{
        await syncManager.bootstrap();
      }finally{
        await hydratePrimaryEntitiesFromSupabase();
        ensureMonthlyRecurringExpenses();
        syncManager.startAutoSync();
      }
      renderAll();
      registerGlobalButtons();
      registerPwa();
    })();
