const state = { view: 'home', salesFilter: 'Todas' };
const view = document.querySelector('#view');
const title = document.querySelector('#sectionTitle');
const eyebrow = document.querySelector('#sectionEyebrow');
const sheet = document.querySelector('#sheet');
const backdrop = document.querySelector('#sheetBackdrop');
const toast = document.querySelector('#toast');

const invoices = [
  {client:'Bar Restaurante Ejemplo',code:'FAC-104',period:'1–15 julio',amount:'416,00 €',status:'Vencida',cls:'red'},
  {client:'Pollería Pepe',code:'FAC-103',period:'1–15 julio',amount:'250,00 €',status:'Pendiente',cls:'amber'},
  {client:'Supermercado Hola',code:'FAC-102',period:'1–15 julio',amount:'620,00 €',status:'Pagada',cls:'green'},
  {client:'Carnicería Luis',code:'FAC-101',period:'16–30 junio',amount:'320,00 €',status:'Parcial',cls:'blue'}
];

function home(){return `
  <section class="greeting"><h2>Buenas tardes, Nando 👋</h2><p>El negocio está actualizado.</p></section>
  <section class="hero"><div class="hero-label">RESULTADO DEL MES</div><div class="hero-value">+1.284,70 €</div><div class="hero-grid">
    <div class="metric"><small>Facturado</small><strong>3.420,00 €</strong></div><div class="metric"><small>Cobrado</small><strong>2.875,00 €</strong></div>
    <div class="metric"><small>Gastos</small><strong>1.590,30 €</strong></div><div class="metric red"><small>Pendiente</small><strong>545,00 €</strong></div>
  </div></section>
  <div class="quick-grid">
    <button class="quick" data-open="invoice"><span>＋</span>Factura</button><button class="quick" data-toast="Albarán nuevo"><span>▤</span>Albarán</button><button class="quick" data-toast="Gasto nuevo"><span>◈</span>Gasto</button><button class="quick" data-toast="Cobro registrado"><span>✓</span>Cobro</button>
  </div>
  <section class="section"><div class="section-head"><h3>Necesita tu atención</h3><button class="link-btn">Ver todo</button></div><div class="card list">
    ${attention('red','FAC-104 vencida hace 9 días','320,00 €')}${attention('amber','3 albaranes sin facturar','225,00 €')}${attention('amber','Compra sin justificante','462,00 €')}${attention('gray','Copia de seguridad pendiente','')}
  </div></section>
  <section class="section"><div class="section-head"><h3>Actividad reciente</h3><button class="link-btn">Ver todo</button></div><div class="card list">
    ${activity('Cobro recibido de Pollería Pepe','Hoy, 11:32','+250,00 €','plus')}${activity('Factura FAC-105 creada','Hoy, 10:15','416,00 €','')}${activity('Compra a Patatas del Norte','Ayer, 18:45','-800,00 €','minus')}
  </div></section>`}
function attention(cls,txt,amount){return `<div class="list-row"><span class="status-dot ${cls}"></span><div class="row-title">${txt}</div><div class="amount">${amount}</div></div>`}
function activity(txt,sub,amount,cls){return `<div class="list-row"><span class="status-dot green"></span><div><div class="row-title">${txt}</div><div class="row-sub">${sub}</div></div><div class="amount ${cls}">${amount}</div></div>`}

function sales(){return `
  <div class="segmented">${['Facturas','Albaranes','Presupuestos','Cobros'].map((x,i)=>`<button class="segment ${i===0?'active':''}">${x}</button>`).join('')}</div>
  <div class="summary-grid"><div class="summary-card"><small>Facturado</small><strong>3.420,00 €</strong></div><div class="summary-card"><small>Cobrado</small><strong>2.875,00 €</strong></div><div class="summary-card"><small>Pendiente</small><strong>545,00 €</strong></div><div class="summary-card red"><small>Vencido</small><strong>320,00 €</strong></div></div>
  <div class="segmented">${['Todas','Pendientes','Vencidas','Pagadas','Parciales'].map(x=>`<button class="segment filter ${state.salesFilter===x?'active':''}" data-filter="${x}">${x}</button>`).join('')}</div>
  <section>${invoices.filter(i=>state.salesFilter==='Todas'||i.status.startsWith(state.salesFilter.slice(0,-1))||i.status===state.salesFilter).map(invoiceCard).join('')}</section>`}
