/**
 * Gonsol Drive Organizer
 *
 * Procesa facturas de compra escaneadas en Drive:
 * - OCR gratis mediante conversion temporal a Google Docs.
 * - Extrae campos principales con reglas.
 * - Evita duplicados.
 * - Registra en Google Sheets.
 * - Mueve a 02_COMPRAS/<AÑO>/<TRIMESTRE>.
 *
 * Requiere habilitar el servicio avanzado Drive API en Apps Script.
 */

const GONSOL_CONFIG = {
  inputFolderId: '1ETAzvmssbDM7cLDUEy89quY0xEnNecd4',
  purchasesRootFolderId: '1Q627xLAkvxB_MqUMCYPsTXRKoJIOvMvR',
  masterSpreadsheetId: '1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU',
  registrySheetName: 'REGISTRO',
  monthlyPurchasesSheetName: 'COMPRAS_MENSUAL',
  reviewFolderName: 'REVISAR_MANUALMENTE',
  duplicatesFolderName: 'DUPLICADOS',
  maxFilesPerRun: 20,
  ocrLanguage: 'es',
  paidStatus: 'pagado',
  minConfidence: 0.8
};

/**
 * Token opcional para el endpoint web (doGet). Si se deja vacio, el endpoint
 * responde sin pedir clave (URL larga e impredecible). Si se pone un valor,
 * habra que llamar con ?key=ESE_VALOR. Mantener en blanco salvo que se quiera
 * endurecer; en ese caso, poner el mismo valor en Vercel/app.
 */
const REGISTRY_WEBAPP_TOKEN = '';

/**
 * Endpoint web: publica el registro maestro (REGISTRO!A2:V) como JSON para que
 * la app lo lea sin necesidad de iniciar sesion de Google en el movil.
 *
 * Despliegue (una sola vez): Apps Script -> Implementar -> Nueva implementacion
 * -> Aplicacion web -> Ejecutar como: Yo -> Quien tiene acceso: Cualquier usuario.
 * Copiar la URL .../exec resultante.
 *
 * Devuelve: { ok:true, rows:[[...]], count, generatedAt }
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (REGISTRY_WEBAPP_TOKEN && String(params.key || '') !== REGISTRY_WEBAPP_TOKEN) {
      return jsonOutput_({ ok: false, error: 'unauthorized' });
    }
    var ss = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
    var sheet = ss.getSheetByName(GONSOL_CONFIG.registrySheetName);
    if (!sheet) {
      return jsonOutput_({ ok: false, error: 'registry_sheet_not_found' });
    }
    var lastRow = sheet.getLastRow();
    var rows = [];
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      var tz = ss.getSpreadsheetTimeZone() || 'Europe/Madrid';
      rows = values.map(function (row) {
        return row.map(function (cell) {
          if (cell instanceof Date) {
            return Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
          }
          return cell;
        });
      });
    }
    return jsonOutput_({
      ok: true,
      rows: rows,
      count: rows.length,
      source: 'apps-script-webapp',
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

const GONSOL_MONTHS = [
  '01_ENERO',
  '02_FEBRERO',
  '03_MARZO',
  '04_ABRIL',
  '05_MAYO',
  '06_JUNIO',
  '07_JULIO',
  '08_AGOSTO',
  '09_SEPTIEMBRE',
  '10_OCTUBRE',
  '11_NOVIEMBRE',
  '12_DICIEMBRE'
];

/**
 * NIF(s) del propio negocio (aparecen como CLIENTE en las facturas de compra).
 * Se excluyen al buscar el NIF del proveedor para no confundirlos.
 */
const GONSOL_CLIENT_NIFS = ['45313973V'];

/**
 * Perfiles de proveedores habituales. Permiten extraer proveedor, NIF y numero
 * de factura de forma determinista en lugar de depender de heuristicas genericas.
 */
