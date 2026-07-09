function plantillaCompraEjemplo() {
  procesarCompraManual({
    fileId: 'PON_AQUI_EL_FILE_ID',
    fechaIso: '2026-04-01',
    fechaDocumento: '01/04/2026',
    proveedorCorto: 'PROVEEDOR',
    proveedorNombre: 'NOMBRE COMPLETO DEL PROVEEDOR',
    numero: 'NUMERO_FACTURA',
    nif: 'CIF_PROVEEDOR',
    concepto: 'CONCEPTO',
    categoria: 'Materia prima',
    base: 0,
    ivaPct: 4,
    cuotaIva: 0,
    total: 0,
    totalTexto: '0,00',
    estado: 'pagado',
    metodoPago: '',
    mes: '04_ABRIL',
    trimestre: 'T2',
    anio: '2026',
    subtipo: 'factura',
    revisado: 'sí',
    observaciones: ''
  });
}


function plantillaVentaEjemplo() {
  procesarVentaManual({
    fileId: '1YaSZzaKLI41pLtavBzuXICG-xGaZsXBy',
    fechaIso: '2026-04-22',
    fechaDocumento: '22/04/2026',
    clienteCorto: 'ROYAL_FOOD',
    clienteNombre: 'INVERSIONES ROYAL FOOD',
    numero: 'FAC-087/2026',
    nif: 'B10815477',
    concepto: 'AGRIA PELADA',
    categoria: 'Patatas peladas y cortadas',
    base: 86.25,
    ivaPct: 4,
    cuotaIva: 3.45,
    total: 89.70,
    totalTexto: '89,70',
    estado: 'pagado',
    metodoPago: '',
    mes: '04_ABRIL',
    trimestre: 'T2',
    anio: '2026',
    subtipo: 'factura',
    revisado: 'sí',
    observaciones: ''
  });
}

function plantillaGastoEjemplo() {
  procesarGastoManual({
    fileId: 'PON_AQUI_EL_FILE_ID',
    fechaIso: '2026-04-01',
    fechaDocumento: '01/04/2026',
    categoriaCorta: 'COMBUSTIBLE',
    categoria: 'Combustible',
    terceroCorto: 'BP',
    terceroNombre: 'NOMBRE DEL TERCERO',
    numero: '',
    nif: '',
    concepto: 'CONCEPTO',
    base: 0,
    ivaPct: 21,
    cuotaIva: 0,
    total: 0,
    totalTexto: '0,00',
    estado: 'pagado',
    metodoPago: '',
    mes: '04_ABRIL',
    trimestre: 'T2',
    anio: '2026',
    subtipo: 'factura',
    revisado: 'sí',
    observaciones: ''
  });
}function listarPendientes() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const archivos = pendientes.getFiles();

  Logger.log('=== ARCHIVOS PENDIENTES ===');

  let contador = 0;
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    contador++;
    Logger.log(
      contador + '. ' +
      'NOMBRE: ' + archivo.getName() +
      ' | ID: ' + archivo.getId() +
      ' | URL: ' + archivo.getUrl()
    );
  }

  if (contador === 0) {
    Logger.log('No hay archivos pendientes.');
  }
}function inventarioLegacyFacturas() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const facturas = pendientes.getFoldersByName('Facturas').next();

  const legacyCompras = facturas.getFoldersByName('Facturas de compras').next();
  const legacyVentas = facturas.getFoldersByName('Facturas de ventas').next();

  Logger.log('===== INVENTARIO LEGACY =====');

  Logger.log('--- FACTURAS DE COMPRAS ---');
  recorrerCarpetaRecursiva_(legacyCompras, 'COMPRAS');

  Logger.log('--- FACTURAS DE VENTAS ---');
  recorrerCarpetaRecursiva_(legacyVentas, 'VENTAS');
}