function invoiceCard(i){return `<article class="card invoice" data-open="invoice-detail"><div class="invoice-top"><div><h4>${i.client}</h4><div class="code">${i.code} · ${i.period}</div><span class="badge ${i.cls}">${i.status}</span></div><div class="price">${i.amount}</div></div><div class="invoice-actions"><button class="mini-btn" data-print="invoice">Imprimir</button><button class="mini-btn">PDF</button><button class="mini-btn">WhatsApp</button><button class="mini-btn">Cobro</button></div></article>`}

function contacts(){return `
  <div class="segmented"><button class="segment active">Clientes</button><button class="segment">Proveedores</button></div>
  <div class="field"><input type="search" placeholder="Buscar cliente…"></div>
  <article class="card profile-card" data-open="client"><div class="profile-head"><div class="client-avatar">BE</div><div><h3>Bar Restaurante Ejemplo</h3><p>B12345678 · Albacete</p></div></div><div class="stat-grid" style="margin-top:14px"><div class="stat"><small>Facturado (año)</small><strong>8.320,00 €</strong></div><div class="stat"><small>Pendiente</small><strong class="danger">916,00 €</strong></div></div></article>
  ${['Pollería Pepe','Supermercado Hola','Carnicería Luis'].map((c,idx)=>`<article class="card invoice" style="margin-top:10px"><div class="invoice-top"><div><h4>${c}</h4><div class="code">Última compra hace ${idx+2} días</div></div><div><div class="price">${[250,620,320][idx]},00 €</div><span class="badge ${idx===0?'amber':'green'}">${idx===0?'Pendiente':'Al corriente'}</span></div></div></article>`).join('')}`}

function more(){return `
  <section class="menu-grid">
    ${menu('▥','Negocio','Compras, gastos, productos y stock','business')}${menu('◫','Informes','Ventas, márgenes, IVA y deuda','reports')}${menu('▤','Documentos','PDF, tickets y adjuntos','docs')}${menu('↻','Sincronización','Copias, dispositivos y conflictos','sync')}${menu('⚙','Configuración','Empresa, series, IVA y apariencia','settings')}${menu('⌫','Papelera','Recuperación y auditoría','trash')}
  </section>`}
function menu(icon,name,sub,open){return `<button class="menu-card" data-open="${open}"><span>${icon}</span><strong>${name}</strong><small>${sub}</small></button>`}

function business(){return `<div class="segmented"><button class="segment active">Compras</button><button class="segment">Gastos</button><button class="segment">Productos</button><button class="segment">Stock</button></div>
  <div class="summary-grid"><div class="summary-card"><small>Compras (mes)</small><strong>2.860,00 €</strong></div><div class="summary-card"><small>IVA soportado</small><strong>286,00 €</strong></div></div>
  ${['Patatas del Norte','Hermanos López','Patatas del Segura','Hermanos López'].map((p,i)=>`<article class="card invoice"><div class="invoice-top"><div><h4>${p}</h4><div class="code">${17-i*2}/07/26 · ${1000-i*100} kg</div><div class="row-sub">Patata agria francesa</div></div><div><div class="price">${[800,425,640,510][i]},00 €</div><span class="badge ${i===1?'amber':'green'}">${i===1?'Pendiente':'Pagada'}</span></div></div></article>`).join('')}`}