const GONSOL_SUPPLIERS = [
  {
    key: 'GAYCA',
    name: 'FRUTAS Y PATATAS GAYCA, S.A.',
    nif: 'A04037677',
    defaultConcept: 'PATATAS AGRIA',
    defaultCategory: 'Materia prima',
    defaultIva: 4,
    detect: function(upper, upperFileName) {
      return /GAYCA|FRUTAS\s+Y\s+PATATAS/.test(upper)
        || /A04037677/.test(upper)
        || /GAYCA/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Ej: FV006-00000996. El prefijo FV evita capturar el vendedor ("6 - VENTA ALMACEN").
      var match = upper.match(/FV\s*\d{2,4}\s*[-\/]?\s*\d{4,}/);
      return match ? match[0].replace(/\s+/g, '') : '';
    }
  },
  {
    key: 'FRUTCAYCAZ',
    name: 'J. EXPOSITO CAZORLA E HIJOS, S.L.',
    nif: 'B04854154',
    defaultConcept: '',
    defaultCategory: 'Materia prima',
    defaultIva: 4,
    detect: function(upper, upperFileName) {
      return /FRUT[A-Z]*CAYCAZ|FRUT[A-Z]*GAYCAZ|EXPOSITO|CAZORLA\s+E\s+HIJOS/.test(upper)
        || /B04854154/.test(upper)
        || /FRUT[A-Z]*CAYCAZ|FRUT[A-Z]*GAYCAZ/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Ej: 26004132. Numero numerico, preferimos el que va junto a "FACTURA".
      var near = upper.match(/FACTURA[^\d]{0,20}(\d{6,9})/);
      if (near) return near[1];
      var loose = upper.match(/\b(2[5-9]\d{6})\b/);
      return loose ? loose[1] : '';
    }
  },
  {
    key: 'HIGIENLAB',
    name: 'HIGIENLAB 2020 S.L.',
    nif: 'B42743211',
    defaultConcept: '',
    defaultCategory: 'Envases',
    defaultIva: 21,
    detect: function(upper, upperFileName) {
      return /HIGIENLAB/.test(upper)
        || /B42743211/.test(upper)
        || /HIGIENLAB/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Ej: 26F00973
      var match = upper.match(/\b(\d{2}F\d{4,7})\b/);
      return match ? match[1] : '';
    }
  }
];

function processPurchaseInvoicesDaily() {
  const inputFolder = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const reviewFolder = getOrCreateChildFolder_(inputFolder, GONSOL_CONFIG.reviewFolderName);
  const duplicateFolder = getOrCreateChildFolder_(reviewFolder, GONSOL_CONFIG.duplicatesFolderName);
  const sheet = SpreadsheetApp
    .openById(GONSOL_CONFIG.masterSpreadsheetId)
    .getSheetByName(GONSOL_CONFIG.registrySheetName);

  if (!sheet) {
    throw new Error('No existe la hoja ' + GONSOL_CONFIG.registrySheetName);
  }

  const duplicateIndex = buildDuplicateIndex_(sheet);
  const files = inputFolder.getFiles();
  const results = [];
  let processed = 0;

  while (files.hasNext() && processed < GONSOL_CONFIG.maxFilesPerRun) {
    const file = files.next();
    if (!isSupportedInvoiceFile_(file)) {
      continue;
    }

    processed++;
    try {
      const result = processOnePurchaseInvoice_(file, sheet, duplicateIndex, reviewFolder, duplicateFolder);
      results.push(result);
    } catch (error) {
      moveFileToFolder_(file, reviewFolder);
      results.push({
        fileName: file.getName(),
        status: 'error',
        error: String(error && error.message ? error.message : error)
      });
    }
  }

  rebuildMonthlyPurchasesSummary_(sheet);
  reorganizePurchasesByMonth_();

  console.log(JSON.stringify(results, null, 2));
  return results;
}

/**
 * Mueve a su subcarpeta de mes las facturas que hayan quedado sueltas
 * directamente dentro de un trimestre (02_COMPRAS/<anio>/T#/<archivo>).
 * El mes se deduce del prefijo de fecha del nombre (AAAA-MM-DD_...).
 * Se ejecuta cada dia (auto-reparacion) y tambien se puede lanzar a mano.
 */
function reorganizePurchasesByMonth_() {
  const root = DriveApp.getFolderById(GONSOL_CONFIG.purchasesRootFolderId);
  const moved = [];
  const years = root.getFolders();
  while (years.hasNext()) {
    const yearFolder = years.next();
    const quarters = yearFolder.getFolders();
    while (quarters.hasNext()) {
      const quarterFolder = quarters.next();
      if (!/^T[1-4]$/.test(quarterFolder.getName())) continue;
      const looseFiles = [];
      const files = quarterFolder.getFiles();
      while (files.hasNext()) looseFiles.push(files.next());
      looseFiles.forEach(function(file) {
        const match = file.getName().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return;
        const monthIndex = Number(match[2]) - 1;
        if (monthIndex < 0 || monthIndex > 11) return;
        const monthName = GONSOL_MONTHS[monthIndex];
        const monthFolder = getOrCreateChildFolder_(quarterFolder, monthName);
        file.moveTo(monthFolder);
        moved.push({ file: file.getName(), to: monthName });
      });
    }
  }
  if (moved.length) console.log('Reorganizadas por mes: ' + JSON.stringify(moved, null, 2));
  return moved;
}

