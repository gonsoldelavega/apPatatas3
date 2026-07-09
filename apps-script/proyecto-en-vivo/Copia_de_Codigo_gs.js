// ==============================
// 1. ESTRUCTURA DE CARPETAS
// ==============================
function crearEstructuraGonsol() {
  const nombreRaiz = 'Gonsol de la Vega - Gestión';
  
  const carpetasPrincipales = [
    '00_ADMINISTRACION',
    '01_VENTAS',
    '02_COMPRAS',
    '03_GASTOS',
    '04_BANCO_Y_PAGOS',
    '05_IMPUESTOS_Y_GESTORIA',
    '06_CLIENTES_Y_PROVEEDORES',
    '07_PLANTILLAS_Y_MODELOS',
    '99_PENDIENTE_DE_CLASIFICAR'
  ];

  const anio = '2026';
  const trimestres = {
    T1: ['01_ENERO', '02_FEBRERO', '03_MARZO'],
    T2: ['04_ABRIL', '05_MAYO', '06_JUNIO'],
    T3: ['07_JULIO', '08_AGOSTO', '09_SEPTIEMBRE'],
    T4: ['10_OCTUBRE', '11_NOVIEMBRE', '12_DICIEMBRE']
  };

  const subcarpetasPorTipo = {
    '01_VENTAS': ['FACTURAS_EMITIDAS', 'ALBARANES', 'COBROS'],
    '02_COMPRAS': ['FACTURAS_RECIBIDAS', 'ALBARANES_PROVEEDOR'],
    '03_GASTOS': ['COMBUSTIBLE', 'SUMINISTROS', 'ASESORIA', 'MANTENIMIENTO', 'OTROS']
  };

  const raiz = obtenerOCrearCarpeta_(nombreRaiz, DriveApp.getRootFolder());

  carpetasPrincipales.forEach(nombre => {
    const carpetaPrincipal = obtenerOCrearCarpeta_(nombre, raiz);

    if (subcarpetasPorTipo[nombre]) {
      const carpetaAnio = obtenerOCrearCarpeta_(anio, carpetaPrincipal);

      Object.keys(trimestres).forEach(trimestre => {
        const carpetaTrimestre = obtenerOCrearCarpeta_(trimestre, carpetaAnio);

        trimestres[trimestre].forEach(mes => {
          const carpetaMes = obtenerOCrearCarpeta_(mes, carpetaTrimestre);

          subcarpetasPorTipo[nombre].forEach(sub => {
            obtenerOCrearCarpeta_(sub, carpetaMes);
          });
        });
      });
    }
  });

  Logger.log('Estructura creada o verificada correctamente.');
}

function obtenerOCrearCarpeta_(nombre, carpetaPadre) {
  const existentes = carpetaPadre.getFoldersByName(nombre);
  if (existentes.hasNext()) {
    return existentes.next();
  }
  return carpetaPadre.createFolder(nombre);
  // ==============================
// 4. FUNCIONES DE COMPROBACION Y PRUEBA
// ==============================
}function verCarpetaRaizGonsol() {
  const nombreRaiz = 'Gonsol de la Vega - Gestión';
  const carpetas = DriveApp.getRootFolder().getFoldersByName(nombreRaiz);

  if (carpetas.hasNext()) {
    const carpeta = carpetas.next();
    Logger.log('NOMBRE: ' + carpeta.getName());
    Logger.log('URL: ' + carpeta.getUrl());
    Logger.log('ID: ' + carpeta.getId());
  } else {
    Logger.log('NO_ENCONTRADA');
  }
}function procesarFacturaCompraPrueba() {
  const idArchivo = '1gRkYKUiiHrFWu3LcqhC_e4qIVjcgaPdT';
  const nuevoNombre = '2026-04-01_FACTURA_COMPRA_GAYCA_FV006-00000709_109,20.pdf';

  const archivo = DriveApp.getFileById(idArchivo);
  archivo.setName(nuevoNombre);

  const carpetaDestino = obtenerRutaComprasAbril2026_();
  archivo.moveTo(carpetaDestino);

  Logger.log('Archivo renombrado y movido correctamente.');
  Logger.log('Nuevo nombre: ' + archivo.getName());
  Logger.log('URL: ' + archivo.getUrl());
}