function invoiceForm(){return `<div class="stepper">${['Cliente','Productos','Datos','Revisión'].map((x,i)=>`<div class="step ${i===0?'active':''}"><span class="num">${i+1}</span>${x}</div>`).join('')}</div>
  <section class="card form-card"><div class="field"><label>Cliente</label><select><option>Bar Restaurante Ejemplo</option><option>Pollería Pepe</option><option>Supermercado Hola</option></select></div><div class="field"><label>Periodo</label><select><option>1–15 julio 2026</option><option>16–31 julio 2026</option></select></div></section>
  <section class="card form-card"><div class="line-item"><div><strong>Patata bastón 12 mm</strong><br><small>200 kg × 1,60 €</small></div><input value="200"><strong>320,00 €</strong></div><div class="line-item"><div><strong>Patata panadera</strong><br><small>40 kg × 1,40 €</small></div><input value="40"><strong>56,00 €</strong></div><div class="line-item"><div><strong>Transporte</strong><br><small>1 × 40,00 €</small></div><input value="1"><strong>40,00 €</strong></div><button class="secondary-btn" style="margin-top:12px">＋ Añadir producto</button></section>
  <section class="card form-card"><div class="list-row"><div></div><div class="row-title">Base imponible</div><div class="amount">400,00 €</div></div><div class="list-row"><div></div><div class="row-title">IVA 4%</div><div class="amount">16,00 €</div></div><div class="list-row"><div></div><div class="row-title">TOTAL</div><div class="amount">416,00 €</div></div></section>
  <button class="primary-btn" data-toast="Factura de prueba emitida">Emitir factura</button>`}

function clientDetail(){return `<article class="card profile-card"><div class="profile-head"><div class="client-avatar">BE</div><div><h3>Bar Restaurante Ejemplo</h3><p>B12345678 · 600 123 456 · Albacete</p></div></div><div class="tabs"><button class="tab active">Resumen</button><button class="tab">Documentos</button><button class="tab">Cobros</button><button class="tab">Datos</button></div><div class="stat-grid"><div class="stat"><small>Facturado (año)</small><strong>8.320,00 €</strong></div><div class="stat"><small>Pendiente</small><strong class="danger">916,00 €</strong></div><div class="stat"><small>Última compra</small><strong>Hace 3 días</strong></div><div class="stat"><small>Días de pago</small><strong>25 días</strong></div></div></article><section class="section"><div class="section-head"><h3>Deuda actual</h3></div><div class="card list">${attention('red','Total pendiente','916,00 €')}${attention('amber','2 facturas abiertas','820,00 €')}${attention('green','1 pago parcial','96,00 €')}${attention('red','Vencido','320,00 €')}</div></section><div class="action-row"><button class="action-pill primary">Factura</button><button class="action-pill">Albarán</button><button class="action-pill">Cobro</button><button class="action-pill">WhatsApp</button></div>`}

function invoiceDetail(){return `<div><span class="badge red">Vencida</span><h2 style="font-size:30px;margin:8px 0 2px">FAC-104</h2><p class="row-sub">1–15 julio 2026</p></div><section class="card form-card"><div class="invoice-top"><div><h4>Bar Restaurante Ejemplo</h4><div class="code">B12345678</div></div><button class="icon-btn">☎</button></div><div class="list-row"><div></div><div class="row-title">Total</div><div class="amount">416,00 €</div></div><div class="list-row"><div></div><div class="row-title">Pendiente</div><div class="amount danger">416,00 €</div></div></section><section class="section"><div class="section-head"><h3>Líneas</h3></div><div class="card list">${activity('Patata bastón 12 mm','200 kg × 1,60 €','320,00 €','')}${activity('Patata panadera','40 kg × 1,40 €','56,00 €','')}${activity('Transporte','1 × 40,00 €','40,00 €','')}</div></section><div class="action-row"><button class="action-pill" data-print="invoice">Imprimir</button><button class="action-pill">PDF</button><button class="action-pill">WhatsApp</button><button class="action-pill primary">Cobro</button></div>`}