function processOnePurchaseInvoice_(file, sheet, duplicateIndex, reviewFolder, duplicateFolder) {
  const text = ocrFileToText_(file);
  const extracted = extractPurchaseInvoiceData_(text, file.getName());
  const now = new Date();

  if (extracted.confidence < GONSOL_CONFIG.minConfidence || extracted.requiresReview) {
    appendRegistryRow_(sheet, buildRegistryRow_(extracted, file, now, 'no', 'Revision manual: datos insuficientes'));
    moveFileToFolder_(file, reviewFolder);
    return { fileName: file.getName(), status: 'review', confidence: extracted.confidence };
  }

  const duplicateKey = makeDuplicateKey_(extracted.provider, extracted.invoiceNumber, extracted.total);
  if (duplicateIndex[duplicateKey]) {
    moveFileToFolder_(file, duplicateFolder);
    return { fileName: file.getName(), status: 'duplicate', duplicateKey: duplicateKey };
  }

  const destination = getDestinationFolder_(extracted.year, extracted.quarter, extracted.month);
  const newName = buildPurchaseFileName_(extracted);
  file.setName(newName);
  moveFileToFolder_(file, destination);

  appendRegistryRow_(sheet, buildRegistryRow_(extracted, file, now, 'sí', 'OCR automatico'));
  duplicateIndex[duplicateKey] = true;

  return {
    fileName: newName,
    status: 'registered',
    folder: destination.getName(),
    confidence: extracted.confidence
  };
}

function setupDailyPurchaseInvoiceTrigger() {
  deleteTriggersForFunction_('processPurchaseInvoicesDaily');
  ScriptApp
    .newTrigger('processPurchaseInvoicesDaily')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
}

function testPurchaseInvoiceOcrOnly() {
  const folder = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const files = folder.getFiles();
  if (!files.hasNext()) {
    throw new Error('No hay archivos en la carpeta de entrada.');
  }
  const file = files.next();
  const text = ocrFileToText_(file);
  console.log(text.slice(0, 4000));
  return text;
}

function rebuildPurchaseMonthlySummary() {
  const spreadsheet = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
  const registrySheet = spreadsheet.getSheetByName(GONSOL_CONFIG.registrySheetName);
  if (!registrySheet) {
    throw new Error('No existe la hoja ' + GONSOL_CONFIG.registrySheetName);
  }
  rebuildMonthlyPurchasesSummary_(registrySheet);
}

/**
 * Recuperacion puntual de compras del 2T 2026 que no estaban en el registro.
 * Datos leidos manualmente del PDF (precisos). Cada factura entra en SU mes.
 * Se puede ejecutar varias veces: no duplica (control por proveedor+numero+total).
 * Cuando ya esten registradas, esta funcion se puede borrar.
 */