function obtenerRutaComprasAbril2026_() {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();
  const compras = raiz.getFoldersByName('02_COMPRAS').next();
  const anio = compras.getFoldersByName('2026').next();
  const trimestre = anio.getFoldersByName('T2').next();
  const mes = trimestre.getFoldersByName('04_ABRIL').next();
  const destino = mes.getFoldersByName('FACTURAS_RECIBIDAS').next();
  return destino;
}function registrarFacturaCompraPruebaEnSheet() {
  const spreadsheetId = '1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU';
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('REGISTRO');

  const fileId = '1gRkYKUiiHrFWu3LcqhC_e4qIVjcgaPdT';
  const file = DriveApp.getFileById(fileId);

  sheet.appendRow([
    '01/04/2026',                         // Fecha documento
    new Date(),                           // Fecha registro
    'compra',                             // Tipo
    'factura',                            // Subtipo
    'FV006-00000709',                     // Serie / Nº
    'FRUTAS Y PATATAS GAYCA, S.A.',       // Cliente / Proveedor
    'A04037677',                          // NIF/CIF
    'PATATAS AGRIA',                      // Concepto
    'Materia prima',                      // Categoría
    105.00,                               // Base imponible
    4,                                    // IVA %
    4.20,                                 // Cuota IVA
    109.20,                               // Total
    'pagado',                             // Estado
    '',                                   // Método pago
    '04_ABRIL',                           // Mes
    'T2',                                 // Trimestre
    '2026',                               // Año
    file.getUrl(),                        // Ruta / enlace Drive
    file.getName(),                       // Nombre archivo
    'sí',                                 // Revisado
    'Factura de compra de prueba'         // Observaciones
  ]);

  Logger.log('Factura registrada correctamente en la hoja REGISTRO.');
}function mejorarHojaRegistro() {
  const spreadsheetId = '1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU';
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('REGISTRO');

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  // Congelar encabezado
  sheet.setFrozenRows(1);

  // Filtro en toda la tabla
  const dataRange = sheet.getRange(1, 1, lastRow, lastColumn);
  const existingFilter = sheet.getFilter();
  if (existingFilter) {
    existingFilter.remove();
  }
  dataRange.createFilter();

  // Ajustar ancho de columnas automáticamente
  sheet.autoResizeColumns(1, lastColumn);

  // Formato cabecera
  const header = sheet.getRange(1, 1, 1, lastColumn);
  header.setFontWeight('bold');
  header.setWrap(true);

  // Formato filas de datos
  if (lastRow > 1) {
    const bodyRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    bodyRange.setVerticalAlignment('middle');
  }

  // Formato de columnas numéricas
  sheet.getRange('J:J').setNumberFormat('#,##0.00');
  sheet.getRange('K:K').setNumberFormat('0');
  sheet.getRange('L:L').setNumberFormat('#,##0.00');
  sheet.getRange('M:M').setNumberFormat('#,##0.00');

  // Formato de fecha documento
  sheet.getRange('A:A').setNumberFormat('dd/MM/yyyy');

  Logger.log('Hoja REGISTRO mejorada correctamente.');
  // ==============================
// 3. PROCESAMIENTO GENERAL
// ==============================
}function procesarCompraManual(datos) {
  const archivo = DriveApp.getFileById(datos.fileId);
  const nombreNuevo = `${datos.fechaIso}_FACTURA_COMPRA_${datos.proveedorCorto}_${datos.numero}_${datos.totalTexto}.pdf`;
  archivo.setName(nombreNuevo);

  const carpetaDestino = obtenerCarpetaDestino_('compra', datos.anio, datos.trimestre, datos.mes);
  archivo.moveTo(carpetaDestino);

  registrarEnSheet_({
    fechaDocumento: datos.fechaDocumento,
    tipo: 'compra',
    subtipo: datos.subtipo || 'factura',
    serieNumero: datos.numero,
    tercero: datos.proveedorNombre,
    nif: datos.nif || '',
    concepto: datos.concepto || '',
    categoria: datos.categoria || '',
    base: datos.base || '',
    ivaPct: datos.ivaPct || '',
    cuotaIva: datos.cuotaIva || '',
    total: datos.total || '',
    estado: datos.estado || '',
    metodoPago: datos.metodoPago || '',
    mes: datos.mes,
    trimestre: datos.trimestre,
    anio: datos.anio,
    enlace: archivo.getUrl(),
    nombreArchivo: archivo.getName(),
    revisado: datos.revisado || 'sí',
    observaciones: datos.observaciones || ''
  });

  Logger.log('Compra procesada correctamente: ' + archivo.getName());
  Logger.log(archivo.getUrl());
}