function printInvoice(){
  const printWindow=window.open('', '_blank');
  if(!printWindow){showToast('Permite ventanas emergentes para imprimir');return}
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FAC-104</title><style>body{font-family:Arial,sans-serif;color:#111;margin:32px}.invoice-print{max-width:760px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:3px solid #14213d;padding-bottom:18px}.brand{font-size:28px;font-weight:800;color:#14213d}.muted{color:#666}.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:28px 0}.box{border:1px solid #ddd;padding:16px;border-radius:10px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:12px 8px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.totals{margin-left:auto;width:300px;margin-top:22px}.totals div{display:flex;justify-content:space-between;padding:7px 0}.total{font-size:20px;font-weight:800;border-top:2px solid #14213d}.foot{margin-top:50px;border-top:1px solid #ddd;padding-top:16px;font-size:12px;color:#666}@media print{body{margin:0}}</style></head><body><div class="invoice-print"><div class="head"><div><div class="brand">FactuPapa</div><div class="muted">Gonsol de la Vega</div></div><div style="text-align:right"><h1>FACTURA</h1><strong>FAC-104/2026</strong><div class="muted">15/07/2026</div></div></div><div class="cols"><div class="box"><strong>Emisor</strong><p>Gonsol de la Vega<br>Datos fiscales de empresa<br>España</p></div><div class="box"><strong>Cliente</strong><p>Bar Restaurante Ejemplo<br>B12345678<br>Albacete</p></div></div><p><strong>Periodo facturado:</strong> 1–15 julio 2026</p><table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio</th><th>Importe</th></tr></thead><tbody><tr><td>Patata bastón 12 mm</td><td>200 kg</td><td>1,60 €</td><td>320,00 €</td></tr><tr><td>Patata panadera</td><td>40 kg</td><td>1,40 €</td><td>56,00 €</td></tr><tr><td>Transporte</td><td>1</td><td>40,00 €</td><td>40,00 €</td></tr></tbody></table><div class="totals"><div><span>Base imponible</span><strong>400,00 €</strong></div><div><span>IVA 4%</span><strong>16,00 €</strong></div><div class="total"><span>Total</span><strong>416,00 €</strong></div></div><div class="foot">Forma de pago: transferencia bancaria · Documento de prueba del prototipo FactuPapa.</div></div><script>window.onload=()=>{window.print()}<\/script></body></html>`);
  printWindow.document.close();
}

function render(){
  const maps={home:['FactuPapa','JULIO 2026',home],sales:['Ventas','FACTURACIÓN',sales],contacts:['Contactos','CLIENTES Y PROVEEDORES',contacts],more:['Más','HERRAMIENTAS Y AJUSTES',more],business:['Negocio','COMPRAS Y GASTOS',business],invoice:['Nueva factura','BORRADOR',invoiceForm],client:['Cliente','FICHA OPERATIVA',clientDetail],'invoice-detail':['Factura','DETALLE',invoiceDetail]};
  const [t,e,fn]=maps[state.view]||maps.home; title.textContent=t; eyebrow.textContent=e; view.innerHTML=fn();
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
}
function openSheet(){sheet.innerHTML=`<div class="sheet-handle"></div><h2>Crear nuevo</h2><div class="sheet-grid">${[['＋','Factura','invoice'],['▤','Albarán',''],['◫','Presupuesto',''],['✓','Cobro',''],['◈','Gasto',''],['▥','Compra','business'],['♙','Cliente','contacts'],['♜','Proveedor','contacts']].map(x=>`<button class="sheet-action" data-sheet-view="${x[2]}" data-toast="${x[1]}"><span>${x[0]}</span>${x[1]}</button>`).join('')}</div>`;sheet.classList.remove('hidden');backdrop.classList.remove('hidden')}
function closeSheet(){sheet.classList.add('hidden');backdrop.classList.add('hidden')}
function showToast(msg){toast.textContent=msg;toast.classList.remove('hidden');setTimeout(()=>toast.classList.add('hidden'),1700)}

document.addEventListener('click',e=>{
  const printer=e.target.closest('[data-print]'); if(printer){printInvoice();return}
  const nav=e.target.closest('[data-view]'); if(nav){state.view=nav.dataset.view;render();return}
  const open=e.target.closest('[data-open]'); if(open){state.view=open.dataset.open;render();return}
  const filter=e.target.closest('[data-filter]'); if(filter){state.salesFilter=filter.dataset.filter;render();return}
  const st=e.target.closest('[data-sheet-view]'); if(st){const v=st.dataset.sheetView;closeSheet();if(v){state.view=v;render()}else showToast(`${st.dataset.toast}: prototipo preparado`);return}
  const tt=e.target.closest('[data-toast]'); if(tt){showToast(tt.dataset.toast);return}
});
document.querySelector('#fab').addEventListener('click',openSheet);backdrop.addEventListener('click',closeSheet);
render();