function recorrerCarpetaRecursiva_(carpeta, etiqueta) {
  Logger.log('CARPETA: [' + etiqueta + '] ' + carpeta.getName());

  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    Logger.log(
      'ARCHIVO | TIPO: ' + etiqueta +
      ' | NOMBRE: ' + archivo.getName() +
      ' | ID: ' + archivo.getId() +
      ' | URL: ' + archivo.getUrl()
    );
  }

  const subcarpetas = carpeta.getFolders();
  while (subcarpetas.hasNext()) {
    const sub = subcarpetas.next();
    recorrerCarpetaRecursiva_(sub, etiqueta);
  }
}function listarCompras2026T1() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const facturas = pendientes.getFoldersByName('Facturas').next();
  const compras = facturas.getFoldersByName('Facturas de compras').next();
  const anio2026 = compras.getFoldersByName('2026').next();
  const t1 = anio2026.getFoldersByName('1º trimestral ').next();

  Logger.log('=== COMPRAS 2026 T1 ===');
  recorrerCarpetaRecursiva_(t1, 'COMPRAS_2026_T1');
}function migrarCompras2026T1SinCopias() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const facturas = pendientes.getFoldersByName('Facturas').next();
  const compras = facturas.getFoldersByName('Facturas de compras').next();
  const anio2026 = compras.getFoldersByName('2026').next();
  const t1 = anio2026.getFoldersByName('1º trimestral ').next();

  migrarArchivosComprasPorMes_(t1.getFoldersByName('Enero').next(), '01_ENERO');
  migrarArchivosComprasPorMes_(t1.getFoldersByName('Febrero').next(), '02_FEBRERO');
  migrarArchivosComprasPorMes_(t1.getFoldersByName('Marzo').next(), '03_MARZO');

  Logger.log('Migración T1 sin copias completada.');
}

function migrarArchivosComprasPorMes_(carpetaOrigen, mesDestino) {
  const archivos = carpetaOrigen.getFiles();
  const carpetaDestino = obtenerCarpetaDestino_('compra', '2026', 'T1', mesDestino);

  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();

    if (nombre.startsWith('Copia de')) {
      Logger.log('OMITIDO (copia): ' + nombre);
      continue;
    }

    archivo.moveTo(carpetaDestino);
    Logger.log('MOVIDO: ' + nombre + ' -> ' + mesDestino);
  }
}function revisarDuplicadosCompras2026T1() {
  revisarDuplicadosEnCarpetaCompras_('01_ENERO');
  revisarDuplicadosEnCarpetaCompras_('02_FEBRERO');
  revisarDuplicadosEnCarpetaCompras_('03_MARZO');
}

function revisarDuplicadosEnCarpetaCompras_(mes) {
  const carpeta = obtenerCarpetaDestino_('compra', '2026', 'T1', mes);
  const archivos = carpeta.getFiles();
  const contador = {};

  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();
    contador[nombre] = (contador[nombre] || 0) + 1;
  }

  Logger.log('=== DUPLICADOS EN ' + mes + ' ===');
  let hayDuplicados = false;

  for (const nombre in contador) {
    if (contador[nombre] > 1) {
      hayDuplicados = true;
      Logger.log('DUPLICADO | ' + nombre + ' | REPETICIONES: ' + contador[nombre]);
    }
  }

  if (!hayDuplicados) {
    Logger.log('Sin duplicados en ' + mes);
  }
}function limpiarDuplicadosComprasEnero2026() {
  const carpetaDestino = obtenerCarpetaDestino_('compra', '2026', 'T1', '01_ENERO');
  const carpetaRevision = obtenerOCrearCarpetaEnDestino_(carpetaDestino, '_DUPLICADOS_REVISION');

  const archivos = carpetaDestino.getFiles();
  const grupos = {};

  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();

    if (nombre === '_DUPLICADOS_REVISION') {
      continue;
    }

    if (!grupos[nombre]) {
      grupos[nombre] = [];
    }
    grupos[nombre].push(archivo);
  }

  let movidos = 0;

  for (const nombre in grupos) {
    const lista = grupos[nombre];

    if (lista.length > 1) {
      // dejamos la primera copia en la carpeta principal
      for (let i = 1; i < lista.length; i++) {
        lista[i].moveTo(carpetaRevision);
        movidos++;
        Logger.log('MOVIDO A REVISION: ' + nombre);
      }
    }
  }

  Logger.log('Duplicados movidos a revisión: ' + movidos);
}

