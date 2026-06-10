(function(global){
  function createDefaultState(){
    const year = new Date().getFullYear();
    return {
      version:1,
      settings:{
        invoicePrefix:"FAC",
        invoiceYear:year,
        nextInvoiceNumber:94,
        iban:"ES84 0182 5764 5102 0167 4970",
        accountHolder:"Irene González Cabrera",
        companyName:"Irene González Cabrera",
        companyNif:"45313973V",
        companyAddress:"Calle Luis Cañadas nº33, 04720 Aguadulce, Almería",
        companyPhone:"635516054",
        companyEmail:"gonsoldelavega@gmail.com",
        driveClientId:"607811965960-bokrfeloj97tel1fgbnhj0fgkm3ekrsg.apps.googleusercontent.com",
        driveRootFolderName:"apPatatas",
        driveAutoUpload:false,
        driveStateFileName:"apPatatas-state.json",
        driveStateAutoSync:false,
        purchaseRegistryAutoSync:true,
        purchaseRegistrySpreadsheetId:"1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU",
        purchaseRegistrySheetName:"REGISTRO",
        backendUrl:"",
        backendAutoSync:false,
        deviceId:"",
        lastSavedAt:""
      },
      templates:[
        {id:"base",name:"Base clara"},
        {id:"compacta",name:"Compacta"},
        {id:"quincenal",name:"Quincenal detallada"},
        {id:"resumen",name:"Resumen elegante"}
      ],
      clients:[],
      suppliers:[],
      products:[],
      purchases:[],
      expenses:[],
      walletMovements:[],
      deliveryNotes:[],
      invoices:[],
      documents:[],
      _deleted:{},
      _sync:{
        updatedAt:"",
        version:1
      }
    };
  }

  function getSeedData(){
    return {
      clients:[
        { name:"Cliente genérico - regulación", phone:"", email:"", address:"Sin dirección", taxId:"00000000X", contactPerson:"", shippingAddress:"", debtManual:0, notes:"", templateId:"base", paymentTermsDefault:false },
        { name:"Galan's Grills SL", phone:"+34 641 89 66 99", email:"", address:"Calle Santiago de Compostela nave 4", taxId:"B04893178", contactPerson:"", shippingAddress:"", debtManual:1207.15, notes:"", templateId:"base", paymentTermsDefault:true },
        { name:"INVERSIONES ROYAL FOOD S.L.U.", phone:"617134602", email:"", address:"CALLE SANTO DOMINGO NR 9 BAJO B. ROQUETAS DE MAR", taxId:"B10815447", contactPerson:"", shippingAddress:"", debtManual:0, notes:"", templateId:"base", paymentTermsDefault:false },
        { name:"Lina Marcela Restrepo Torres", phone:"+34603375281", email:"", address:"Calle Isla De Mallorca 7, Aguadulce, Almería.", taxId:"70837137N", contactPerson:"Lina A Tú Vera Cliente", shippingAddress:"Lina A Tú Vera Cliente +34603375281", debtManual:26.52, notes:"", templateId:"base", paymentTermsDefault:false },
        { name:"Restauración JUMAI S.L", phone:"950176681", email:"", address:"Paseo De Los Robles 29, Aguadulce", taxId:"B-04757613", contactPerson:"", shippingAddress:"", debtManual:0, notes:"", templateId:"base", paymentTermsDefault:false }
      ],
      suppliers:[],
      products:[
        { name:"Agria la piedra", category:"Patatas", price:1.3, cost:0.55, unit:"Kg", observations:"", stockBase:22.5, stockMin:30, iva:4 },
        { name:"Patata Roja", category:"Patatas", price:0.85, cost:0.45, unit:"Kg", observations:"Saco 10kg", stockBase:-5, stockMin:50, iva:4 },
        { name:"Patata agria entera", category:"Patatas", price:0.85, cost:0.55, unit:"Kg", observations:"Patata en sacos 15kg", stockBase:35, stockMin:30, iva:4 },
        { name:"Patata cocer", category:"Patatas", price:0.8, cost:0.4, unit:"Kg", observations:"Malla 4kg", stockBase:0, stockMin:5, iva:4 },
        { name:"Ajo pelado 1kg", category:"Otros", price:6, cost:4.7, unit:"Kg", observations:"", stockBase:-3, stockMin:3, iva:4 },
        { name:"Agria pelada", category:"Patatas", price:1.15, cost:0.55, unit:"Kg", observations:"", stockBase:-2015.5, stockMin:0, iva:4 },
        { name:"Cebolla pelada", category:"Cebollas", price:1.2, cost:0.55, unit:"Kg", observations:"", stockBase:26.8, stockMin:0, iva:4 },
        { name:"Cebolla grande", category:"Cebollas", price:0.9, cost:0.55, unit:"Kg", observations:"Saco 15kg", stockBase:45, stockMin:0, iva:4 },
        { name:"Pimiento Italiano verde", category:"Verduras", price:2.5, cost:2.4, unit:"Kg", observations:"", stockBase:-20.8, stockMin:0, iva:4 },
        { name:"Pimiento Italiano rojo", category:"Verduras", price:3.6, cost:3.5, unit:"Kg", observations:"", stockBase:-21.38, stockMin:0, iva:4 },
        { name:"Lechuga romana 2u", category:"Verduras", price:1.85, cost:1.6, unit:"Kg", observations:"", stockBase:-28, stockMin:0, iva:4 },
        { name:"Tomate pera", category:"Verduras", price:1.9, cost:1.3, unit:"Kg", observations:"", stockBase:-35.89, stockMin:0, iva:4 },
        { name:"Tomate cherry", category:"Verduras", price:2.8, cost:2.6, unit:"Kg", observations:"", stockBase:-12, stockMin:0, iva:4 },
        { name:"Huevos 12u", category:"Verduras", price:3.5, cost:2.9, unit:"Kg", observations:"", stockBase:2, stockMin:0, iva:4 },
        { name:"Zanahoria", category:"Verduras", price:0.95, cost:0.65, unit:"Kg", observations:"", stockBase:-10, stockMin:0, iva:4 },
        { name:"Calabacín", category:"Verduras", price:1.6, cost:1.4, unit:"Kg", observations:"", stockBase:0.8, stockMin:0, iva:4 },
        { name:"Berenjena", category:"Verduras", price:2.15, cost:1.9, unit:"Kg", observations:"", stockBase:4.26, stockMin:0, iva:4 }
      ],
      invoices:[]
    };
  }

  global.AppInitialState = {
    STORAGE_KEY:"soler-operativa-v1",
    createDefaultState,
    getSeedData
  };
})(window);