function importBacklogT2_2026() {
  const sheet = SpreadsheetApp
    .openById(GONSOL_CONFIG.masterSpreadsheetId)
    .getSheetByName(GONSOL_CONFIG.registrySheetName);
  if (!sheet) {
    throw new Error('No existe la hoja ' + GONSOL_CONFIG.registrySheetName);
  }

  const backlog = [
    {
      fileId: '1OAsstG-W7REl9ccb9puitzW0JQEZHn-a',
      date: '2026-04-25',
      number: '26003435',
      provider: 'J. EXPOSITO CAZORLA E HIJOS, S.L.',
      nif: 'B04854154',
      concept: 'LECHUGA B.2UND.LUCAS',
      category: 'Materia prima',
      base: 14.00,
      ivaPercent: 4,
      ivaAmount: 0.56,
      total: 14.56
    },
    {
      fileId: '1HMz692UXG4IRy0fru5kq9B-RPeAtTu2h',
      date: '2026-04-30',
      number: '26003572',
      provider: 'J. EXPOSITO CAZORLA E HIJOS, S.L.',
      nif: 'B04854154',
      concept: 'PATATA AGRIA NUEVA',
      category: 'Materia prima',
      base: 63.00,
      ivaPercent: 4,
      ivaAmount: 2.52,
      total: 65.52
    }
  ];

  const duplicateIndex = buildDuplicateIndex_(sheet);
  const now = new Date();
  const results = [];

  backlog.forEach(function(item) {
    const key = makeDuplicateKey_(item.provider, item.number, item.total);
    if (duplicateIndex[key]) {
      results.push({ number: item.number, status: 'ya_existe' });
      return;
    }
    const parts = item.date.split('-');
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const data = {
      dateText: item.date,
      type: 'compra',
      subtype: 'factura',
      invoiceNumber: item.number,
      provider: item.provider,
      nif: item.nif,
      concept: item.concept,
      category: item.category,
      base: item.base,
      ivaPercent: item.ivaPercent,
      ivaAmount: item.ivaAmount,
      total: item.total,
      status: GONSOL_CONFIG.paidStatus,
      paymentMethod: '',
      month: GONSOL_MONTHS[dateObj.getMonth()],
      quarter: 'T' + (Math.floor(dateObj.getMonth() / 3) + 1),
      year: String(dateObj.getFullYear()),
      observations: ''
    };

    let file;
    try {
      file = DriveApp.getFileById(item.fileId);
    } catch (error) {
      file = { getUrl: function() { return ''; }, getName: function() { return item.number + '.pdf'; } };
    }

    appendRegistryRow_(sheet, buildRegistryRow_(data, file, now, 'sí', 'Recuperada manualmente (no estaba en el registro)'));
    duplicateIndex[key] = true;
    results.push({ number: item.number, status: 'anadida' });
  });

  rebuildMonthlyPurchasesSummary_(sheet);
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function ocrFileToText_(file) {
  const tempName = 'OCR_TMP_' + file.getName() + '_' + new Date().getTime();
  const resource = {
    name: tempName,
    mimeType: MimeType.GOOGLE_DOCS
  };

  const tempDoc = Drive.Files.copy(resource, file.getId(), {
    ocrLanguage: GONSOL_CONFIG.ocrLanguage,
    supportsAllDrives: true
  });

  Utilities.sleep(1500);

  try {
    const doc = DocumentApp.openById(tempDoc.id);
    return normalizeText_(doc.getBody().getText());
  } finally {
    DriveApp.getFileById(tempDoc.id).setTrashed(true);
  }
}

function extractPurchaseInvoiceData_(text, originalFileName) {
  const clean = normalizeText_(text);
  const upper = clean.toUpperCase();
  const profile = detectSupplier_(upper, originalFileName);

  const date = extractDate_(clean, originalFileName);
  const total = extractTotal_(clean);
  const tax = extractTax_(clean, total, profile ? profile.defaultIva : '');
  const provider = profile ? profile.name : extractProvider_(clean, upper, originalFileName);
  const nif = extractSupplierNif_(upper, profile);
  const invoiceNumber = extractInvoiceNumber_(clean, upper, profile);

  let concept = extractConcept_(upper);
  if ((!concept || concept === 'Compra') && profile && profile.defaultConcept) {
    concept = profile.defaultConcept;
  }
  let category = classifyPurchaseCategory_(upper);
  if (!category && profile && profile.defaultCategory) {
    category = profile.defaultCategory;
  }

  const year = date ? String(date.getFullYear()) : '';
  const month = date ? GONSOL_MONTHS[date.getMonth()] : '';
  const quarter = date ? 'T' + (Math.floor(date.getMonth() / 3) + 1) : '';

  const supplierKnown = !!profile;
  const missing = [];
  if (!date) missing.push('fecha');
  if (!provider) missing.push('proveedor');
  if (!invoiceNumber) missing.push('numero');
  if (!total) missing.push('total');

  // Para proveedores conocidos basta con fecha + total para registrar:
  // el numero puede faltar (se marca en observaciones) y aun asi entra en la hoja.
  const requiresReview = supplierKnown ? (!date || !total) : (missing.length > 0);

  const confidence = calculateConfidence_(missing, nif, tax.base, category, supplierKnown);

  let observations = '';
  if (missing.length) {
    observations = 'Faltan datos: ' + missing.join(', ');
  }
  if (supplierKnown && !requiresReview && missing.length) {
    observations = 'Proveedor reconocido (' + profile.key + '). Revisar: ' + missing.join(', ');
  }

  return {
    date: date,
    dateText: date ? formatDate_(date) : '',
    type: 'compra',
    subtype: 'factura',
    invoiceNumber: invoiceNumber || '',
    provider: provider || '',
    nif: nif || '',
    concept: concept || 'Compra',
    category: category || 'Materia prima',
    base: tax.base || '',
    ivaPercent: tax.ivaPercent || '',
    ivaAmount: tax.ivaAmount || '',
    total: total || '',
    status: GONSOL_CONFIG.paidStatus,
    paymentMethod: '',
    month: month,
    quarter: quarter,
    year: year,
    confidence: confidence,
    requiresReview: requiresReview,
    observations: observations
  };
}

function detectSupplier_(upper, fileName) {
  const upperFileName = String(fileName || '').toUpperCase();
  // Version compacta del texto (solo letras/numeros): el OCR a menudo devuelve el
  // NIF con puntos, guiones o espacios ("B-42.743.211") y el test literal fallaba.
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i < GONSOL_SUPPLIERS.length; i++) {
    const supplier = GONSOL_SUPPLIERS[i];
    if (supplier.detect(upper, upperFileName)) return supplier;
    if (supplier.nif && compact.indexOf(supplier.nif) !== -1) return supplier;
  }
  return null;
}