function procesarVentaManual(datos) {
  const archivo = DriveApp.getFileById(datos.fileId);
  const nombreNuevo = `${datos.fechaIso}_FACTURA_VENTA_${datos.clienteCorto}_${datos.numero}_${datos.totalTexto}.pdf`;
  archivo.setName(nombreNuevo);

  const carpetaDestino = obtenerCarpetaDestino_('venta', datos.anio, datos.trimestre, datos.mes);
  archivo.moveTo(carpetaDestino);

  registrarEnSheet_({
    fechaDocumento: datos.fechaDocumento,
    tipo: 'venta',
    subtipo: datos.subtipo || 'factura',
    serieNumero: datos.numero,
    tercero: datos.clienteNombre,
    nif: datos.nif || '',
    concepto: datos.concepto || '',
    categoria: datos.categoria || '',
    base: datos.base || '',
    ivaPct: datos.ivaPct || '',
    cuotaIva: datos.cuotaIva || '',
    total: datos.total || '',
    estado: datos.estado || '',
    metodoPago: datos.metodoPago || '',
    mes: datos.mes,
    trimestre: datos.trimestre,
    anio: datos.anio,
    enlace: archivo.getUrl(),
    nombreArchivo: archivo.getName(),
    revisado: datos.revisado || 'sí',
    observaciones: datos.observaciones || ''
  });

  Logger.log('Venta procesada correctamente: ' + archivo.getName());
  Logger.log(archivo.getUrl());
}