function obtenerOCrearCarpetaEnDestino_(carpetaPadre, nombre) {
  const existentes = carpetaPadre.getFoldersByName(nombre);
  if (existentes.hasNext()) {
    return existentes.next();
  }
  return carpetaPadre.createFolder(nombre);
}function migrarCompras2026T2() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const facturas = pendientes.getFoldersByName('Facturas').next();
  const compras = facturas.getFoldersByName('Facturas de compras').next();
  const anio2026 = compras.getFoldersByName('2026').next();
  const t2 = anio2026.getFoldersByName('2° trimestral ').next();

  const carpetaDestino = obtenerCarpetaDestino_('compra', '2026', 'T2', '04_ABRIL');
  const archivos = t2.getFiles();

  let movidos = 0;
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    archivo.moveTo(carpetaDestino);
    movidos++;
    Logger.log('MOVIDO: ' + archivo.getName());
  }

  Logger.log('Total movidos a ABRIL compras T2: ' + movidos);
}function migrarVentas2026() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const facturas = pendientes.getFoldersByName('Facturas').next();
  const ventas = facturas.getFoldersByName('Facturas de ventas').next();
  const anio2026 = ventas.getFoldersByName('2026').next();

  const t1 = anio2026.getFoldersByName('1º trimestral ventas').next();
  const t2 = anio2026.getFoldersByName('2º trimestral ventas').next();

  migrarArchivosVentasPorMes_(t1.getFoldersByName('Enero_ventas').next(), '2026', 'T1', '01_ENERO');
  migrarArchivosVentasPorMes_(t1.getFoldersByName('Febrero_ventas').next(), '2026', 'T1', '02_FEBRERO');
  migrarArchivosVentasPorMes_(t1.getFoldersByName('Marzo_ventas').next(), '2026', 'T1', '03_MARZO');
  migrarArchivosVentasPorMes_(t2.getFoldersByName('ABRIL').next(), '2026', 'T2', '04_ABRIL');

  Logger.log('Migración ventas 2026 completada.');
}

function migrarArchivosVentasPorMes_(carpetaOrigen, anio, trimestre, mes) {
  const carpetaDestino = obtenerCarpetaDestino_('venta', anio, trimestre, mes);
  const archivos = carpetaOrigen.getFiles();

  let movidos = 0;
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    archivo.moveTo(carpetaDestino);
    movidos++;
    Logger.log('MOVIDO: ' + archivo.getName() + ' -> ' + mes);
  }

  Logger.log('Total movidos en ' + mes + ': ' + movidos);
}function revisarVentas2026Destino() {
  revisarDuplicadosEnCarpetaVentas_('2026', 'T1', '01_ENERO');
  revisarDuplicadosEnCarpetaVentas_('2026', 'T1', '02_FEBRERO');
  revisarDuplicadosEnCarpetaVentas_('2026', 'T1', '03_MARZO');
  revisarDuplicadosEnCarpetaVentas_('2026', 'T2', '04_ABRIL');
}

function revisarDuplicadosEnCarpetaVentas_(anio, trimestre, mes) {
  const carpeta = obtenerCarpetaDestino_('venta', anio, trimestre, mes);
  const archivos = carpeta.getFiles();
  const contador = {};

  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();
    contador[nombre] = (contador[nombre] || 0) + 1;
  }

  Logger.log('=== DUPLICADOS VENTAS EN ' + mes + ' ===');
  let hayDuplicados = false;

  for (const nombre in contador) {
    if (contador[nombre] > 1) {
      hayDuplicados = true;
      Logger.log('DUPLICADO | ' + nombre + ' | REPETICIONES: ' + contador[nombre]);
    }
  }

  if (!hayDuplicados) {
    Logger.log('Sin duplicados en ' + mes);
  }
}function migrarVentas2025() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const pendientes = raiz.getFoldersByName('99_PENDIENTE_DE_CLASIFICAR').next();
  const facturas = pendientes.getFoldersByName('Facturas').next();
  const ventas = facturas.getFoldersByName('Facturas de ventas').next();
  const anio2025 = ventas.getFoldersByName('2025').next();

  migrarArchivosVentasPorMes_(anio2025.getFoldersByName('Octubre').next(), '2025', 'T4', '10_OCTUBRE');
  migrarArchivosVentasPorMes_(anio2025.getFoldersByName('Noviembre').next(), '2025', 'T4', '11_NOVIEMBRE');
  migrarArchivosVentasPorMes_(anio2025.getFoldersByName('Diciembre').next(), '2025', 'T4', '12_DICIEMBRE');

  Logger.log('Migración ventas 2025 completada.');
}