function extractSupplierNif_(upper, profile) {
  // Si conocemos el proveedor, su NIF es la fuente mas fiable.
  if (profile && profile.nif) return profile.nif;

  const found = [];
  const regex = /\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/g;
  let match;
  while ((match = regex.exec(upper)) !== null) {
    found.push(match[1]);
  }
  // Segunda pasada sobre el texto compactado: captura NIF con separadores
  // ("B-42.743.211", "B 42743211") que la primera pasada no ve.
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  const compactRegex = /([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J])/g;
  while ((match = compactRegex.exec(compact)) !== null) {
    if (found.indexOf(match[1]) === -1) found.push(match[1]);
  }
  // Descarta los NIF propios (cliente) para no confundirlos con el proveedor.
  const filtered = found.filter(function(nif) {
    return GONSOL_CLIENT_NIFS.indexOf(nif) === -1;
  });
  return filtered[0] || found[0] || '';
}

function extractDate_(text, fileName) {
  // Preferimos la fecha de emision (junto a "FECHA"), no la de vencimiento o lote.
  const near = text.match(/FECHA[^\d]{0,15}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/i);
  if (near) {
    const issueDate = new Date(Number(near[3]), Number(near[2]) - 1, Number(near[1]));
    if (isValidDate_(issueDate)) return issueDate;
  }

  const candidates = [];
  const sources = [text, fileName || ''];
  sources.forEach(function(source) {
    const patterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/g,
      /(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
      /(\d{1,2})\s+(ene|enero|feb|febrero|mar|marzo|abr|abril|may|mayo|jun|junio|jul|julio|ago|agosto|sep|septiembre|oct|octubre|nov|noviembre|dic|diciembre)\s+(20\d{2})/gi
    ];

    let match;
    while ((match = patterns[0].exec(source)) !== null) {
      candidates.push(new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    }
    while ((match = patterns[1].exec(source)) !== null) {
      candidates.push(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
    while ((match = patterns[2].exec(source)) !== null) {
      candidates.push(new Date(Number(match[3]), monthNameToNumber_(match[2]), Number(match[1])));
    }
  });

  return candidates.filter(isValidDate_)[0] || null;
}

function extractTotal_(text) {
  // Preferimos el importe etiquetado como TOTAL FACTURA / TOTAL A PAGAR
  // (evita coger por error el numero de unidades o el "Bruto").
  const labeled = text.match(/(?:TOTAL\s*FACTURA|IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/i);
  if (labeled) {
    const labeledValue = parseMoney_(labeled[1]);
    if (labeledValue !== '') return labeledValue;
  }
  const patterns = [
    /(?:TOTAL\s*(?:FACTURA)?|IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi,
    /(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*(?:EUR|EUROS|€)/gi
  ];
  return maxMoneyMatch_(text, patterns);
}

function extractTax_(text, total, defaultIvaPercent) {
  let ivaPercent = extractIvaPercent_(text);
  let ivaAmount = extractIvaAmount_(text);
  let base = extractBase_(text);

  // Para alimentacion el IVA habitual es 4%: si no se lee, usamos el del proveedor.
  if (ivaPercent === '' && defaultIvaPercent !== '' && defaultIvaPercent != null) {
    ivaPercent = defaultIvaPercent;
  }

  if (!base && total && ivaPercent !== '') {
    base = roundMoney_(Number(total) / (1 + Number(ivaPercent) / 100));
  }

  if (base && total) {
    const computedIva = roundMoney_(Number(total) - Number(base));
    if (!ivaAmount || ivaAmount >= Number(base) * 0.5 || Math.abs(Number(ivaAmount) - computedIva) > 0.05) {
      ivaAmount = computedIva;
    }
    if (ivaPercent === '') {
      ivaPercent = inferIvaPercent_(base, total);
    }
  }

  return {
    base: base,
    ivaPercent: ivaPercent,
    ivaAmount: ivaAmount || (base && total ? roundMoney_(Number(total) - Number(base)) : '')
  };
}

function inferIvaPercent_(base, total) {
  if (!base || !total) return '';
  const calculated = ((Number(total) / Number(base)) - 1) * 100;
  const commonRates = [4, 10, 21];
  for (let i = 0; i < commonRates.length; i++) {
    if (Math.abs(calculated - commonRates[i]) <= 0.35) return commonRates[i];
  }
  return roundMoney_(calculated);
}

function extractBase_(text) {
  const patterns = [
    /(?:BASE\s*IMPONIBLE|BI|BASE)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi,
    /(?:SUBTOTAL|IMPORTE\s*NETO)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi
  ];
  return maxMoneyMatch_(text, patterns);
}

function extractIvaAmount_(text) {
  const patterns = [
    /(?:CUOTA\s*IVA|IVA)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi
  ];
  return maxMoneyMatch_(text, patterns);
}

function extractIvaPercent_(text) {
  const match = text.match(/(?:IVA|I\.V\.A\.)[^\d]{0,20}(4|10|21)(?:[,.]00)?\s*%/i)
    || text.match(/\b(4|10|21)(?:[,.]00)?\s*%\s*(?:IVA|I\.V\.A\.)/i);
  return match ? Number(match[1]) : '';
}

function extractProvider_(text, upper, fileName) {
  if (/GAYCA|FRUTAS\s+Y\s+PATATAS/i.test(upper) || /FRUTGAYCAZ|FRITGAYCAZ|FRUTGAYCA/i.test(fileName || '')) {
    return 'FRUTAS Y PATATAS GAYCA, S.A.';
  }

  const lines = text.split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    // Se saltan las lineas de texto legal/registral que el OCR confunde con el nombre
    // ("Empresa inscrita en el Registro Mercantil...", "Tomo... Folio... Hoja...").
    if (/INSCRITA|REGISTRO\s+MERCANTIL|TOMO\s|FOLIO\s|HOJA\s|DOMICILIO\s+SOCIAL/i.test(line)) continue;
    if (line.length >= 4 && /[A-ZÁÉÍÓÚÑ]/.test(line) && !/FACTURA|ALBARAN|FECHA|NIF|CIF/i.test(line)) {
      return cleanName_(line);
    }
  }
  return cleanName_((fileName || '').replace(/\.[^.]+$/, ''));
}

function extractNif_(upper) {
  const match = upper.match(/\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J])\b/)
    || upper.match(/\b(\d{8}[A-Z])\b/);
  return match ? match[1] : '';
}

function extractInvoiceNumber_(text, upper, profile) {
  // Extractor especifico del proveedor (mas fiable que las reglas genericas).
  if (profile && typeof profile.invoiceNumber === 'function') {
    const specific = profile.invoiceNumber(text, upper);
    if (specific) return sanitizeInvoiceNumber_(specific);
  }

  const patterns = [
    /(?:FACTURA|N[ºO]\s*FACTURA|NUM(?:ERO)?\s*FACTURA|SERIE\s*\/?\s*N[ºO])[:\s#-]{0,12}([A-Z0-9][A-Z0-9\/._-]{3,})/i,
    /\b(FV[A-Z0-9\/._-]{4,})\b/i,
    /\b(FAC[-\/]?\d{1,6}[-\/]?\d{0,4})\b/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]) || upper.match(patterns[i]);
    if (match) return sanitizeInvoiceNumber_(match[1]);
  }
  return '';
}

function extractConcept_(upper) {
  if (/PATATA|AGRIA|MONALISA|KENNEBEC/.test(upper)) return 'PATATAS AGRIA';
  if (/BOLSA|ENVASE|VACIO|VACÍO/.test(upper)) return 'ENVASES';
  if (/CAJA|LIMPIEZA|CONSUMIBLE/.test(upper)) return 'MATERIAL AUXILIAR';
  return 'Compra';
}

function classifyPurchaseCategory_(upper) {
  if (/PATATA|AGRIA|MONALISA|KENNEBEC|FRUTA|VERDURA/.test(upper)) return 'Materia prima';
  if (/BOLSA|ENVASE|VACIO|VACÍO|PLASTICO|PLÁSTICO/.test(upper)) return 'Envases';
  if (/CAJA|LIMPIEZA|CONSUMIBLE|GUANTE|ETIQUETA/.test(upper)) return 'Material auxiliar';
  return 'Materia prima';
}

function buildRegistryRow_(data, file, registeredAt, reviewed, observations) {
  return [
    data.dateText,
    Utilities.formatDate(registeredAt, 'Europe/Madrid', 'dd/MM/yyyy HH:mm:ss'),
    data.type,
    data.subtype,
    data.invoiceNumber,
    data.provider,
    data.nif,
    data.concept,
    data.category,
    toSpanishMoney_(data.base),
    data.ivaPercent,
    toSpanishMoney_(data.ivaAmount),
    toSpanishMoney_(data.total),
    data.status,
    data.paymentMethod,
    data.month,
    data.quarter,
    data.year,
    file.getUrl(),
    file.getName(),
    reviewed,
    observations || data.observations || ''
  ];
}

function appendRegistryRow_(sheet, row) {
  sheet.appendRow(row);
}

function rebuildMonthlyPurchasesSummary_(registrySheet) {
  const spreadsheet = registrySheet.getParent();
  const summarySheet = getOrCreateSheet_(spreadsheet, GONSOL_CONFIG.monthlyPurchasesSheetName);
  const values = registrySheet.getDataRange().getDisplayValues();
  const monthGroups = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (normalizeKey_(row[2]) !== 'COMPRA') continue;

    const month = row[15] || monthFromDateText_(row[0]);
    const year = row[17] || yearFromDateText_(row[0]);
    if (!month || !year) continue;

    const key = year + '-' + month;
    if (!monthGroups[key]) {
      monthGroups[key] = {
        year: year,
        month: month,
        rows: [],
        baseTotal: 0,
        ivaTotal: 0,
        finalTotal: 0
      };
    }

    const base = parseMoney_(row[9]) || 0;
    const iva = parseMoney_(row[11]) || 0;
    const total = parseMoney_(row[12]) || 0;

    monthGroups[key].rows.push([
      row[0],
      row[4],
      row[5],
      row[7],
      row[8],
      toSpanishMoney_(base),
      row[10],
      toSpanishMoney_(iva),
      toSpanishMoney_(total),
      row[18],
      row[19]
    ]);
    monthGroups[key].baseTotal += base;
    monthGroups[key].ivaTotal += iva;
    monthGroups[key].finalTotal += total;
  }

  const output = [[
    'Resumen mensual de compras',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Actualizado',
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm:ss')
  ]];

  const sortedKeys = Object.keys(monthGroups).sort();
  sortedKeys.forEach(function(key) {
    const group = monthGroups[key];
    output.push(['']);
    output.push([group.month + ' ' + group.year]);
    output.push([
      'Fecha documento',
      'Serie / Nº',
      'Proveedor',
      'Concepto',
      'Categoría',
      'Base imponible',
      'IVA %',
      'Cuota IVA',
      'Total',
      'Ruta / enlace Drive',
      'Nombre archivo'
    ]);
    group.rows.sort(function(a, b) {
      return String(a[0]).localeCompare(String(b[0]));
    }).forEach(function(row) {
      output.push(row);
    });
    output.push([
      'TOTAL ' + group.month,
      '',
      '',
      '',
      '',
      toSpanishMoney_(group.baseTotal),
      '',
      toSpanishMoney_(group.ivaTotal),
      toSpanishMoney_(group.finalTotal),
      '',
      ''
    ]);
  });

  summarySheet.clear();
  if (output.length) {
    summarySheet.getRange(1, 1, output.length, 11).setValues(padRows_(output, 11));
  }
  formatMonthlyPurchasesSummary_(summarySheet, output.length);
}

function buildDuplicateIndex_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const index = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const provider = row[5];
    const invoiceNumber = row[4];
    const total = parseMoney_(row[12]);
    const key = makeDuplicateKey_(provider, invoiceNumber, total);
    if (key !== '||') index[key] = true;
  }
  return index;
}

