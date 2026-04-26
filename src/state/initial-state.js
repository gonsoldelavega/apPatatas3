(function(global){
  function createDefaultState(){
    const year = new Date().getFullYear();
    return {
      version:1,
      settings:{
        invoicePrefix:"FAC",
        invoiceYear:year,
        nextInvoiceNumber:90,
        iban:"ES84 0182 5764 5102 0167 4970",
        accountHolder:"Irene",
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
      invoices:[
        {
          number:"INV76",
          issueDate:"2026-04-01",
          dueDate:"2026-05-01",
          customerName:"Lina Marcela Restrepo Torres",
          customerNif:"70837137N",
          subtotal:38.25,
          taxRate:4,
          taxAmount:1.53,
          total:39.78,
          status:"paid",
          paidDate:"2026-04-02",
          items:[
            { name:"Patata agria entera / Patata en sacos 15kg", quantity:45, unit:"kg", unitPrice:0.85, amount:38.25 }
          ]
        },
        {
          number:"INV78",
          issueDate:"2026-04-03",
          dueDate:"2026-05-03",
          customerName:"INVERSIONES ROYAL FOOD S.L.U.",
          customerNif:"B10815447",
          subtotal:83.38,
          taxRate:4,
          taxAmount:3.34,
          total:86.72,
          status:"paid",
          paidDate:"2026-04-04",
          items:[
            { name:"Agria pelada", quantity:72.5, unit:"kg", unitPrice:1.15, amount:83.38 }
          ]
        },
        {
          number:"INV79",
          issueDate:"2026-04-04",
          dueDate:"2026-05-04",
          customerName:"INVERSIONES ROYAL FOOD S.L.U.",
          customerNif:"B10815447",
          subtotal:129.88,
          taxRate:4,
          taxAmount:5.20,
          total:135.08,
          status:"paid",
          paidDate:"2026-04-08",
          items:[
            { name:"Agria pelada", quantity:102.5, unit:"kg", unitPrice:1.15, amount:117.88 },
            { name:"Ajo pelado 1kg", quantity:2, unit:"kg", unitPrice:6.00, amount:12.00 }
          ]
        },
        {
          number:"INV80",
          issueDate:"2026-04-06",
          dueDate:"2026-05-06",
          customerName:"Lina Marcela Restrepo Torres",
          customerNif:"70837137N",
          subtotal:38.25,
          taxRate:4,
          taxAmount:1.53,
          total:39.78,
          status:"pending",
          paidDate:null,
          items:[
            { name:"Patata agria entera / Patata en sacos 15kg", quantity:45, unit:"kg", unitPrice:0.85, amount:38.25 }
          ]
        },
        {
          number:"INV81",
          issueDate:"2026-04-10",
          dueDate:"2026-05-10",
          customerName:"Restauración JUMAI S.L",
          customerNif:"B-04757613",
          subtotal:26.00,
          taxRate:4,
          taxAmount:1.04,
          total:27.04,
          status:"paid",
          paidDate:"2026-04-10",
          items:[
            { name:"Agria la piedra", quantity:20, unit:"kg", unitPrice:1.30, amount:26.00 }
          ]
        },
        {
          number:"INV82",
          issueDate:"2026-04-11",
          dueDate:"2026-05-11",
          customerName:"INVERSIONES ROYAL FOOD S.L.U.",
          customerNif:"B10815447",
          subtotal:254.00,
          taxRate:4,
          taxAmount:10.16,
          total:264.16,
          status:"pending",
          paidDate:null,
          items:[
            { name:"Agria pelada", quantity:200, unit:"kg", unitPrice:1.15, amount:230.00 },
            { name:"Ajo pelado 1kg", quantity:4, unit:"kg", unitPrice:6.00, amount:24.00 }
          ]
        }
      ]
    };
  }

  global.AppInitialState = {
    STORAGE_KEY:"soler-operativa-v1",
    createDefaultState,
    getSeedData
  };
})(window);