function procesarGastoManual(datos) {
  const archivo = DriveApp.getFileById(datos.fileId);
  const nombreNuevo = `${datos.fechaIso}_GASTO_${datos.categoriaCorta}_${datos.terceroCorto}_${datos.totalTexto}.pdf`;
  archivo.setName(nombreNuevo);

  const carpetaDestino = obtenerCarpetaDestino_('gasto', datos.anio, datos.trimestre, datos.mes);
  archivo.moveTo(carpetaDestino);

  registrarEnSheet_({
    fechaDocumento: datos.fechaDocumento,
    tipo: 'gasto',
    subtipo: datos.subtipo || 'factura',
    serieNumero: datos.numero || '',
    tercero: datos.terceroNombre,
    nif: datos.nif || '',
    concepto: datos.concepto || '',
    categoria: datos.categoria || '',
    base: datos.base || '',
    ivaPct: datos.ivaPct || '',
    cuotaIva: datos.cuotaIva || '',
    total: datos.total || '',
    estado: datos.estado || '',
    metodoPago: datos.metodoPago || '',
    mes: datos.mes,
    trimestre: datos.trimestre,
    anio: datos.anio,
    enlace: archivo.getUrl(),
    nombreArchivo: archivo.getName(),
    revisado: datos.revisado || 'sí',
    observaciones: datos.observaciones || ''
  });

  Logger.log('Gasto procesado correctamente: ' + archivo.getName());
  Logger.log(archivo.getUrl());
}
// ==============================
// 2. FUNCIONES AUXILIARES DE DRIVE Y SHEETS
// ==============================
function obtenerCarpetaDestino_(tipo, anio, trimestre, mes) {
  const raiz = DriveApp.getFoldersByName('Gonsol de la Vega - Gestión').next();

  let carpetaBase;
  let subcarpetaFinal;

  if (tipo === 'compra') {
    carpetaBase = raiz.getFoldersByName('02_COMPRAS').next();
    subcarpetaFinal = 'FACTURAS_RECIBIDAS';
  } else if (tipo === 'venta') {
    carpetaBase = raiz.getFoldersByName('01_VENTAS').next();
    subcarpetaFinal = 'FACTURAS_EMITIDAS';
  } else if (tipo === 'gasto') {
    carpetaBase = raiz.getFoldersByName('03_GASTOS').next();
    subcarpetaFinal = 'OTROS';
  } else {
    throw new Error('Tipo no válido: ' + tipo);
  }

  const carpetaAnio = carpetaBase.getFoldersByName(anio).next();
  const carpetaTrimestre = carpetaAnio.getFoldersByName(trimestre).next();
  const carpetaMes = carpetaTrimestre.getFoldersByName(mes).next();
  return carpetaMes.getFoldersByName(subcarpetaFinal).next();
}

function registrarEnSheet_(d) {
  const spreadsheetId = '1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU';
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('REGISTRO');

  sheet.appendRow([
    d.fechaDocumento,
    new Date(),
    d.tipo,
    d.subtipo,
    d.serieNumero,
    d.tercero,
    d.nif,
    d.concepto,
    d.categoria,
    d.base,
    d.ivaPct,
    d.cuotaIva,
    d.total,
    d.estado,
    d.metodoPago,
    d.mes,
    d.trimestre,
    d.anio,
    d.enlace,
    d.nombreArchivo,
    d.revisado,
    d.observaciones
  ]);
}function ejemploProcesarCompraManual() {
  procesarCompraManual({
    fileId: '1gRkYKUiiHrFWu3LcqhC_e4qIVjcgaPdT',
    fechaIso: '2026-04-01',
    fechaDocumento: '01/04/2026',
    proveedorCorto: 'GAYCA',
    proveedorNombre: 'FRUTAS Y PATATAS GAYCA, S.A.',
    numero: 'FV006-00000709',
    nif: 'A04037677',
    concepto: 'PATATAS AGRIA',
    categoria: 'Materia prima',
    base: 105.00,
    ivaPct: 4,
    cuotaIva: 4.20,
    total: 109.20,
    totalTexto: '109,20',
    estado: 'pagado',
    metodoPago: '',
    mes: '04_ABRIL',
    trimestre: 'T2',
    anio: '2026',
    subtipo: 'factura',
    revisado: 'sí',
    observaciones: 'Ejemplo usando plantilla general de compra'
  });
  // ==============================
// 5. PLANTILLAS DE EJEMPLO
// ==============================
}function plantillaCompraEjemplo() {
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
    fileId: 'PON_AQUI_EL_FILE_ID',
    fechaIso: '2026-04-01',
    fechaDocumento: '01/04/2026',
    clienteCorto: 'CLIENTE',
    clienteNombre: 'NOMBRE COMPLETO DEL CLIENTE',
    numero: 'NUMERO_FACTURA',
    nif: 'CIF_CLIENTE',
    concepto: 'CONCEPTO',
    categoria: 'Patatas peladas y cortadas',
    base: 0,
    ivaPct: 4,
    cuotaIva: 0,
    total: 0,
    totalTexto: '0,00',
    estado: 'pendiente',
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
}