function makeDuplicateKey_(provider, invoiceNumber, total) {
  return [
    normalizeKey_(provider),
    normalizeKey_(invoiceNumber),
    total === '' ? '' : Number(total).toFixed(2)
  ].join('|');
}

function getDestinationFolder_(year, quarter, month) {
  const purchasesRoot = DriveApp.getFolderById(GONSOL_CONFIG.purchasesRootFolderId);
  const yearFolder = getOrCreateChildFolder_(purchasesRoot, String(year));
  const quarterFolder = getOrCreateChildFolder_(yearFolder, quarter);
  if (!month) return quarterFolder;
  return getOrCreateChildFolder_(quarterFolder, month);
}

function getOrCreateChildFolder_(parentFolder, childName) {
  const folders = parentFolder.getFoldersByName(childName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(childName);
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function formatMonthlyPurchasesSummary_(sheet, rowCount) {
  if (rowCount < 1) return;

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 11)
    .setFontWeight('bold')
    .setBackground('#1f4e79')
    .setFontColor('#ffffff');

  const values = sheet.getRange(1, 1, rowCount, 11).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    const rowNumber = i + 1;
    const firstCell = values[i][0];
    if (/^\d{2}_[A-ZÁÉÍÓÚÑ]+ \d{4}$/.test(firstCell)) {
      sheet.getRange(rowNumber, 1, 1, 11)
        .mergeAcross()
        .setFontWeight('bold')
        .setBackground('#d9eaf7')
        .setFontColor('#000000');
    } else if (firstCell === 'Fecha documento') {
      sheet.getRange(rowNumber, 1, 1, 11)
        .setFontWeight('bold')
        .setBackground('#eeeeee');
    } else if (String(firstCell).indexOf('TOTAL ') === 0) {
      sheet.getRange(rowNumber, 1, 1, 11)
        .setFontWeight('bold')
        .setBackground('#fff2cc');
    }
  }

  sheet.getRange(1, 6, rowCount, 1).setNumberFormat('#,##0.00');
  sheet.getRange(1, 8, rowCount, 1).setNumberFormat('#,##0.00');
  sheet.getRange(1, 9, rowCount, 1).setNumberFormat('#,##0.00');
  sheet.autoResizeColumns(1, 11);
}

function padRows_(rows, width) {
  return rows.map(function(row) {
    const copy = row.slice();
    while (copy.length < width) copy.push('');
    return copy.slice(0, width);
  });
}

function monthFromDateText_(dateText) {
  const date = parseRegistryDate_(dateText);
  return date ? GONSOL_MONTHS[date.getMonth()] : '';
}

function yearFromDateText_(dateText) {
  const date = parseRegistryDate_(dateText);
  return date ? String(date.getFullYear()) : '';
}

function parseRegistryDate_(dateText) {
  const text = String(dateText || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return null;
}

function moveFileToFolder_(file, destinationFolder) {
  file.moveTo(destinationFolder);
}

function buildPurchaseFileName_(data) {
  const provider = slugFilePart_(shortProviderName_(data.provider));
  const number = slugFilePart_(data.invoiceNumber);
  const total = toSpanishMoney_(data.total);
  return data.dateText + '_FACTURA_COMPRA_' + provider + '_' + number + '_' + total + '.pdf';
}

function shortProviderName_(provider) {
  if (/GAYCA/i.test(provider)) return 'GAYCA';
  return provider || 'PROVEEDOR';
}

function isSupportedInvoiceFile_(file) {
  const mime = file.getMimeType();
  return [
    MimeType.PDF,
    MimeType.JPEG,
    MimeType.PNG,
    MimeType.GIF,
    MimeType.TIFF
  ].indexOf(mime) !== -1;
}

function deleteTriggersForFunction_(functionName) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function maxMoneyMatch_(text, patterns) {
  const amounts = [];
  patterns.forEach(function(pattern) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const amount = parseMoney_(match[1]);
      if (amount !== '') amounts.push(amount);
    }
  });
  if (!amounts.length) return '';
  return roundMoney_(Math.max.apply(null, amounts));
}

function parseMoney_(value) {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? roundMoney_(number) : '';
}

function toSpanishMoney_(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toFixed(2).replace('.', ',');
}

function roundMoney_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatDate_(date) {
  return Utilities.formatDate(date, 'Europe/Madrid', 'yyyy-MM-dd');
}

function isValidDate_(date) {
  return date instanceof Date && !isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100;
}

function monthNameToNumber_(name) {
  const normalized = String(name).toLowerCase();
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const longNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const index = longNames.indexOf(normalized);
  if (index >= 0) return index;
  return names.indexOf(normalized.slice(0, 3));
}

function calculateConfidence_(missing, nif, base, category, supplierKnown) {
  let confidence = 1;
  confidence -= missing.length * 0.18;
  if (!nif) confidence -= 0.07;
  if (!base) confidence -= 0.08;
  if (!category) confidence -= 0.05;
  // Proveedor reconocido: proveedor y NIF son fiables, sube la confianza.
  if (supplierKnown) confidence += 0.2;
  return Math.max(0, Math.min(1, roundMoney_(confidence)));
}

function normalizeText_(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeKey_(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}

function cleanName_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-zÁÉÍÓÚÜÑ0-9]+|[^A-Za-zÁÉÍÓÚÜÑ0-9.]+$/g, '')
    .trim();
}

function sanitizeInvoiceNumber_(value) {
  return String(value || '')
    .replace(/[^\w\/.-]/g, '')
    .replace(/_{2,}/g, '_')
    .toUpperCase();
}

function slugFilePart_(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}
